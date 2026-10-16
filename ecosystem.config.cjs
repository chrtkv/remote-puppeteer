// pm2 config, the one `make start` uses. CommonJS (.cjs): package.json says "type": "module", and pm2 loads this file
// with require(), where an ES module has no __dirname.
module.exports = {
  apps: [
    {
      name: 'puppeteer-server',
      script: 'src/server.ts',
      // Node 24+ runs TypeScript as is (README); without this pm2 picks an interpreter by the .ts extension (bun).
      interpreter: 'node',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
