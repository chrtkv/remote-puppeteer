import express from 'express';
import { navigatePage } from './page.js';
import { closeBrowser } from './browser.js';
import { config } from 'dotenv';

// Load environment variables
config();

const app = express();
app.use(express.json());

const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};

app.use(requireApiKey);

/**
 * POST /navigate - Navigate to a URL with given parameters
 * Body: { url, headers, cookies, userAgent, viewport, waitUntil, timeout, pageOptions }
 */
app.post('/navigate', async (req, res) => {
  try {
    const params = req.body;
    const result = await navigatePage(params);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /cleanup - Close the browser instance
 */
app.post('/cleanup', async (req, res) => {
  try {
    await closeBrowser();
    res.json({ message: 'Browser closed or already closed' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Puppeteer server running on port ${PORT}`);
});
