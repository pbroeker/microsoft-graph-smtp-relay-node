import pino from 'pino';
import { config } from './config';

const logLevel = config.logLevel;
const isDev = !config.isProduction;

let logger: pino.Logger;

if (isDev) {
  logger = pino({
    level: logLevel,
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard' },
    },
  });
} else {
  logger = pino({ level: logLevel });
}

export { logger };
