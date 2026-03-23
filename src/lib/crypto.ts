import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * Returns a string in the format: iv:authTag:ciphertext (all base64).
 */
export function encrypt(data: unknown): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a value previously encrypted with `encrypt()`.
 */
export function decrypt<T = unknown>(stored: string): T {
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.split(":");

  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted data format");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
