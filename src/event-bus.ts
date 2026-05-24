import { EventHandler } from './types';
import { logger } from './logger';

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  subscribe(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  unsubscribe(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;
    const idx = handlers.indexOf(handler);
    if (idx >= 0) handlers.splice(idx, 1);
  }

  async publishAsync(event: string, ...args: any[]): Promise<boolean> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.length === 0) return false;

    let result = false;
    for (const handler of handlers) {
      try {
        const returnVal = handler(...args);
        if (returnVal instanceof Promise) {
          const val = await returnVal;
          if (typeof val === 'boolean') result = val;
        } else if (typeof returnVal === 'boolean') {
          result = returnVal;
        }
      } catch (err) {
        logger.error({ err, event }, 'Event handler error');
      }
    }
    return result;
  }

  shutdown(): void {
    this.handlers.clear();
  }
}

export const eventBusInstance = new EventBus();
