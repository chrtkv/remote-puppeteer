import puppeteer from 'puppeteer';

let browser = null;

/**
 * Initialize or reuse a Puppeteer browser instance
 * @param {Object} [options] - Browser launch options
 * @returns {Promise<import('puppeteer').Browser>} - Browser instance
 */
export async function initializeBrowser (options = {}) {
  if (!browser) {
    console.log('Launching new browser instance');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...options,
    });

    // Handle browser crash or manual closure
    browser.on('disconnected', () => {
      console.log('Browser disconnected, resetting instance');
      browser = null;
    });
  }
  return browser;
}

/**
 * Close the browser instance
 * @returns {Promise<void>}
 */
export async function closeBrowser () {
  if (browser) {
    console.log('Closing browser instance');
    await browser.close();
    browser = null;
  }
}
