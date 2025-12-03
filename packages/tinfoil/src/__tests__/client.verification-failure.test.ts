import { describe, it, expect, vi, beforeEach } from "vitest";

const createEncryptedBodyFetchMock = vi.fn(() => {
  return (async () => new Response(null)) as typeof fetch;
});

vi.mock("../verifier", () => ({
  Verifier: class {
    verify() {
      throw new Error("verify failed");
    }
    getVerificationDocument() {
      return undefined;
    }
  },
}));

vi.mock("../encrypted-body-fetch", () => ({
  createEncryptedBodyFetch: createEncryptedBodyFetchMock,
}));

vi.mock("tinfoil/secure-fetch", () => ({
  createSecureFetch: createEncryptedBodyFetchMock,
}));

describe("Client verification gating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks client creation and requests when verification fails", async () => {
    const { TinfoilAI } = await import("../tinfoilai");
    const client = new TinfoilAI({ apiKey: "test" });

    await expect(client.ready()).rejects.toThrow(/verify/);

    await expect(
      client.chat.completions.create({
        model: "gpt-oss-120b-free",
        messages: [{ role: "user", content: "hi" }],
      })
    ).rejects.toThrow(/verify/);

    expect(createEncryptedBodyFetchMock).not.toHaveBeenCalled();
  });
});
