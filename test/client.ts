import * as nodemailer from "nodemailer";
import * as path from "path";
import { config, getSmtpConnectHost } from "../src/config";

const smtpServer = getSmtpConnectHost();
const smtpPort = config.smtpRelayPort;
const smtpUser = config.smtpAuthUser || "me@company.com";
const smtpPass = config.smtpAuthPass || "me@company.com";

async function main() {
  const testDir = path.resolve(__dirname, "..", "test");
  const useTls = config.smtpAuthMethod === "tls";

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

  const imagePath = path.join(testDir, "image.jpg");
  const pdfPath = path.join(testDir, "doc.pdf");

  const info = await transporter.sendMail({
    from: "me@company.com",
    to: "68139b36-14fc-488d-bd63-46fccd6ec9c3@emailhook.site",
    cc: "?utf-8?Q?T=C3=A9st?= <0a20066f-d51c-48c7-995a-d006604b5c10@emailhook.site>",
    bcc: "<1e0cd728-0abf-4248-b0ca-f62cf91159c5@emailhook.site>",
    subject: "Email with HTML and Embedded Imagé",
    html: `<html><head></head><body>
      <p>Hi!<br>This is just a test email that showcases both HTML and embedded attachments.<br></p>
      <img src="cid:image1">
    </body></html>`,
    attachments: [
      {
        filename: "image.jpg",
        path: imagePath,
        cid: "image1",
        contentDisposition: "inline",
      },
      {
        filename: "doc.pdf",
        path: pdfPath,
        contentDisposition: "attachment",
      },
    ],
  });

  console.log("Email sent!");
  console.log("Message ID:", info.messageId);
}

main().catch((err) => {
  console.error("Failed to send email:", err);
  process.exit(1);
});
