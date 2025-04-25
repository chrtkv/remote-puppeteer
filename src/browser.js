import puppeteer from 'puppeteer';
import logger from './logger.js';
import { getNextProxy, getCurrentProxy, resetProxyRotation } from './proxy.js';

let browser = null;
let requestCount = 0;
let isRestarting = false;
const MAX_REQUESTS = 40;
const CLOSE_TIMEOUT = 10000;

/**
 * Initialize or reuse a Puppeteer browser instance
 * @param {Object} [options] - Browser launch options
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
export async function initializeBrowser(options = {}) {
  try {
    if (browser && getCurrentProxy()) {
      return browser;
    }

    // Close existing browser if switching proxies
    if (browser) {
      await closeBrowser();
    }

    // Select the next proxy
    const proxy = getNextProxy();
    const proxyServer = proxy ? `${proxy.host}:${proxy.port}` : null;

    logger.info(`Launching new browser instance ${proxyServer ? `with proxy ${proxy.url}` : 'without proxy'}`);
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
      ],
      executablePath: process.env.CHROMIUM_PATH || undefined,
      ...options,
    });

    browser.on('disconnected', () => {
      logger.warn('Browser disconnected, resetting instance');
      browser = null;
      requestCount = 0;
      isRestarting = false;
      resetProxyRotation();
    });

    return browser;
  } catch (error) {
    logger.error(`Failed to initialize browser: ${error.message}`);
    throw error;
  }
}

/**
 * Close the browser instance with a timeout
 * @returns {Promise<void>}
 */
export async function closeBrowser() {
  try {
    if (browser) {
      logger.info('Closing browser instance');

      // Close all pages and contexts
      const pages = await browser.pages();
      logger.info(`Closing ${pages.length} open pages`);
      await Promise.all(
        pages.map(async (page) => {
          try {
            await page.close();
            logger.debug(`Closed page: ${page.url()}`);
          } catch (error) {
            logger.error(`Failed to close page: ${error.message}`);
          }
        })
      );

      const contexts = browser.browserContexts();
      logger.info(`Closing ${contexts.length - 1} additional browser contexts`);
      await Promise.all(
        contexts.map(async (context, index) => {
          if (index === 0) return; // Skip default context
          try {
            await context.close();
            logger.debug('Closed browser context');
          } catch (error) {
            logger.error(`Failed to close browser context: ${error.message}`);
          }
        })
      );

      // Close browser with timeout
      const closePromise = browser.close();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Browser close timed out')), CLOSE_TIMEOUT)
      );
      await Promise.race([closePromise, timeoutPromise]);
      logger.info('Browser closed successfully');
    }
    browser = null;
    requestCount = 0;
    isRestarting = false;
    resetProxyRotation();
  } catch (error) {
    logger.error(`Failed to close browser: ${error.message}`);
    if (browser) {
      try {
        logger.warn('Forcing browser process termination');
        browser.process().kill('SIGTERM');
      } catch (killError) {
        logger.error(`Failed to kill browser process: ${killError.message}`);
      }
    }
    browser = null;
    requestCount = 0;
    isRestarting = false;
    resetProxyRotation();
  }
}

/**
 * Increment request count and check if browser needs restart
 * @returns {Promise<void>}
 */
export async function incrementRequestCount() {
  try {
    if (isRestarting) {
      logger.info('Waiting for browser restart to complete');
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait and retry
      return incrementRequestCount(); // Retry after delay
    }

    requestCount++;
    logger.info(`Request count incremented to: ${requestCount}`);
    if (requestCount >= MAX_REQUESTS) {
      logger.info('Max requests reached, initiating browser restart with proxy rotation');
      isRestarting = true;
      await closeBrowser();
      logger.info('Browser restart completed');
    }
  } catch (error) {
    logger.error(`Failed to increment request count: ${error.message}`);
    isRestarting = false;
    throw error;
  }
}

/**
 * Get the current proxy (exported for page.js)
 * @returns {Object|null} - Current proxy details
 */
export { getCurrentProxy };
