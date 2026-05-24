import { getMissingRequiredEnvVars } from './config';
import { logger } from './logger';
import { MicrosoftGraphSmtp } from './server';

async function main(): Promise<void> {
  for (const varName of getMissingRequiredEnvVars()) {
    logger.error({ varName }, `Environment variable ${varName} is required`);
    process.exit(1);
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
