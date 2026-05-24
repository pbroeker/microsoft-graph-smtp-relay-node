import pino from 'pino';

const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'info';
const isDev = process.env.NODE_ENV !== 'production';

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
