import logger from './logger.ts';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Proxy {
  url: string;
  host: string;
  port: string;
  username: string | null;
  password: string | null;
}

let currentProxyIndex = 0; // Track current proxy
let currentProxy: Proxy | null = null; // Store current proxy details

/**
 * Parse proxy URL into components
 * @param proxyUrl - Proxy URL (e.g., http://user:pass@host:port)
 */
function parseProxy(proxyUrl: string): Proxy {
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
    logger.error(`Failed to parse proxy URL ${proxyUrl}: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Load and parse proxies from environment variable
 */
function loadProxies(): Proxy[] {
  const proxyList = process.env.PROXY_SERVERS
    ? process.env.PROXY_SERVERS.split(',').map((p) => p.trim())
    : [];
  if (proxyList.length === 0) {
    logger.warn('No proxies defined in PROXY_SERVERS environment variable');
    return [];
  }
  return proxyList.map(parseProxy);
}

/**
 * Get the next proxy in the rotation, or null if no proxies
 */
export function getNextProxy(): Proxy | null {
  const proxies = loadProxies();
  if (proxies.length === 0) {
    currentProxy = null;
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
 */
export function getCurrentProxy(): Proxy | null {
  return currentProxy;
}
