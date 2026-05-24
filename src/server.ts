import { SMTPServer, SMTPServerOptions } from 'smtp-server';
import { Readable } from 'stream';
import * as ipaddr from 'ipaddr.js';
import { logger } from './logger';
import { MicrosoftGraphHandler } from './microsoft-graph-handler';
import { createAuthenticator } from './authenticator';
import { loadMiddleware } from './middleware-loader';
import { eventBusInstance } from './event-bus';
import { AllowedNetwork } from './types';

export class MicrosoftGraphSmtp {
  private server: SMTPServer;
  private handler: MicrosoftGraphHandler;
  hostname: string;
  port: number;

  constructor() {
    this.hostname = process.env.SMTP_RELAY_HOSTNAME || '0.0.0.0';
    this.port = parseInt(process.env.SMTP_RELAY_PORT || '25', 10);

    const allowedNetworks = this.parseAllowedNetworks();
    const authenticator = createAuthenticator();

    this.handler = new MicrosoftGraphHandler(allowedNetworks);

    const options: SMTPServerOptions = {
      hideSTARTTLS: true,
      onConnect: this.onConnect.bind(this, allowedNetworks),
      onAuth: authenticator,
      onData: this.handler.handleData.bind(this.handler),
    };

    this.server = new SMTPServer(options);

    this.server.on('error', (err) => {
      logger.error({ err }, 'SMTP server error');
    });

    this.loadMiddleware();
  }

  private parseAllowedNetworks(): AllowedNetwork[] {
    const allowedIps = process.env.ALLOWED_IPS || '';
    const networks: AllowedNetwork[] = [];

    for (const item of allowedIps.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      try {
        const parsed = ipaddr.parseCIDR(trimmed);
        if (parsed) {
          networks.push({ network: parsed[0], bits: parsed[1] });
        }
      } catch {
        logger.warn({ cidr: trimmed }, 'Invalid CIDR in ALLOWED_IPS');
      }
    }

    logger.debug({ networks }, 'Allowed networks initialized');
    return networks;
  }

  private onConnect(allowedNetworks: AllowedNetwork[], session: any, callback: (err?: Error | null) => void): void {
    if (allowedNetworks.length === 0) {
      callback();
      return;
    }

    const remoteAddress = session.remoteAddress;
    if (!remoteAddress) {
      callback(new Error('No remote address'));
      return;
    }

    try {
      const clientIP = ipaddr.parse(remoteAddress);
      const isAllowed = allowedNetworks.some(n => clientIP.match(n.network, n.bits));

      if (isAllowed) {
        logger.info({ remoteAddress }, 'Client allowed to connect');
        callback();
      } else {
        logger.warn({ remoteAddress }, 'Client NOT allowed to connect');
        const err: any = new Error('IP is not allowed');
        err.responseCode = 521;
        callback(err);
      }
    } catch {
      callback(new Error('Invalid client IP'));
    }
  }

  private loadMiddleware(): void {
    const middlewareDir = process.env.MIDDLEWARE_DIR || '';
    if (middlewareDir) {
      loadMiddleware(middlewareDir, this.handler);
    }
  }

  start(): void {
    this.server.listen(this.port, this.hostname);
    logger.info({ hostname: this.hostname, port: this.port }, 'SMTP server starting');
  }

  stop(): void {
    this.server.close();
    eventBusInstance.shutdown();
    logger.info('SMTP server stopped');
  }
}
