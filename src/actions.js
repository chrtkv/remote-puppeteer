import logger from './logger.js';

const DEFAULT_TIMEOUT = 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check whether a URL contains any of the given substrings
 * @param {string} url - URL to check
 * @param {string|Array<string>} patterns - Substring or list of substrings
 * @returns {boolean}
 */
export function urlMatches(url, patterns) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  return list.some((pattern) => url.includes(pattern));
}

/**
 * Start waiting for a response before the step that triggers it
 * @param {import('puppeteer').Page} page - Page
 * @param {Object} options - { urlIncludes, status, timeout }
 * @returns {Promise<import('puppeteer').HTTPResponse>}
 */
function waitForMatchingResponse(page, { urlIncludes, status, timeout = DEFAULT_TIMEOUT }) {
  return page.waitForResponse((response) => urlMatches(response.url(), urlIncludes) && (status === undefined || response.status() === status), { timeout });
}

/**
 * Click an element the way a user would reach it: scroll it into view, then click it in the page
 * @param {import('puppeteer').Page} page - Page
 * @param {string} selector - CSS selector
 * @returns {Promise<void>}
 */
async function clickInPage(page, selector) {
  const found = await page.evaluate((sel) => {
    const element = document.querySelector(sel);
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

const handlers = {
  waitForSelector: (page, { selector, visible = true, timeout = DEFAULT_TIMEOUT }) => page.waitForSelector(selector, { visible,
    timeout }),

  wait: ({ ms = 1000 } = {}) => sleep(ms),

  async click(page, { selector, waitForResponse }) {
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
      logger.info(`No matching response after clicking ${selector}: ${error.message}`);
    }
  },

  waitForResponse: (page, options) => waitForMatchingResponse(page, options),

  waitForNetworkIdle: (page, { idleTime = 500, timeout = DEFAULT_TIMEOUT }) => page.waitForNetworkIdle({ idleTime,
    timeout }),
};

export const ACTION_TYPES = Object.keys(handlers);

/**
 * Reject unknown action types before the browser is touched
 * @param {Array<Object>} actions - Actions from the request
 * @returns {void}
 */
export function validateActions(actions) {
  if (!Array.isArray(actions)) {
    throw new Error('actions must be an array');
  }

  actions.forEach((action, index) => {
    if (!action || !handlers[action.type]) {
      throw new Error(`actions[${index}]: unknown type ${action?.type}, expected one of ${ACTION_TYPES.join(', ')}`);
    }
  });
}

/**
 * Run actions on a page one after another
 * @param {import('puppeteer').Page} page - Page after navigation
 * @param {Array<Object>} actions - [{ type, optional, ...options }]
 * @param {(index: number) => void} onStep - Called with the index of the action about to run
 * @returns {Promise<Array<Object>>} - Per-action report: { type, ok, ms, error }
 */
export async function runActions(page, actions, onStep) {
  const report = [];

  for (const [index, action] of actions.entries()) {
    const { type, optional = false, ...options } = action;
    const startedAt = Date.now();
    onStep(index);

    try {
      const handler = handlers[type];
      await (type === 'wait' ? handler(options) : handler(page, options));
      report.push({ type,
        ok: true,
        ms: Date.now() - startedAt });
    } catch (error) {
      report.push({ type,
        ok: false,
        ms: Date.now() - startedAt,
        error: error.message });
      if (!optional) {
        const failure = new Error(`actions[${index}] ${type} failed: ${error.message}`);
        failure.actions = report;
        throw failure;
      }
      logger.info(`Optional action ${index} (${type}) failed: ${error.message}`);
    }
  }

  return report;
}
