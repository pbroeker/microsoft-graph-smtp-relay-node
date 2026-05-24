import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';
import { MicrosoftGraphHandler } from './microsoft-graph-handler';

export function loadMiddleware(middlewareDir: string, handler: MicrosoftGraphHandler): void {
  const absPath = path.resolve(middlewareDir);

  if (!fs.existsSync(absPath)) {
    logger.debug({ dir: absPath }, 'Middleware directory not found, skipping');
    return;
  }

  const entries = fs.readdirSync(absPath, { withFileTypes: true });
  const files = entries.filter(e => e.isFile() && /\.(js|ts)$/i.test(e.name));

  for (const file of files) {
    const fullPath = path.join(absPath, file.name);
    try {
      const mod = require(fullPath);
      const MiddlewareClass = mod.Middleware || mod.default;
      if (typeof MiddlewareClass !== 'function') {
        logger.warn({ file: file.name }, 'Middleware module has no export (class/function)');
        continue;
      }
      new MiddlewareClass(handler);
      logger.debug({ file: file.name }, 'Middleware loaded');
    } catch (err) {
      logger.error({ err, file: file.name }, 'Failed to load middleware');
    }
  }
}
