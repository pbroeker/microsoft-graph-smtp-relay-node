import { simpleParser, ParsedMail, Attachment } from "mailparser";
import { ClientSecretCredential } from "@azure/identity";
import { Readable } from "stream";
import "isomorphic-fetch";
import * as ipaddr from "ipaddr.js";
import { config } from "./config";
import { logger } from "./logger";
import { eventBusInstance } from "./event-bus";
import { AllowedNetwork } from "./types";

const CHUNK_SIZE = 327680;
const MAX_UPLOAD_RETRIES = 5;
const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

export class MicrosoftGraphHandler {
  private credential: ClientSecretCredential;
  private allowedNetworks: AllowedNetwork[];
  private accessToken: string = "";

  constructor(allowedNetworks: AllowedNetwork[]) {
    this.allowedNetworks = allowedNetworks;
    this.credential = new ClientSecretCredential(
      config.tenantId,
      config.clientId,
      config.clientSecret,
    );
  }

  async handleData(
    stream: Readable,
    session: any,
    callback: (err?: Error | null) => void,
  ): Promise<void> {
    try {
      const rawEmail = await this.collectStream(stream);

      if (await this.isIpBlocked(session)) {
        const err: any = new Error("IP is not allowed");
        err.responseCode = 550;
        callback(err);
        return;
      }

      const sender = session.envelope.mailFrom?.address;
      if (!sender) {
        callback(new Error("No sender in envelope"));
        return;
      }

      const envelopeRecipients = (session.envelope.rcptTo || [])
        .map((r: any) => r.address)
        .filter(Boolean) as string[];

      if (envelopeRecipients.length === 0) {
        callback(new Error("No recipients in envelope"));
        return;
      }

      const parsed = await simpleParser(rawEmail);

      const toRecipients = this.parseAddressList(parsed.to);
      const ccRecipients = this.parseAddressList(parsed.cc);
      const mimeToCcSet = new Set(
        [
          ...toRecipients.map((r: any) =>
            r.emailAddress.address?.toLowerCase(),
          ),
          ...ccRecipients.map((r: any) =>
            r.emailAddress.address?.toLowerCase(),
          ),
        ].filter(Boolean),
      );
      const bccRecipients = envelopeRecipients
        .filter((a) => !mimeToCcSet.has(a.toLowerCase()))
        .map((a) => ({ emailAddress: { address: a } }));

      let replyTo: any[] = [];
      try {
        const replyToHeader = parsed.headers.get("reply-to") as
          | string
          | undefined;
        if (replyToHeader) {
          replyTo = [
            {
              emailAddress: {
                address: replyToHeader
                  .replace(/^.*[<]?([^>]+)[>]?.*$/, "$1")
                  .trim(),
              },
            },
          ];
        }
      } catch {}

      await eventBusInstance.publishAsync("before_send", parsed, session);

      await this.ensureToken();
      const messageId = await this.createDraft(
        sender,
        parsed,
        toRecipients,
        ccRecipients,
        bccRecipients,
        replyTo,
      );

      const extractedAttachments = this.extractAttachments(parsed);

      for (const att of extractedAttachments) {
        const ok = await this.uploadAttachmentWithRetry(sender, messageId, att);
        if (!ok) {
          await this.attachPlaceholder(
            sender,
            messageId,
            att.name,
            "Attachment upload failed after retries",
          );
          if (!config.allowSendIncomplete) {
            const err: any = new Error("Unable to process attachments");
            err.responseCode = 550;
            callback(err);
            return;
          }
          logger.warn(
            { name: att.name },
            "Proceeding to send with incomplete attachment",
          );
        }
      }

      const shouldSkip = await eventBusInstance.publishAsync(
        "skip_send",
        parsed,
        session,
      );
      if (shouldSkip) {
        logger.info("Message accepted without delivery");
        callback();
        return;
      }

      await this.sendDraft(sender, messageId);

      if (!config.saveToSent) {
        if (config.softDelete) {
          await this.deleteMessage(sender, messageId);
        } else {
          await this.permanentDeleteMessage(sender, messageId);
        }
      }

      await eventBusInstance.publishAsync("after_send", parsed, session);
      callback();
    } catch (err: any) {
      logger.error({ err }, "Error handling email data");
      if (!err.responseCode) err.responseCode = 550;
      callback(err);
    }
  }

  private collectStream(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: any) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  private async isIpBlocked(session: any): Promise<boolean> {
    if (this.allowedNetworks.length === 0) return false;
    const remoteAddress = session.remoteAddress;
    if (!remoteAddress) return true;
    const clientIP = ipaddr.parse(remoteAddress);
    return !this.allowedNetworks.some((n) => clientIP.match(n.network, n.bits));
  }

  private parseAddressList(addressObj: any): any[] {
    if (!addressObj?.value) return [];
    return addressObj.value.map((v: any) => ({
      emailAddress: {
        address: v.address,
        ...(v.name ? { name: v.name } : {}),
      },
    }));
  }

  private extractAttachments(parsed: ParsedMail): any[] {
    if (!parsed.attachments?.length) return [];
    return parsed.attachments.map((att: Attachment) => ({
      name: att.filename || `attachment-${Date.now()}`,
      contentType: att.contentType || "application/octet-stream",
      content: att.content,
      isInline: att.contentDisposition === "inline" || !!att.contentId,
      contentId: att.contentId || null,
      size: att.size,
    }));
  }

