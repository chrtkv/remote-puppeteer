import { initializeBrowser, incrementRequestCount, getCurrentProxy } from './browser.js';
import logger from './logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

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
 * @returns {Promise<Object>} - Response data: { status, url, content }
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
} = {}) {
  if (!url) {
    logger.error('URL is required');
    throw new Error('URL is required');
  }

  logger.info(`Navigating to URL: ${url}`);

  // Increment request count and check if browser needs restart
  try {
    await incrementRequestCount();
  } catch (error) {
    logger.error(`Failed to increment request count for ${url}: ${error.message}`);
    throw error;
  }

  let browser;
  let context;
  let page;
  try {
    browser = await initializeBrowser();
    logger.info(`Browser initialized for ${url}`);
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

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font'].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    logger.info(`Navigating to ${url} with waitUntil: ${waitUntil}, timeout: ${timeout}`);
    const response = await page.goto(url, {
      waitUntil,
      timeout,
      ...pageOptions.navigation,
    });

    // Get page content (HTML)
    const content = await page.content();
    logger.info(`Retrieved content for ${url}`);

    const receivedCookies = await context.cookies();
    logger.debug(`Retrieved ${receivedCookies.length} cookies for ${url}`);

    return {
      status: response.status(),
      url: response.url(),
      cookies: receivedCookies,
      content,
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
  }
}
