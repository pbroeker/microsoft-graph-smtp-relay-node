import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { MicrosoftGraphSmtp } from './server';

async function main(): Promise<void> {
  if (!process.env.CLIENT_ID) {
    try {
      const envPath = path.resolve('.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config();
      }
    } catch { }
  }

  const requiredEnvVars = ['CLIENT_ID', 'CLIENT_SECRET'];
  for (const varName of requiredEnvVars) {
    if (!process.env[varName]) {
      logger.error({ varName }, `Environment variable ${varName} is required`);
      process.exit(1);
    }
  }

  const controller = new MicrosoftGraphSmtp();

  function shutdown(signal: string): void {
    logger.info({ signal }, 'Shutdown signal received');
    controller.stop();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  controller.start();
  logger.info(`Started SMTP service on ${controller.hostname}:${controller.port}`);

  await new Promise(() => { });
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error');
  process.exit(1);
});