  private async ensureToken(): Promise<void> {
    const tokenResponse = await this.credential.getToken(
      "https://graph.microsoft.com/.default",
    );
    this.accessToken = tokenResponse.token;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async jsonFetch(
    url: string,
    method: string,
    body?: any,
    extraHeaders?: Record<string, string>,
  ): Promise<any> {
    const response = await fetch(url, {
      method,
      headers: this.headers(extraHeaders),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Graph API error ${response.status} for ${method} ${url}: ${text}`,
      );
    }
    if (response.status === 204) return null;
    return response.json();
  }

  private async createDraft(
    sender: string,
    parsed: ParsedMail,
    toRecipients: any[],
    ccRecipients: any[],
    bccRecipients: any[],
    replyTo: any[],
  ): Promise<string> {
    const bodyContent = parsed.html || parsed.text || "\n";
    const contentType = parsed.html ? "HTML" : "Text";

    const payload: any = {
      subject: parsed.subject || "",
      body: { contentType, content: bodyContent },
      toRecipients,
      ccRecipients,
      bccRecipients,
    };
    if (replyTo.length) payload.replyTo = replyTo;

    const data = await this.jsonFetch(
      `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages`,
      "POST",
      payload,
      { Prefer: 'IdType="ImmutableId"' },
    );

    logger.info({ messageId: data.id }, "Draft message created");
    return data.id;
  }

  private async uploadAttachmentWithRetry(
    sender: string,
    messageId: string,
    attachment: any,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_UPLOAD_RETRIES; attempt++) {
      try {
        if (attempt > 0)
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));

        const uploadUrl = await this.createUploadSession(
          sender,
          messageId,
          attachment.name,
          attachment.content.length,
          attachment.isInline,
          attachment.contentId,
        );

        if (!uploadUrl) continue;
        await this.uploadChunks(uploadUrl, attachment.content);
        return true;
      } catch (err: any) {
        logger.warn(
          { err, attempt, name: attachment.name },
          "Attachment upload attempt failed",
        );
      }
    }
    logger.error(
      { name: attachment.name },
      "Attachment upload failed after all retries",
    );
    return false;
  }

  private async createUploadSession(
    sender: string,
    messageId: string,
    fileName: string,
    fileSize: number,
    isInline: boolean,
    contentId: string | null,
  ): Promise<string | null> {
    const payload = {
      AttachmentItem: {
        attachmentType: "file",
        name: fileName,
        size: fileSize,
        isInline,
        ...(contentId ? { contentId } : {}),
      },
    };

    try {
      const data = await this.jsonFetch(
        `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages/${messageId}/attachments/createUploadSession`,
        "POST",
        payload,
      );
      return data.uploadUrl;
    } catch (err: any) {
      logger.warn({ err, fileName }, "Failed to create upload session");
      return null;
    }
  }

  private async uploadChunks(
    uploadUrl: string,
    fileData: Buffer,
  ): Promise<void> {
    const fileSize = fileData.length;
    const numChunks = Math.ceil(fileSize / CHUNK_SIZE);
    logger.debug({ fileSize, numChunks }, "Starting chunked upload");

    for (let i = 0; i < numChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunk = fileData.subarray(start, end);

      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${start}-${end - 1}/${fileSize}`,
          "Content-Length": String(chunk.length),
          "Content-Type": "application/octet-stream",
        },
        body: chunk,
      });

      if (
        !response.ok &&
        response.status !== 200 &&
        response.status !== 201 &&
        response.status !== 202
      ) {
        const errorText = await response.text();
        throw new Error(
          `Chunk upload failed at byte ${start}: ${response.status} - ${errorText}`,
        );
      }

      logger.debug({ chunk: i + 1, total: numChunks }, "Chunk uploaded");
    }
  }

  private async attachPlaceholder(
    sender: string,
    messageId: string,
    originalFilename: string,
    reason: string,
  ): Promise<void> {
    const placeholderName = `ATTACHMENT_UPLOAD_FAILED_${originalFilename}.txt`;
    const content = [
      "Attachment upload failed",
      "",
      `Original filename: ${originalFilename}`,
      `Reason: ${reason}`,
      `Time (UTC): ${new Date().toISOString()}`,
      "",
      "The original attachment could not be added to this email due to a temporary",
      "Microsoft Graph / Exchange Online issue.",
      "Please retrieve the original file from the source system or retry sending.",
    ].join("\n");

    const attachmentPayload = {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: placeholderName,
      contentType: "text/plain",
      contentBytes: Buffer.from(content, "utf-8").toString("base64"),
      isInline: false,
    };

    try {
      await this.jsonFetch(
        `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages/${messageId}/attachments`,
        "POST",
        attachmentPayload,
      );
      logger.info({ placeholderName }, "Placeholder attachment added");
    } catch (err: any) {
      logger.warn({ err }, "Failed to attach placeholder notification");
    }
  }

  private async sendDraft(sender: string, messageId: string): Promise<void> {
    await this.jsonFetch(
      `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages/${messageId}/send`,
      "POST",
    );
    logger.info("Email sent successfully");
  }

  private async deleteMessage(
    sender: string,
    messageId: string,
  ): Promise<void> {
    try {
      await this.jsonFetch(
        `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages/${messageId}`,
        "DELETE",
      );
      logger.info("Message soft-deleted");
    } catch (err: any) {
      logger.warn({ err }, "Failed to delete message");
    }
  }

  private async permanentDeleteMessage(
    sender: string,
    messageId: string,
  ): Promise<void> {
    try {
      await this.jsonFetch(
        `${GRAPH_API_BASE}/users/${encodeURIComponent(sender)}/messages/${messageId}/permanentDelete`,
        "POST",
      );
      logger.info("Message permanently deleted");
    } catch (err: any) {
      logger.warn({ err }, "Failed to permanently delete message");
    }
  }
}
