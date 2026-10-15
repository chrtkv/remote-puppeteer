# Remote Puppeteer Server

Headless Chromium behind a small HTTP API: open a page, optionally act on it, and get back its HTML, cookies and the
requests it made.

## API

Every route except `GET /healthz` needs the `x-api-key` header equal to `API_KEY`.

### `POST /navigate`

| Field | Default | |
| --- | --- | --- |
| `url` | — | Required |
| `headers`, `cookies`, `userAgent`, `viewport` | — | Applied to the page before navigation |
| `waitUntil`, `timeout` | `networkidle2`, `30000` | Passed to `page.goto` |
| `pageOptions` | `{}` | `cacheEnabled`, `navigation` (extra `page.goto` options) |
| `blockResources` | `["image", "stylesheet", "font"]` | Resource types to abort. `[]` loads everything. Blocking can keep elements from becoming visible and lazy content from loading at all: without stylesheets the PS Store grid never requests `categoryGridRetrieve` |
| `returnContent` | `true` | `false` leaves the HTML out of the response |
| `capture` | — | `{ "urlIncludes": "substring" or [...], "methods": ["GET"] }`: record matching requests (`OPTIONS` never) |
| `actions` | `[]` | Steps run in order after navigation, see below |

Response: `{ status, url, cookies, content, requests?, actions? }`. Each captured request is
`{ url, method, resourceType, postData, step, timestamp }`, where `step` is `-1` for requests made while the page
loaded, otherwise the index of the action that was running. On failure the response is `500 { error, actions? }`.

Actions (every one also takes `"optional": true`, which logs a failure and carries on):

| `type` | Fields |
| --- | --- |
| `waitForSelector` | `selector`, `visible` (`true`), `timeout` (`15000`) |
| `click` | `selector`; `waitForResponse: { urlIncludes, status, timeout, optional }` starts waiting before the click |
| `wait` | `ms` (`1000`) |
| `waitForResponse` | `urlIncludes`, `status`, `timeout` |
| `waitForNetworkIdle` | `idleTime` (`500`), `timeout` |

Example: catch the GraphQL request a store page makes, without its HTML.

```json
{
  "url": "https://store.playstation.com/ru-ua/pages/browse/1",
  "returnContent": false,
  "blockResources": [],
  "capture": { "urlIncludes": "categoryGridRetrieve", "methods": ["GET"] }
}
```

### `POST /cleanup`

Closes the browser; the next request starts a new one.

### `GET /healthz`

`{ "ok": true }`, no key needed.

## Configuration

| Variable | |
| --- | --- |
| `API_KEY` | Required; the server refuses to start without it |
| `PORT` | `3000` |
| `CHROMIUM_PATH` | Browser binary; unset means the one puppeteer downloaded |
| `PROXY_SERVERS` | Comma-separated `http://user:pass@host:port`, rotated on each browser restart |
| `MAX_REQUESTS_BEFORE_RELOADING` | Restart the browser after this many requests, once running requests finish; unset or `0` never |
| `LOG_DIR` | `logs`; empty logs to the console only |
| `LOG_LEVEL` | `info` |

## Running

TypeScript, run as is by Node 24's type stripping: no build step, so only erasable syntax (no enums, namespaces or
parameter properties). `npm run typecheck` and `npm run lint` check it.

Docker (Debian's Chromium, logs to the console):

```bash
docker build -t remote-puppeteer .
docker run -d --init --shm-size=512m -e API_KEY=... -p 127.0.0.1:3000:3000 remote-puppeteer
```

pm2 (Node 24+): copy `.env.example` to `.env`, set `API_KEY` and `CHROMIUM_PATH`, then `make start`. npm 11 skips
puppeteer's install script, so there is no downloaded browser to fall back on.
