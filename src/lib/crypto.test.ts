import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto";

const secret = "test-secret-0123456789-abcdefghij";

describe("stored secret encryption", () => {
  it("round-trips and never contains the plaintext", () => {
    const encrypted = encryptSecret("sk-ant-api-key-123", secret);
    expect(encrypted).not.toContain("sk-ant");
    expect(decryptSecret(encrypted, secret)).toBe("sk-ant-api-key-123");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("same", secret)).not.toBe(
      encryptSecret("same", secret),
    );
  });

  it("rejects a value encrypted with another server secret", () => {
    const encrypted = encryptSecret("sk-ant-api-key-123", secret);
    expect(() =>
      decryptSecret(encrypted, "another-secret-0123456789"),
    ).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptSecret("sk-ant-api-key-123", secret).split(
      ".",
    );
    const flipped = Buffer.from(ct!, "base64url");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      decryptSecret(
        [v, iv, tag, flipped.toString("base64url")].join("."),
        secret,
      ),
    ).toThrow();
  });

  it("masks keys for display", () => {
    expect(maskSecret("sk-ant-api03-abcdefghijklmnop")).toBe("sk-ant-…mnop");
  });
});
