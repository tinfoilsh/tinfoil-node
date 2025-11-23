import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert";
import { encryptedBodyRequest, normalizeEncryptedBodyRequestArgs, getHPKEKey, createEncryptedBodyFetch } from "../encrypted-body-fetch";
import { Identity, PROTOCOL } from "ehbp";

describe("encrypted-body-fetch", () => {
  describe("getHPKEKey", () => {
    it("rejects non-HTTPS URLs", async () => {
      await assert.rejects(
        () => getHPKEKey("http://example.com/v1"),
        /HTTPS is required for remote key retrieval/
      );
    });

    it("rejects invalid content-type", async (t) => {
      const fetchMock = t.mock.fn(async () => {
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock as any;

      try {
        await assert.rejects(
          () => getHPKEKey("https://example.com/v1"),
          /Invalid content type/
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("rejects failed key fetch", async (t) => {
      const fetchMock = t.mock.fn(async () => {
        return new Response(null, {
          status: 500,
          statusText: "Internal Server Error",
        });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock as any;

      try {
        await assert.rejects(
          () => getHPKEKey("https://example.com/v1"),
          /Failed to get server public key: 500/
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("successfully retrieves HPKE key with valid response", async (t) => {
      const mockIdentity = await Identity.generate();
      const publicConfig = await mockIdentity.marshalConfig();

      const fetchMock = t.mock.fn(async (url: string) => {
        assert.strictEqual(url, "https://example.com/.well-known/hpke-keys");
        return new Response(publicConfig as any, {
          status: 200,
          headers: { "content-type": PROTOCOL.KEYS_MEDIA_TYPE },
        });
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = fetchMock as any;

      try {
        const key = await getHPKEKey("https://example.com/v1");
        assert.ok(key instanceof CryptoKey);
        assert.strictEqual(fetchMock.mock.callCount(), 1);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("normalizeEncryptedBodyRequestArgs", () => {
    it("handles string URLs", () => {
      const result = normalizeEncryptedBodyRequestArgs("https://example.com/test");
      assert.strictEqual(result.url, "https://example.com/test");
      assert.strictEqual(result.init, undefined);
    });

    it("handles URL objects", () => {
      const url = new URL("https://example.com/test");
      const result = normalizeEncryptedBodyRequestArgs(url);
      assert.strictEqual(result.url, "https://example.com/test");
      assert.strictEqual(result.init, undefined);
    });

    it("handles Request objects", () => {
      const request = new Request("https://example.com/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: "data" }),
      });

      const result = normalizeEncryptedBodyRequestArgs(request);
      assert.strictEqual(result.url, "https://example.com/test");
      assert.strictEqual(result.init?.method, "POST");
      assert.ok(result.init?.headers instanceof Headers);
    });

    it("merges init options with Request", () => {
      const request = new Request("https://example.com/test", {
        method: "POST",
      });

      const result = normalizeEncryptedBodyRequestArgs(request, {
        headers: { "X-Custom": "header" },
      });

      assert.strictEqual(result.url, "https://example.com/test");
      assert.ok(result.init?.headers);
    });

    it("handles string URLs with init options", () => {
      const result = normalizeEncryptedBodyRequestArgs("https://example.com/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      assert.strictEqual(result.url, "https://example.com/test");
      assert.strictEqual(result.init?.method, "POST");
    });
  });

  describe("encryptedBodyRequest", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    it("rejects request when HPKE key mismatch occurs", async (t) => {
      const serverIdentity = await Identity.generate();
      const publicConfig = await serverIdentity.marshalConfig();
      const actualKeyHex = await serverIdentity.getPublicKeyHex();
      const expectedKey = "wrongkey123";

      globalThis.fetch = t.mock.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.includes("/.well-known/hpke-keys")) {
          return new Response(publicConfig as any, {
            status: 200,
            headers: { "content-type": PROTOCOL.KEYS_MEDIA_TYPE },
          });
        }
        return new Response("should not reach here");
      }) as any;

      try {
        await assert.rejects(
          () => encryptedBodyRequest("https://example.com/test", expectedKey),
          (err: Error) => {
            assert.match(err.message, /HPKE public key mismatch/);
            assert.match(err.message, new RegExp(expectedKey));
            assert.match(err.message, new RegExp(actualKeyHex));
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it("fetches HPKE key from correct origin when enclaveURL provided", async (t) => {
      const serverIdentity = await Identity.generate();
      const publicConfig = await serverIdentity.marshalConfig();
      const keyHex = await serverIdentity.getPublicKeyHex();

      let keyFetchedFromCorrectOrigin = false;

      globalThis.fetch = t.mock.fn(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.includes("enclave.example.com") && url.includes("/.well-known/hpke-keys")) {
          keyFetchedFromCorrectOrigin = true;
          return new Response(publicConfig as any, {
            status: 200,
            headers: { "content-type": PROTOCOL.KEYS_MEDIA_TYPE },
          });
        }
        return new Response("should not reach here");
      }) as any;

      try {
        await assert.rejects(
          () => encryptedBodyRequest(
            "https://api.example.com/test",
            keyHex,
            undefined,
            "https://enclave.example.com"
          )
        );
        assert.ok(keyFetchedFromCorrectOrigin, "Key should be fetched from enclave origin");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe("createEncryptedBodyFetch", () => {
    it("resolves absolute path URLs against baseURL origin", () => {
      const normalized = normalizeEncryptedBodyRequestArgs("/users");
      const targetUrl = new URL(normalized.url, "https://api.example.com/v1");
      assert.strictEqual(targetUrl.toString(), "https://api.example.com/users");
    });

    it("resolves relative URLs against baseURL", () => {
      const normalized = normalizeEncryptedBodyRequestArgs("users");
      const targetUrl = new URL(normalized.url, "https://api.example.com/v1/");
      assert.strictEqual(targetUrl.toString(), "https://api.example.com/v1/users");
    });

    it("handles absolute URLs correctly", () => {
      const normalized = normalizeEncryptedBodyRequestArgs("https://other.example.com/endpoint");
      const targetUrl = new URL(normalized.url, "https://api.example.com/v1");
      assert.strictEqual(targetUrl.toString(), "https://other.example.com/endpoint");
    });

    it("returns a function with fetch signature", () => {
      const customFetch = createEncryptedBodyFetch("https://api.example.com", "mockkey123");
      assert.strictEqual(typeof customFetch, "function");
      assert.strictEqual(customFetch.length, 2);
    });

    it("accepts enclaveURL parameter", () => {
      const customFetch = createEncryptedBodyFetch(
        "https://api.example.com",
        "mockkey123",
        "https://enclave.example.com"
      );
      assert.strictEqual(typeof customFetch, "function");
    });

    it("exposes Response constructor for OpenAI SDK FormData support detection", () => {
      const customFetch = createEncryptedBodyFetch(
        "https://api.example.com",
        "mockkey123"
      );

      // The OpenAI SDK checks 'Response' in fetch to avoid making a test request to 'data:,'
      assert.ok("Response" in customFetch, "fetch should have Response property");
      assert.strictEqual(customFetch.Response, Response, "Response property should be the global Response constructor");
    });
  });
});
