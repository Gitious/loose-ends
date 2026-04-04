/**
 * Builds an RFC 2822 MIME message and returns it as a base64url-encoded string
 * suitable for the Gmail API (messages.send / drafts.create).
 *
 * Runs on Node.js runtime (not Edge) because it uses Buffer.
 */

interface BuildMimeOptions {
  to: string;
  from: string;
  subject: string;
  body: string;
  /** Message-ID header of the email being replied to */
  inReplyTo?: string;
  /** Space-separated list of Message-IDs for the References header */
  references?: string;
  /** Gmail thread ID — not a MIME header, returned alongside the encoded message */
  threadId?: string;
}

interface MimeResult {
  /** base64url-encoded RFC 2822 message */
  raw: string;
  /** Gmail thread ID (pass-through), if provided */
  threadId?: string;
}

export function buildMimeMessage(opts: BuildMimeOptions): MimeResult {
  const { to, from, subject, body, inReplyTo, references, threadId } = opts;

  // If replying, ensure the subject has a Re: prefix
  const finalSubject =
    inReplyTo && !subject.toLowerCase().startsWith("re:")
      ? `Re: ${subject}`
      : subject;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${finalSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
  ];

  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`);
  }
  if (references) {
    lines.push(`References: ${references}`);
  }

  // Blank line separates headers from body
  lines.push("", body);

  const mimeMessage = lines.join("\r\n");
  const raw = Buffer.from(mimeMessage, "utf-8").toString("base64url");

  return { raw, ...(threadId ? { threadId } : {}) };
}
