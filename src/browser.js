import puppeteer from 'puppeteer';
import logger from './logger.js';
import { getNextProxy, getCurrentProxy } from './proxy.js';
import { config } from 'dotenv';

// Load environment variables
config();

let browser = null;
let launching = null;
let requestCount = 0;
let inFlight = 0;
let restartPending = false;
const CLOSE_TIMEOUT = 10000;
const MAX_REQUESTS_BEFORE_RELOADING = Number.parseInt(process.env.MAX_REQUESTS_BEFORE_RELOADING, 10) || 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Initialize or reuse a Puppeteer browser instance
 * @param {Object} [options] - Browser launch options
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
export async function initializeBrowser(options = {}) {
  try {
    if (browser) {
      return browser; // Reuse existing browser if already initialized
    }
    // Concurrent requests share one launch instead of starting a browser each
    launching ??= launchBrowser(options).finally(() => {
      launching = null;
    });
    return await launching;
  } catch (error) {
    logger.error(`Failed to initialize browser: ${error.message}`);
    throw error;
  }
}

/**
 * Launch a browser with the next proxy in the rotation
 * @param {Object} [options] - Browser launch options
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
async function launchBrowser(options) {
  // Select the next proxy
  const proxy = getNextProxy();
  const proxyServer = proxy ? `${proxy.host}:${proxy.port}` : null;

  logger.info(`Launching new browser instance ${proxyServer ? `with proxy ${proxy.url}` : 'without proxy'}`);
  const launched = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', ...proxyServer ? [`--proxy-server=${proxyServer}`] : []],
    executablePath: process.env.CHROMIUM_PATH || undefined,
    ...options,
  });

  launched.on('disconnected', () => {
    if (browser !== launched) {
      return;
    }
    logger.warn('Browser disconnected, resetting instance');
    browser = null;
    requestCount = 0;
  });

  browser = launched;
  return browser;
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
      await Promise.all(pages.map(async (page) => {
        try {
          await page.close();
          logger.debug(`Closed page: ${page.url()}`);
        } catch (error) {
          logger.error(`Failed to close page: ${error.message}`);
        }
      }));

      const contexts = browser.browserContexts();
      logger.info(`Closing ${contexts.length - 1} additional browser contexts`);
      await Promise.all(contexts.map(async (context, index) => {
        if (index === 0) return; // Skip default context
        try {
          await context.close();
          logger.debug('Closed browser context');
        } catch (error) {
          logger.error(`Failed to close browser context: ${error.message}`);
        }
      }));

      // Close browser with timeout
      const closePromise = browser.close();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Browser close timed out')), CLOSE_TIMEOUT));
      await Promise.race([closePromise, timeoutPromise]);
      logger.info('Browser closed successfully');
    }
    browser = null;
    requestCount = 0;
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
  }
}

/**
 * Take the browser for one request. Waits while a restart is pending, so a restart never closes the browser under
 * a running request.
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
export async function acquireBrowser() {
  while (restartPending) {
    await sleep(200);
  }

  inFlight++;
  requestCount++;
  logger.info(`Request count incremented to: ${requestCount}`);
  try {
    return await initializeBrowser();
  } catch (error) {
    await releaseBrowser();
    throw error;
  }
}

/**
 * Give the browser back after a request; restart it once the request limit is reached and nothing is running
 * @returns {Promise<void>}
 */
export async function releaseBrowser() {
  inFlight--;

  if (MAX_REQUESTS_BEFORE_RELOADING && requestCount >= MAX_REQUESTS_BEFORE_RELOADING && !restartPending) {
    logger.info('Max requests reached, browser restarts with proxy rotation once running requests finish');
    restartPending = true;
  }

  if (restartPending && inFlight === 0) {
    await closeBrowser();
    restartPending = false;
    logger.info('Browser restart completed');
  }
}

/**
 * Get the current proxy (exported for page.js)
 * @returns {Object|null} - Current proxy details
 */
export { getCurrentProxy };
