import * as nodemailer from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

if (!process.env.SMTP_RELAY_HOSTNAME) {
  require('dotenv').config();
}

const to = [process.env.TEST_TO_ADDRESS || 'me@company.com'];
const cc = [process.env.TEST_CC_ADDRESS || 'Test Me <me@company.com>'];
const bcc = [process.env.TEST_BCC_ADDRESS || '<me@company.com>'];

const smtpServer =
  process.env.SMTP_RELAY_HOSTNAME === '0.0.0.0'
    ? 'localhost'
    : process.env.SMTP_RELAY_HOSTNAME || 'localhost';
const smtpPort = parseInt(process.env.SMTP_RELAY_PORT || '25', 10);
const smtpUser = process.env.SMTP_AUTH_USER || 'me@company.com';
const smtpPass = process.env.SMTP_AUTH_PASS || 'me@company.com';

async function main() {
  const testDir = path.resolve(__dirname, '..', 'test');

  const transporter = nodemailer.createTransport({
    host: smtpServer,
    port: smtpPort,
    secure: false,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: { rejectUnauthorized: false },
  });

  const imagePath = path.join(testDir, 'image.jpg');
  const pdfPath = path.join(testDir, 'doc.pdf');

  const info = await transporter.sendMail({
    from: process.env.TEST_FROM_ADDRESS || 'me@company.com',
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
