import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

describe("Forwarding transport integration", () => {
  it("sends via proxy while encrypting for specified host", async (t: TestContext) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: "fingerprint",
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: "eif", registers: [] },
    }));

    const mockFetch = t.mock.fn(async () => new Response(null));
    const createForwardingEncryptedFetchMock = t.mock.fn(
      (_inferenceBaseURL: string, _proxyURL: string) => mockFetch,
    );
    const openAIConstructorMock = t.mock.fn(function (this: unknown, options: {
      baseURL?: string;
      fetch?: typeof fetch;
    }) {
      return { options };
    });

    await withMockedModules(
      {
        "./verifier": {
          Verifier: class {
            verify() {
              return verifyMock();
            }
            getVerificationDocument() {
              return {
                repo: "test-repo",
                enclaveHost: "enclave-host",
                digest: "test-digest",
                codeMeasurement: { type: "eif", registers: [] },
                enclaveMeasurement: {
                  tlsPublicKeyFingerprint: "fingerprint",
                  hpkePublicKey: "mock-hpke-public-key",
                  measurement: { type: "eif", registers: [] },
                },
                match: true,
              };
            }
          },
        },
        "./encrypted-forwarding-fetch": {
          createForwardingEncryptedFetch: createForwardingEncryptedFetchMock,
        },
        openai: Object.assign(openAIConstructorMock, {
          OpenAI: openAIConstructorMock,
        }),
      },
      ["../client"],
      async () => {
        const { TinfoilAI } = await import("../client");
        const proxyURL = "https://proxy.example/v1/";
        const inferenceBaseURL = "https://default-enclave.example/v1/";
        const client = new TinfoilAI({
          apiKey: "test",
          proxyURL,
          baseURL: inferenceBaseURL,
        });
        await client.ready();

        // Verifier must verify the encryption target host (baseURL here)
        assert.strictEqual(verifyMock.mock.callCount(), 1);
        // Ensure we used forwarding fetch with correct params
        assert.deepStrictEqual(
          createForwardingEncryptedFetchMock.mock.calls[0]?.arguments,
          [inferenceBaseURL, proxyURL],
        );
        // Ensure OpenAI client was set up with proxy base URL and our mock fetch
        assert.strictEqual(openAIConstructorMock.mock.callCount(), 1);
        const options = openAIConstructorMock.mock.calls[0]?.arguments[0] as {
          baseURL: string;
          fetch: typeof fetch;
        } | undefined;
        assert.ok(options);
        assert.strictEqual(options.baseURL, proxyURL);
        assert.strictEqual(options.fetch, mockFetch);
      },
    );
  });
});
