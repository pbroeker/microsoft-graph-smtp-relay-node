import * as fs from 'fs';
import * as path from 'path';

function loadEnvFile(): void {
  if (!process.env.CLIENT_ID) {
    try {
      const envPath = path.resolve('.env');
      if (fs.existsSync(envPath)) {
        require('dotenv').config();
      }
    } catch {
      // ignore missing dotenv or unreadable .env
    }
  }
}

function envBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function envInt(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

loadEnvFile();

export const config = {
  tenantId: process.env.TENANT_ID ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  clientSecret: process.env.CLIENT_SECRET ?? '',

  smtpRelayHostname: process.env.SMTP_RELAY_HOSTNAME || '0.0.0.0',
  smtpRelayPort: envInt(process.env.SMTP_RELAY_PORT, 25),
  smtpAuthUser: process.env.SMTP_AUTH_USER ?? '',
  smtpAuthPass: process.env.SMTP_AUTH_PASS ?? '',
  allowedIps: process.env.ALLOWED_IPS || '',
  middlewareDir: process.env.MIDDLEWARE_DIR || '',

  allowSendIncomplete: envBool(process.env.ALLOW_SEND_INCOMPLETE, false),
  saveToSent: envBool(process.env.SAVE_TO_SENT, false),
  softDelete: envBool(process.env.SOFT_DELETE, false),

  logLevel: process.env.LOG_LEVEL?.toLowerCase() || 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',

  testFromAddress: process.env.TEST_FROM_ADDRESS || 'me@company.com',
  testToAddress: process.env.TEST_TO_ADDRESS || 'me@company.com',
  testCcAddress: process.env.TEST_CC_ADDRESS || 'Test Me <me@company.com>',
  testBccAddress: process.env.TEST_BCC_ADDRESS || '<me@company.com>',
} as const;

export function getSmtpConnectHost(): string {
  return config.smtpRelayHostname === '0.0.0.0' ? 'localhost' : config.smtpRelayHostname;
}

const REQUIRED_ENV_VAR_NAMES = ['CLIENT_ID', 'CLIENT_SECRET'] as const;

export function getMissingRequiredEnvVars(): string[] {
  const values: Record<(typeof REQUIRED_ENV_VAR_NAMES)[number], string> = {
    CLIENT_ID: config.clientId,
    CLIENT_SECRET: config.clientSecret,
  };
  return REQUIRED_ENV_VAR_NAMES.filter((name) => !values[name]);
}
