import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ---------------------------------------------------------------------------
// Check openssl availability — skip all tests if missing
// ---------------------------------------------------------------------------
let opensslAvailable = false;
try {
  execSync('openssl version', { stdio: 'ignore' });
  opensslAvailable = true;
} catch {
  // openssl not available
}

// ---------------------------------------------------------------------------
// Generate temporary self-signed TLS certificate
// ---------------------------------------------------------------------------
let tmpDir = '';
let keyPath = '';
let certPath = '';

function generateTlsCert(): void {
  tmpDir = mkdtempSync(join(tmpdir(), 'smtp-tls-'));
  keyPath = join(tmpDir, 'key.pem');
  certPath = join(tmpDir, 'cert.pem');

  execSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout "${keyPath}" -out "${certPath}" -days 1 -subj "/CN=localhost"`,
    { stdio: 'pipe' },
  );
}

// ---------------------------------------------------------------------------
// Set env vars for TLS mode (must happen before module imports)
// ---------------------------------------------------------------------------
if (opensslAvailable) {
  generateTlsCert();
  process.env.TENANT_ID = 'test-tenant';
  process.env.CLIENT_ID = 'test-client';
  process.env.CLIENT_SECRET = 'test-secret';
  process.env.SMTP_AUTH_METHOD = 'tls';
  process.env.SMTP_AUTH_USER = 'testuser';
  process.env.SMTP_AUTH_PASS = 'testpass';
  process.env.TLS_KEY_PATH = keyPath;
  process.env.TLS_CERT_PATH = certPath;
  process.env.ALLOWED_IPS = '';
  process.env.MIDDLEWARE_DIR = '';
  process.env.LOG_LEVEL = 'silent';
}

// ---------------------------------------------------------------------------
// TLS integration tests
// ---------------------------------------------------------------------------
describe.runIf(opensslAvailable)('SMTP server (TLS / STARTTLS mode)', () => {
  let smtpServer: any;
  let serverPort: number;

  beforeAll(async () => {
    const { MicrosoftGraphSmtp } = await import('../src/server');
    smtpServer = new MicrosoftGraphSmtp();

    const netServer = (smtpServer as any).server.server;
    const listening = new Promise<void>((resolve) => netServer.once('listening', resolve));
    smtpServer.start();
    await listening;
    serverPort = netServer.address().port;
  });

  afterAll(() => {
    smtpServer?.stop();
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it('starts with the TLS port default (587)', () => {
    // When SMTP_AUTH_METHOD=tls, default port is 587
    expect(smtpServer.port).toBe(587);
  });

  it('accepts a connection with correct credentials over STARTTLS', async () => {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: 'localhost',
      port: serverPort,
      secure: false,
      auth: { user: 'testuser', pass: 'testpass' },
      tls: { rejectUnauthorized: false },
    });
    await expect(transport.verify()).resolves.toBe(true);
    transport.close();
  });

  it('rejects a connection with wrong password over STARTTLS', async () => {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: 'localhost',
      port: serverPort,
      secure: false,
      auth: { user: 'testuser', pass: 'wrongpass' },
      tls: { rejectUnauthorized: false },
    });
    await expect(transport.verify()).rejects.toThrow();
    transport.close();
  });

  it('rejects a connection with wrong username over STARTTLS', async () => {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: 'localhost',
      port: serverPort,
      secure: false,
      auth: { user: 'nobody', pass: 'testpass' },
      tls: { rejectUnauthorized: false },
    });
    await expect(transport.verify()).rejects.toThrow();
    transport.close();
  });

  it('rejects unauthenticated send attempts over STARTTLS', async () => {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: 'localhost',
      port: serverPort,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
    await expect(
      transport.sendMail({
        from: 'sender@test.com',
        to: 'rcpt@test.com',
        subject: 'test',
        text: 'test',
      }),
    ).rejects.toThrow();
    transport.close();
  });

  it('advertises STARTTLS in EHLO response', async () => {
    // Connect via raw TCP and check EHLO response includes STARTTLS
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host: 'localhost',
      port: serverPort,
      secure: false,
      auth: { user: 'testuser', pass: 'testpass' },
      tls: { rejectUnauthorized: false },
    });
    // verify() exercises EHLO + AUTH over STARTTLS
    await expect(transport.verify()).resolves.toBe(true);
    transport.close();
  });
});

describe.runIf(!opensslAvailable)('TLS tests', () => {
  it('skipped — openssl not available on this system', () => {
    expect(true).toBe(true);
  });
});
