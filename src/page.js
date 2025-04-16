import { initializeBrowser } from './browser.js';

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
export async function navigatePage ({
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
    throw new Error('URL is required');
  }

  const browser = await initializeBrowser();
  const context = await browser.newContext();
  const page = await browser.newPage();

  try {
    if (userAgent) {
      await page.setUserAgent(userAgent);
    }

    if (Object.keys(headers).length > 0) {
      await page.setExtraHTTPHeaders(headers);
    }

    if (cookies.length > 0) {
      await context.setCookie(...cookies);
    }

    if (viewport) {
      await page.setViewport(viewport);
    }

    await page.setCacheEnabled(pageOptions.cacheEnabled ?? true);

    const response = await page.goto(url, {
      waitUntil,
      timeout,
      ...pageOptions.navigation,
    });

    // Get page content (HTML)
    const content = await page.content();

    const receivedCookies = await context.cookies();

    return {
      status: response.status(),
      url: response.url(),
      cookies: receivedCookies,
      content,
    };
  } finally {
    // Close page and context to prevent leaks
    await page.close();
    await context.close();
  }
}
