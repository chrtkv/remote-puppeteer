import puppeteer from 'puppeteer';
import { Mutex } from 'async-mutex';
import logger from './logger.js';

let browser = null;
let requestCount = 0;
const MAX_REQUESTS = 40;
const browserMutex = new Mutex();

/**
 * Initialize or reuse a Puppeteer browser instance
 * @param {Object} [options] - Browser launch options
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
export async function initializeBrowser(options = {}) {
  const release = await browserMutex.acquire();
  try {
    if (!browser) {
      logger.info('Launching new browser instance');
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.CHROMIUM_PATH || undefined,
        ...options,
      });

      browser.on('disconnected', () => {
        logger.warn('Browser disconnected, resetting instance');
        browser = null;
        requestCount = 0; // Reset count on unexpected disconnect
      });
    }
    return browser;
  } catch (error) {
    logger.error(`Failed to initialize browser: ${error.message}`);
    throw error;
  } finally {
    release();
  }
}

/**
 * Close the browser instance
 * @returns {Promise<void>}
 */
export async function closeBrowser() {
  const release = await browserMutex.acquire();
  try {
    if (browser) {
      logger.info('Closing browser instance');
      await browser.close();
      browser = null;
      requestCount = 0; // Reset count on close
    }
  } catch (error) {
    logger.error(`Failed to close browser: ${error.message}`);
    throw error;
  } finally {
    release();
  }
}

/**
 * Increment request count and check if browser needs restart
 * @returns {Promise<void>}
 */
export async function incrementRequestCount() {
  const release = await browserMutex.acquire();
  try {
    requestCount++;
    logger.info(`Request count incremented to: ${requestCount}`);
    if (requestCount >= MAX_REQUESTS) {
      logger.info('Max requests reached, restarting browser');
      await closeBrowser();
      requestCount = 0; // Ensure count is reset after restart
    }
  } catch (error) {
    logger.error(`Failed to increment request count: ${error.message}`);
    throw error;
  } finally {
    release();
  }
}
