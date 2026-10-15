import { acquireBrowser, releaseBrowser, getCurrentProxy } from './browser.js';
import { runActions, urlMatches, validateActions } from './actions.js';
import logger from './logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const DEFAULT_BLOCKED_RESOURCES = ['image', 'stylesheet', 'font'];

/**
 * Navigate a page with given parameters
 * @param {Object} params - Navigation parameters
 * @param {string} params.url - URL to navigate to
 * @param {Object} [params.headers] - HTTP headers
 * @param {Array<Object>} [params.cookies] - Cookies (e.g., [{ name, value, domain, path }])
 * @param {string} [params.userAgent] - Custom user agent
 * @param {Object} [params.viewport] - Viewport settings (e.g., { width, height })
 * @param {string} [params.waitUntil] - Navigation wait condition (e.g., 'networkidle2')
 * @param {number} [params.timeout] - Navigation timeout in ms
 * @param {Object} [params.pageOptions] - Additional Puppeteer page options
 * @param {Array<Object>} [params.actions] - Steps after navigation, see actions.js
 * @param {Object} [params.capture] - Record requests: { urlIncludes, methods }
 * @param {Array<string>} [params.blockResources] - Resource types to abort
 * @param {boolean} [params.returnContent] - Return the page HTML
 * @returns {Promise<Object>} - Response data: { status, url, cookies, content, requests, actions }
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
} = {}) {
  if (!url) {
    logger.error('URL is required');
    throw new Error('URL is required');
  }
  validateActions(actions);

  logger.info(`Navigating to URL: ${url}`);

  const browser = await acquireBrowser();
  logger.info(`Browser initialized for ${url}`);

  let context;
  let page;
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

    // -1 while the page loads, then the index of the action that was running when a request went out
    let step = -1;
    const requests = [];
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

    const actionReport = await runActions(page, actions, (index) => {
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
    logger.error(`Navigation failed for ${url}: ${error.message}`);
    throw error;
  } finally {
    // Close page to prevent leaks
    if (page) {
      try {
        await page.close();
        logger.info(`Closed page for ${url}`);
      } catch (error) {
        logger.error(`Failed to close page for ${url}: ${error.message}`);
      }
    }
    await releaseBrowser();
  }
}
