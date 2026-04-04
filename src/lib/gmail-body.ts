/**
 * Shared Gmail body extraction utilities.
 *
 * Provides base64url decoding, MIME body extraction, HTML stripping,
 * and email body cleanup functions used by multiple API routes.
 */

/**
 * Decode a base64url-encoded string (Gmail uses URL-safe base64).
 */
export function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf-8");
}

/**
 * Recursively extract the plain-text body from a Gmail message payload.
 * Walks the MIME tree: prefers text/plain, falls back to text/html (stripped).
 */
export function extractBody(payload: Record<string, unknown>): string {
  // Direct body on the payload (simple, non-multipart messages)
  const body = payload.body as { data?: string; size?: number } | undefined;
  if (body?.data && body.size && body.size > 0) {
    const mimeType = (payload.mimeType as string) || "";
    if (mimeType === "text/plain") {
      return decodeBase64Url(body.data);
    }
    if (mimeType === "text/html") {
      const html = decodeBase64Url(body.data);
      return stripHtml(html);
    }
  }

  // Check parts recursively
  const parts = payload.parts as Record<string, unknown>[] | undefined;
  if (parts) {
    // First pass: prefer text/plain
    for (const part of parts) {
      const partMime = (part.mimeType as string) || "";
      if (partMime === "text/plain") {
        const partBody = part.body as { data?: string; size?: number } | undefined;
        if (partBody?.data) return decodeBase64Url(partBody.data);
      }
      if (partMime.startsWith("multipart/")) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
    // Second pass: fallback to text/html
    for (const part of parts) {
      const partMime = (part.mimeType as string) || "";
      if (partMime === "text/html") {
        const partBody = part.body as { data?: string; size?: number } | undefined;
        if (partBody?.data) {
          const html = decodeBase64Url(partBody.data);
          return stripHtml(html);
        }
      }
      if (partMime.startsWith("multipart/")) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }

  return "";
}

/**
 * Strip HTML tags and collapse whitespace for a rough plain-text extraction.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Clean up extracted email body: remove tracking URLs, separators,
 * unsubscribe links, and other cruft common in promotional emails.
 */
export function cleanEmailBody(text: string): string {
  // Split into lines so we can work line-by-line for footer detection
  const lines = text.split("\n");

  // Find where the "footer" starts — look for common footer signals
  let footerStart = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim().toLowerCase();
    // These patterns indicate we've hit the email footer — everything below is cruft
    if (
      line.startsWith("this email was sent") ||
      line.startsWith("you are receiving this") ||
      line.startsWith("you subscribed to") ||
      line.startsWith("you can unsubscribe") ||
      line.startsWith("to unsubscribe") ||
      line.startsWith("if you don't want to receive") ||
      line.startsWith("if you no longer wish") ||
      line.startsWith("manage your preferences") ||
      line.startsWith("update your") && line.includes("settings") ||
      line.startsWith("email preferences") ||
      /^copyright\s*[\(\u00a9]/.test(line) ||
      /^\d{3,5}\s+\w+\s+(pkwy|ave|st|blvd|rd|dr|way|ln)\b/i.test(line) || // street addresses
      /^(PO|P\.O\.)\s+Box\s+\d+/i.test(line)
    ) {
      footerStart = i;
      // Keep scanning upward to find the true start of the footer block
      continue;
    }
    // If we found footer lines and now hit a non-footer line, stop
    if (footerStart < lines.length && line.length > 0) break;
  }

  // Take only the content lines (before footer)
  let cleaned = lines.slice(0, footerStart).join("\n");

  cleaned = cleaned
    // Remove MIME headers that leak through
    .replace(/^Content-Type:.*$/gim, "")
    .replace(/^Content-Transfer-Encoding:.*$/gim, "")
    .replace(/^MIME-Version:.*$/gim, "")
    .replace(/^charset=.*$/gim, "")
    // Remove long separator lines (===, ---, ___)
    .replace(/[=\-_]{10,}/g, "")
    // Remove inline "View full message" / "View in browser" links
    .replace(/View (full |this |the )?message:?\s*https?:\/\/\S+/gi, "")
    .replace(/View (in |on |this )?email:?\s*https?:\/\/\S+/gi, "")
    // Remove markdown-style link URLs <https://...>
    .replace(/<https?:\/\/[^>]+>/g, "")
    // Remove tracking URLs on their own lines (60+ chars)
    .replace(/^https?:\/\/\S{60,}$/gm, "")
    // Remove long encoded query strings
    .replace(/\?[a-zA-Z0-9_=%&\-]{80,}/g, "")
    // Remove "Sent from" lines
    .replace(/^Sent from (my )?\w+.*$/gim, "")
    // Clean up trademark symbols inline
    .replace(/\(R\)/g, "").replace(/\(TM\)/g, "")
    // Collapse excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}
