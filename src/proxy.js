import logger from './logger.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

let currentProxyIndex = 0; // Track current proxy
let currentProxy = null; // Store current proxy details

/**
 * Parse proxy URL into components
 * @param {string} proxyUrl - Proxy URL (e.g., http://user:pass@host:port)
 * @returns {Object} - Proxy details: { url, host, port, username, password }
 */
function parseProxy(proxyUrl) {
  try {
    const url = new URL(proxyUrl);
    return {
      url: proxyUrl,
      host: url.hostname,
      port: url.port,
      username: url.username || null,
      password: url.password || null,
    };
  } catch (error) {
    logger.error(`Failed to parse proxy URL ${proxyUrl}: ${error.message}`);
    throw error;
  }
}

/**
 * Load and parse proxies from environment variable
 * @returns {Array<Object>} - List of proxy objects
 */
function loadProxies() {
  const proxyList = process.env.PROXY_SERVERS
    ? process.env.PROXY_SERVERS.split(',').map((p) => p.trim())
    : [];
  if (proxyList.length === 0) {
    logger.warn('No proxies defined in PROXY_LIST environment variable');
    return [];
  }
  return proxyList.map(parseProxy);
}

/**
 * Get the next proxy in the rotation
 * @returns {Object|null} - Proxy details or null if no proxies
 */
export function getNextProxy() {
  const proxies = loadProxies();
  if (proxies.length === 0) {
    return null;
  }

  // Round-robin rotation
  currentProxy = proxies[currentProxyIndex];
  currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
  logger.debug(`Selected proxy: ${currentProxy.url}`);
  return currentProxy;
}

/**
 * Get the current proxy
 * @returns {Object|null} - Current proxy details
 */
export function getCurrentProxy() {
  return currentProxy;
}

/**
 * Reset proxy rotation to start
 */
export function resetProxyRotation() {
  currentProxyIndex = 0;
  currentProxy = null;
  logger.debug('Reset proxy rotation');
}
