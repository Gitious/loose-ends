import path from "path";

/**
 * Returns the base directory for data storage.
 * In development: uses project-root/data/
 * On Vercel (serverless): uses /tmp/loose-ends-data/ (writable but ephemeral)
 */
export function getDataDir(): string {
  if (process.env.VERCEL) {
    return "/tmp/loose-ends-data";
  }
  return path.join(process.cwd(), "data");
}

/**
 * Turn a userId into a safe string for use in file paths and identifiers.
 * Replaces any character that is not alphanumeric, underscore, or hyphen.
 */
export function sanitizeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9_-]/g, "_");
}
