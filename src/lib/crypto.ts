// Encrypts secrets stored in the database (e.g. an LLM API key entered in
// Settings). AES-256-GCM with a key derived from BETTER_AUTH_SECRET, so the
// database alone is useless without the server's environment.
// Rotating BETTER_AUTH_SECRET makes stored secrets unreadable: re-enter them.
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", secret, "greer", "greer:stored-secret:v1", 32),
  );
}

function serverSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return secret;
}

export function encryptSecret(
  plaintext: string,
  secret = serverSecret(),
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

// Throws if the value was tampered with or encrypted with another secret.
export function decryptSecret(
  encrypted: string,
  secret = serverSecret(),
): string {
  const [version, iv, tag, ciphertext] = encrypted.split(".");
  if (version !== VERSION || !iv || !tag || !ciphertext) {
    throw new Error("Unsupported encrypted value");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

// For display only: "sk-ant-…3f9a".
export function maskSecret(secret: string): string {
  if (secret.length <= 12) return "…" + secret.slice(-4);
  return `${secret.slice(0, 7)}…${secret.slice(-4)}`;
}
