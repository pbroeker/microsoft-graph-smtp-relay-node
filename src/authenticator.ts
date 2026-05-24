import { SMTPServerSession, SMTPServerAuthentication } from 'smtp-server';
import { config } from './config';
import { logger } from './logger';
import { eventBusInstance } from './event-bus';

export function createAuthenticator() {
  const smtpUser = config.smtpAuthUser;
  const smtpPass = config.smtpAuthPass;


  return function onAuth(
    auth: SMTPServerAuthentication,
    session: SMTPServerSession,
    callback: (err: Error | null, response?: { user?: any }) => void
  ): void {
    logger.debug({ method: auth.method }, 'Authentication attempt');

    eventBusInstance.publishAsync('before_auth', auth, session);
    const username = auth.username || '';
    const password = auth.password || '';

    if (username === smtpUser && password === smtpPass) {
      logger.info({ username }, 'Authentication successful');
      eventBusInstance.publishAsync('after_auth', auth, session);
      callback(null, { user: { username } });
    } else {
      logger.warn({ username }, 'Authentication failed');
      const err: any = new Error('Invalid credentials');
      err.responseCode = 535;
      callback(err);
    }
  };
}
