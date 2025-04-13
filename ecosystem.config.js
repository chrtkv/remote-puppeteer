export default {
  apps: [
    {
      name: 'puppeteer-server',
      script: 'src/server.js', // Try without the ./
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      interpreter_args: '--experimental-specifier-resolution=node',
      cwd: __dirname, // Ensure PM2 knows the working directory
    },
  ],
};
