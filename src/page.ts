import type { BrowserContext, CookieData, GoToOptions, Page, ResourceType, Viewport } from 'puppeteer';
import { acquireBrowser, releaseBrowser, getCurrentProxy } from './browser.ts';
import { runActions, urlMatches, validateActions, type Action, type ActionReport, type UrlPattern } from './actions.ts';
import logger from './logger.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DEFAULT_BLOCKED_RESOURCES: ResourceType[] = ['image', 'stylesheet', 'font'];

export interface CaptureOptions {
  urlIncludes: UrlPattern;
  methods?: string[];
}

export interface NavigateParams {
  url?: string;
  headers?: Record<string, string>;
  cookies?: CookieData[];
  userAgent?: string;
  viewport?: Viewport;
  waitUntil?: GoToOptions['waitUntil'];
  timeout?: number;
  pageOptions?: { cacheEnabled?: boolean;
    navigation?: GoToOptions; };
  actions?: Action[];
  capture?: CaptureOptions;
  blockResources?: ResourceType[];
  returnContent?: boolean;
}

export interface CapturedRequest {
  url: string;
  method: string;
  resourceType: ResourceType;
  postData: string | null;

  /** -1 while the page loads, then the index of the action that was running */
  step: number;
  timestamp: number;
}

/**
 * Navigate a page with given parameters
 * @returns Response data: { status, url, cookies, content, requests, actions }
 */
export async function navigatePage({
  url,
  headers = {},
  cookies = [],
  userAgent,
  viewport,
  waitUntil = 'networkidle2',
  timeout = 30000,
  pageOptions = {},
  actions = [],
  capture,
  blockResources = DEFAULT_BLOCKED_RESOURCES,
  returnContent = true,
}: NavigateParams = {}) {
  if (!url) {
    logger.error('URL is required');
    throw new Error('URL is required');
  }
  validateActions(actions);

  logger.info(`Navigating to URL: ${url}`);

  const browser = await acquireBrowser();
  logger.info(`Browser initialized for ${url}`);

  let context: BrowserContext;
  let page: Page | undefined;
  try {
    context = browser.defaultBrowserContext();
    page = await context.newPage();
    logger.info(`New page created for ${url}`);

    // Handle proxy authentication
    const proxy = getCurrentProxy();
    if (proxy && proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password,
      });
      logger.debug(`Set proxy authentication for ${url}: ${proxy.url}`);
    }

    if (userAgent) {
      await page.setUserAgent(userAgent);
      logger.debug(`Set user agent for ${url}: ${userAgent}`);
    }

    if (Object.keys(headers).length > 0) {
      await page.setExtraHTTPHeaders(headers);
      logger.debug(`Set headers for ${url}`);
    }

    if (cookies.length > 0) {
      await context.setCookie(...cookies);
      logger.debug(`Set ${cookies.length} cookies for ${url}`);
    }

    if (viewport) {
      await page.setViewport(viewport);
      logger.debug(`Set viewport for ${url}: ${JSON.stringify(viewport)}`);
    }

    await page.setCacheEnabled(pageOptions.cacheEnabled ?? true);

    let step = -1;
    const requests: CapturedRequest[] = [];
    if (capture?.urlIncludes) {
      const methods = capture.methods?.map((method) => method.toUpperCase());
      page.on('request', (request) => {
        const method = request.method();
        if (method === 'OPTIONS' || methods && !methods.includes(method)) {
          return;
        }
        if (urlMatches(request.url(), capture.urlIncludes)) {
          requests.push({
            url: request.url(),
            method,
            resourceType: request.resourceType(),
            postData: request.postData() ?? null,
            step,
            timestamp: Date.now(),
          });
        }
      });
    }

    if (blockResources.length > 0) {
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (blockResources.includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });
    }

    logger.info(`Navigating to ${url} with waitUntil: ${waitUntil}, timeout: ${timeout}`);
    const response = await page.goto(url, {
      waitUntil,
      timeout,
      ...pageOptions.navigation,
    });
    if (!response) {
      throw new Error(`No response for ${url}`);
    }

    const actionReport: ActionReport[] = await runActions(page, actions, (index) => {
      step = index;
    });

    // Get page content (HTML)
    const content = returnContent ? await page.content() : undefined;
    logger.info(`Retrieved content for ${url}`);

    const receivedCookies = await context.cookies();
    logger.debug(`Retrieved ${receivedCookies.length} cookies for ${url}`);

    return {
      status: response.status(),
      url: response.url(),
      cookies: receivedCookies,
      content,
      ...capture?.urlIncludes ? { requests } : {},
      ...actions.length > 0 ? { actions: actionReport } : {},
    };
  } catch (error) {
    logger.error(`Navigation failed for ${url}: ${(error as Error).message}`);
    throw error;
  } finally {
    // Close page to prevent leaks
    if (page) {
      try {
        await page.close();
        logger.info(`Closed page for ${url}`);
      } catch (error) {
        logger.error(`Failed to close page for ${url}: ${(error as Error).message}`);
      }
    }
    await releaseBrowser();
  }
}
