import type { HTTPResponse, Page } from 'puppeteer';
import logger from './logger.ts';

const DEFAULT_TIMEOUT = 15000;

export type UrlPattern = string | string[];

export interface ResponseWait {
  urlIncludes: UrlPattern;
  status?: number;
  timeout?: number;
  optional?: boolean;
}

interface ActionBase {

  /** Log a failure and carry on instead of failing the request */
  optional?: boolean;
}

interface WaitForSelectorAction extends ActionBase {
  type: 'waitForSelector';
  selector: string;
  visible?: boolean;
  timeout?: number;
}

interface WaitAction extends ActionBase {
  type: 'wait';
  ms?: number;
}

interface ClickAction extends ActionBase {
  type: 'click';
  selector: string;
  waitForResponse?: ResponseWait;
}

interface WaitForResponseAction extends ResponseWait {
  type: 'waitForResponse';
}

interface WaitForNetworkIdleAction extends ActionBase {
  type: 'waitForNetworkIdle';
  idleTime?: number;
  timeout?: number;
}

export type Action = WaitForSelectorAction | WaitAction | ClickAction | WaitForResponseAction | WaitForNetworkIdleAction;

export interface ActionReport {
  type: Action['type'];
  ok: boolean;
  ms: number;
  error?: string;
}

/** An action that failed, with the report of every action run up to and including it */
export class ActionError extends Error {
  readonly actions: ActionReport[];

  constructor(message: string, actions: ActionReport[]) {
    super(message);
    this.name = 'ActionError';
    this.actions = actions;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check whether a URL contains any of the given substrings
 */
export function urlMatches(url: string, patterns: UrlPattern): boolean {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((pattern) => url.includes(pattern));
}

/**
 * Start waiting for a response before the step that triggers it
 */
function waitForMatchingResponse(page: Page, { urlIncludes, status, timeout = DEFAULT_TIMEOUT }: ResponseWait): Promise<HTTPResponse> {
  return page.waitForResponse((response) => urlMatches(response.url(), urlIncludes) && (status === undefined || response.status() === status), { timeout });
}

/**
 * Click an element the way a user would reach it: scroll it into view, then click it in the page
 */
async function clickInPage(page: Page, selector: string): Promise<void> {
  const found = await page.evaluate((sel) => {
    const element = document.querySelector<HTMLElement>(sel);
    if (!element) {
      return false;
    }
    element.scrollIntoView({ block: 'center' });
    element.click();
    return true;
  }, selector);

  if (!found) {
    throw new Error(`Element not found: ${selector}`);
  }
}

async function click(page: Page, selector: string, waitForResponse?: ResponseWait): Promise<void> {
  if (!waitForResponse) {
    await clickInPage(page, selector);
    return;
  }

  const responsePromise = waitForMatchingResponse(page, waitForResponse);
  // Keep a timeout from surfacing as an unhandled rejection while the click is still running
  responsePromise.catch(() => {});

  await clickInPage(page, selector);

  try {
    await responsePromise;
  } catch (error) {
    if (!waitForResponse.optional) {
      throw error;
    }
    logger.info(`No matching response after clicking ${selector}: ${(error as Error).message}`);
  }
}

async function runAction(page: Page, action: Action): Promise<void> {
  switch (action.type) {
    case 'waitForSelector':
      await page.waitForSelector(action.selector, { visible: action.visible ?? true,
        timeout: action.timeout ?? DEFAULT_TIMEOUT });
      return;
    case 'wait':
      await sleep(action.ms ?? 1000);
      return;
    case 'click':
      await click(page, action.selector, action.waitForResponse);
      return;
    case 'waitForResponse':
      await waitForMatchingResponse(page, action);
      return;
    case 'waitForNetworkIdle':
      await page.waitForNetworkIdle({ idleTime: action.idleTime ?? 500,
        timeout: action.timeout ?? DEFAULT_TIMEOUT });
  }
}

export const ACTION_TYPES: ReadonlyArray<Action['type']> = [
  'waitForSelector',
  'wait',
  'click',
  'waitForResponse',
  'waitForNetworkIdle',
];

/**
 * Reject unknown action types before the browser is touched
 */
export function validateActions(actions: unknown): asserts actions is Action[] {
  if (!Array.isArray(actions)) {
    throw new Error('actions must be an array');
  }

  actions.forEach((action, index) => {
    if (!ACTION_TYPES.includes(action?.type)) {
      throw new Error(`actions[${index}]: unknown type ${action?.type}, expected one of ${ACTION_TYPES.join(', ')}`);
    }
  });
}

/**
 * Run actions on a page one after another
 * @param page - Page after navigation
 * @param actions - Actions to run; a failure stops the run unless the action is optional
 * @param onStep - Called with the index of the action about to run
 * @returns Per-action report
 */
export async function runActions(page: Page, actions: Action[], onStep: (index: number) => void): Promise<ActionReport[]> {
  const report: ActionReport[] = [];

  for (const [index, action] of actions.entries()) {
    const startedAt = Date.now();
    onStep(index);

    try {
      await runAction(page, action);
      report.push({ type: action.type,
        ok: true,
        ms: Date.now() - startedAt });
    } catch (error) {
      const message = (error as Error).message;
      report.push({ type: action.type,
        ok: false,
        ms: Date.now() - startedAt,
        error: message });
      if (!action.optional) {
        throw new ActionError(`actions[${index}] ${action.type} failed: ${message}`, report);
      }
      logger.info(`Optional action ${index} (${action.type}) failed: ${message}`);
    }
  }

  return report;
}
