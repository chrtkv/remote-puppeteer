import { createLogger, format, transports } from 'winston';

// Files only where something rotates them (pm2 setup); in Docker the console goes to the container log
const LOG_DIR = process.env.LOG_DIR ?? 'logs';

const logger = createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.json()),
  transports: [
    ...LOG_DIR ? [
      new transports.File({ filename: `${LOG_DIR}/combined.log` }), // All logs
      new transports.File({
        filename: `${LOG_DIR}/error.log`,
        level: 'error',
      }),
    ] : [],
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
});

export default logger;
