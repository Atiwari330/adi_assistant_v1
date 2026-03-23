import { convert } from "html-to-text";
import type { gmail_v1 } from "googleapis";
import { MAX_BODY_LENGTH_FOR_LLM } from "@/lib/constants";

export interface ParsedGmailMessage {
  messageId: string;
  threadId: string;
  subject: string | null;
  senderAddress: string | null;
  senderName: string | null;
  recipients: string[];
  bodyText: string;
  bodyHtml: string | null;
  hasAttachments: boolean;
  messageTimestamp: Date;
  labels: string[];
  snippet: string;
}

/**
 * Parse a raw Gmail API message into a clean structure.
 */
export function parseGmailMessage(
  message: gmail_v1.Schema$Message,
): ParsedGmailMessage {
  const headers = message.payload?.headers ?? [];
  const getHeader = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;

  // Parse sender — format is typically "Name <email@example.com>"
  const fromRaw = getHeader("From") ?? "";
  const { name: senderName, address: senderAddress } = parseEmailAddress(fromRaw);

  // Parse recipients
  const toRaw = getHeader("To") ?? "";
  const ccRaw = getHeader("Cc") ?? "";
  const recipients = [toRaw, ccRaw]
    .filter(Boolean)
    .flatMap((r) => r.split(",").map((s) => s.trim()))
    .filter(Boolean);

  // Extract body
  const bodyText = extractBodyText(message.payload ?? {});
  const bodyHtml = extractBodyHtml(message.payload ?? {});

  // Check for attachments
  const hasAttachments = checkForAttachments(message.payload ?? {});

  // Parse timestamp
  const internalDate = message.internalDate
    ? new Date(parseInt(message.internalDate, 10))
    : new Date();

  return {
    messageId: message.id ?? "",
    threadId: message.threadId ?? "",
    subject: getHeader("Subject"),
    senderAddress,
    senderName,
    recipients,
    bodyText: truncateBody(bodyText),
    bodyHtml,
    hasAttachments,
    messageTimestamp: internalDate,
    labels: (message.labelIds ?? []) as string[],
    snippet: message.snippet ?? "",
  };
}

/**
 * Parse an email address string like "John Doe <john@example.com>"
 * into name and address components.
 */
function parseEmailAddress(raw: string): { name: string | null; address: string | null } {
  const match = raw.match(/^"?(.+?)"?\s*<(.+?)>$/);
  if (match) {
    return { name: match[1]?.trim() ?? null, address: match[2]?.trim() ?? null };
  }
  // Plain email without name
  if (raw.includes("@")) {
    return { name: null, address: raw.trim() };
  }
  return { name: raw.trim() || null, address: null };
}

/**
 * Extract plain text body from a Gmail message payload.
 * Handles multipart messages by recursing into parts.
 * Falls back to converting HTML if no plain text part exists.
 */
function extractBodyText(payload: gmail_v1.Schema$MessagePart): string {
  // Direct text/plain body
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — look for text/plain first
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }

    // Recurse into multipart parts
    for (const part of payload.parts) {
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = extractBodyText(part);
        if (nested) return nested;
      }
    }

    // Fall back to HTML conversion
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return htmlToPlainText(decodeBase64Url(part.body.data));
      }
    }
  }

  // Direct text/html body
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return htmlToPlainText(decodeBase64Url(payload.body.data));
  }

  return "";
}

/**
 * Extract raw HTML body (for storage, not for LLM).
 */
function extractBodyHtml(payload: gmail_v1.Schema$MessagePart): string | null {
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.mimeType?.startsWith("multipart/")) {
        const nested = extractBodyHtml(part);
        if (nested) return nested;
      }
    }
  }

  return null;
}

/**
 * Check if the message has file attachments.
 */
function checkForAttachments(payload: gmail_v1.Schema$MessagePart): boolean {
  if (payload.filename && payload.filename.length > 0 && payload.body?.attachmentId) {
    return true;
  }

  if (payload.parts) {
    return payload.parts.some((part) => checkForAttachments(part));
  }

  return false;
}

/**
 * Convert HTML email body to plain text.
 */
function htmlToPlainText(html: string): string {
  return convert(html, {
    wordwrap: false,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "table", format: "dataTable" },
    ],
    limits: {
      maxBaseElements: 100,
    },
  });
}

/**
 * Decode base64url-encoded string (Gmail API uses URL-safe base64).
 */
function decodeBase64Url(data: string): string {
  // Replace URL-safe chars with standard base64
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Truncate body text to the max length for LLM processing.
 */
function truncateBody(text: string): string {
  if (text.length <= MAX_BODY_LENGTH_FOR_LLM) {
    return text;
  }
  return text.slice(0, MAX_BODY_LENGTH_FOR_LLM) + "\n\n[... truncated]";
}
