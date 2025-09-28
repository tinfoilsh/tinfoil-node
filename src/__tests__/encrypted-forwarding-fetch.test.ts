import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

describe("forwarding encrypted fetch", () => {
  it("builds for enclave host and sends to proxy with forward header", async (t: TestContext) => {
    const forwardedRequests: Request[] = [];
    const originalFetch = globalThis.fetch;
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const req = input as Request;
      forwardedRequests.push(req);
      return new Response(null);
    });
    // @ts-ignore override global fetch for test
    globalThis.fetch = fetchMock as any;

    try {
      const encryptedBody = new TextEncoder().encode("ciphertext");
      const buildMock = t.mock.fn(async (url: string, init?: RequestInit) => {
        // Simulate encrypted request built for the enclave destination
        const headers = new Headers(init?.headers);
        headers.set("Ehbp-Encapsulated-Key", "abcd");
        headers.set("Ehbp-Client-Public-Key", "1234");
        return new Request(url, {
          method: init?.method || "POST",
          headers,
          body: encryptedBody,
        });
      });

      await withMockedModules(
        {
          "./ehbp-request-builder": {
            EhbpRequestBuilder: class {
              constructor(public base: string) {}
              build = buildMock;
            },
          },
        },
        ["../encrypted-forwarding-fetch"],
        async () => {
          const { createForwardingEncryptedFetch } = await import(
            "../encrypted-forwarding-fetch"
          );

          const inferenceBaseURL = "https://enclave.example/v1/";
          const proxyBaseURL = "https://proxy.example/";
          const secureFetch = createForwardingEncryptedFetch(
            inferenceBaseURL,
            proxyBaseURL,
          );

          await secureFetch("/chat", { method: "POST", headers: { A: "1" }, body: "x" });

          // Build was invoked with enclave destination URL
          const buildArgs = buildMock.mock.calls[0]?.arguments;
          assert.ok(buildArgs);
          assert.strictEqual(buildArgs[0], "https://enclave.example/chat");

          // The actual network request was sent to proxy with forward header
          assert.strictEqual(fetchMock.mock.callCount(), 1);
          const sent = forwardedRequests[0]!;
          assert.strictEqual(new URL(sent.url).origin, "https://proxy.example");
          const headers = new Headers(sent.headers);
          assert.strictEqual(headers.get("Ehbp-Encapsulated-Key"), "abcd");
          assert.strictEqual(headers.get("Ehbp-Client-Public-Key"), "1234");
          assert.strictEqual(headers.get("Ehbp-Forward-To"), "https://enclave.example/chat");
          assert.strictEqual(headers.get("Ehbp-Forward-Method"), "POST");
          const body = new Uint8Array(await sent.arrayBuffer());
          assert.deepStrictEqual(Array.from(body), Array.from(encryptedBody));
        },
      );
    } finally {
      // @ts-ignore restore original fetch
      globalThis.fetch = originalFetch as any;
    }
  });

  it("always POSTs to proxy and carries desired method in header", async (t: TestContext) => {
    const forwardedRequests: Request[] = [];
    const originalFetch = globalThis.fetch;
    const fetchMock = t.mock.fn(async (input: RequestInfo) => {
      const req = input as Request;
      forwardedRequests.push(req);
      return new Response(null);
    });
    // @ts-ignore override global fetch for test
    globalThis.fetch = fetchMock as any;

    try {
      const buildMock = t.mock.fn(async (url: string, init?: RequestInit) => {
        return new Request(url, { method: init?.method || "GET", headers: init?.headers });
      });

      await withMockedModules(
        {
          "./ehbp-request-builder": {
            EhbpRequestBuilder: class {
              constructor(public base: string) {}
              build = buildMock;
            },
          },
        },
        ["../encrypted-forwarding-fetch"],
        async () => {
          const { createForwardingEncryptedFetch } = await import(
            "../encrypted-forwarding-fetch"
          );

          const inferenceBaseURL = "https://enclave.example/v1/";
          const proxyBaseURL = "https://proxy.example/";
          const secureFetch = createForwardingEncryptedFetch(
            inferenceBaseURL,
            proxyBaseURL,
          );

          await secureFetch("/models", { method: "GET" });

          assert.strictEqual(fetchMock.mock.callCount(), 1);
          const sent = forwardedRequests[0]!;
          assert.strictEqual(sent.method, "POST");
          const headers = new Headers(sent.headers);
          assert.strictEqual(headers.get("Ehbp-Forward-Method"), "GET");
        },
      );
    } finally {
      // @ts-ignore restore original fetch
      globalThis.fetch = originalFetch as any;
    }
  });
});
