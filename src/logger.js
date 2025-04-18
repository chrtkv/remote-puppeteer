import { createLogger, format, transports } from 'winston';

const logger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.json()),
  transports: [
    new transports.File({ filename: 'logs/combined.log' }), // All logs
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }), // Error logs
    new transports.Console({ format: format.combine(format.colorize(), format.simple()) }),
  ],
});

export default logger;
