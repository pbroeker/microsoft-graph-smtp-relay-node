import * as nodemailer from 'nodemailer';
import * as path from 'path';
import { config, getSmtpConnectHost } from '../src/config';

const to = [config.testToAddress];
const cc = [config.testCcAddress];
const bcc = [config.testBccAddress];

const smtpServer = getSmtpConnectHost();
const smtpPort = config.smtpRelayPort;
const smtpUser = config.smtpAuthUser || 'me@company.com';
const smtpPass = config.smtpAuthPass || 'me@company.com';

async function main() {
  const testDir = path.resolve(__dirname, '..', 'test');
  const useTls = config.smtpAuthMethod === 'tls';

  const transporter = nodemailer.createTransport({
    host: smtpServer,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    ...(useTls ? {} : { tls: { rejectUnauthorized: false } }),
  });

  const imagePath = path.join(testDir, 'image.jpg');
  const pdfPath = path.join(testDir, 'doc.pdf');

  const info = await transporter.sendMail({
    from: config.testFromAddress,
    to: to.join(', '),
    cc: cc.join(', '),
    bcc: bcc.join(', '),
    subject: 'Email with HTML and Embedded Imagé',
    html: `<html><head></head><body>
      <p>Hi!<br>This is just a test email that showcases both HTML and embedded attachments.<br></p>
      <img src="cid:image1">
    </body></html>`,
    attachments: [
      {
        filename: 'image.jpg',
        path: imagePath,
        cid: 'image1',
        contentDisposition: 'inline',
      },
      {
        filename: 'doc.pdf',
        path: pdfPath,
        contentDisposition: 'attachment',
      },
    ],
  });

  console.log('Email sent!');
  console.log('Message ID:', info.messageId);
}

main().catch((err) => {
  console.error('Failed to send email:', err);
  process.exit(1);
});
