import { describe, it } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert";
import { TINFOIL_CONFIG } from "../config";
import { withMockedModules } from "./test-utils";

const MOCK_MEASUREMENT_TYPE = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("Secure transport integration", () => {
  it("configures the OpenAI SDK to use the encrypted body transport", async (t: TestContext) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: "fingerprint",
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));
    const mockFetch = t.mock.fn(async () => new Response(null));
    const createSecureFetchMock = t.mock.fn(
      (_baseURL: string, _enclaveURL?: string, _hpkePublicKey?: string, _tlsPublicKeyFingerprint?: string) => mockFetch,
    );
    const openAIConstructorMock = t.mock.fn(function (this: unknown, options: {
      fetch?: typeof fetch;
    }) {
      return {
        options,
        chat: {},
        files: {},
        images: {},
        audio: {},
        embeddings: {},
        models: {},
        moderations: {},
        beta: {},
      };
    });
    const createOpenAICompatibleMock = t.mock.fn(
      (options: { fetch: typeof fetch }) => ({ __mockProvider: true }),
    );

    await withMockedModules(
      {
        "./verifier": {
          Verifier: class {
            verify() {
              return verifyMock();
            }
            getVerificationDocument() {
              return {
                configRepo: "test-repo",
                enclaveHost: "test-host",
                releaseDigest: "test-digest",
                codeMeasurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                enclaveMeasurement: {
                  tlsPublicKeyFingerprint: "fingerprint",
                  hpkePublicKey: "mock-hpke-public-key",
                  measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                },
                tlsPublicKey: "test-tls-public-key",
                hpkePublicKey: "mock-hpke-public-key",
                codeFingerprint: "test-code-fingerprint",
                enclaveFingerprint: "test-enclave-fingerprint",
                selectedRouterEndpoint: "test-router.tinfoil.sh",
                securityVerified: true,
                steps: {
                  fetchDigest: { status: "success" },
                  verifyCode: { status: "success" },
                  verifyEnclave: { status: "success" },
                  compareMeasurements: { status: "success" },
                },
              };
            }
          },
        },
        "tinfoil/secure-fetch": {
          createSecureFetch: createSecureFetchMock,
        },
        openai: Object.assign(openAIConstructorMock, {
          OpenAI: openAIConstructorMock,
        }),
        "@ai-sdk/openai-compatible": {
          createOpenAICompatible: createOpenAICompatibleMock,
        },
      },
      ["../client"],
      async () => {
        const { TinfoilAI } = await import("../tinfoilai");
        const testBaseURL = "https://test-router.tinfoil.sh/v1/";
        const testEnclaveURL = "https://test-router.tinfoil.sh";
        
        const client = new TinfoilAI({ 
          apiKey: "test",
          baseURL: testBaseURL,
          enclaveURL: testEnclaveURL
        });
        await client.ready();

        assert.strictEqual(verifyMock.mock.callCount(), 1);
        assert.strictEqual(createSecureFetchMock.mock.callCount(), 1);
        assert.deepStrictEqual(createSecureFetchMock.mock.calls[0]?.arguments, [
          testBaseURL,
          testEnclaveURL,
          "mock-hpke-public-key",
          "fingerprint",
        ]);
        assert.strictEqual(openAIConstructorMock.mock.callCount(), 1);
        const options = openAIConstructorMock.mock.calls[0]?.arguments[0] as {
          baseURL: string;
          fetch: typeof fetch;
        } | undefined;
        assert.ok(options, "OpenAI constructor options should be provided");
        assert.strictEqual(options.baseURL, testBaseURL);
        assert.ok(options.fetch, "fetch function should be provided");
      },
    );
  });

  it("provides the encrypted body transport to the AI SDK provider", async (t: TestContext) => {
    const mockFetch = t.mock.fn(async () => new Response(null));
    const mockVerificationDocument = {
      configRepo: "test-repo",
      enclaveHost: "test-host",
      releaseDigest: "test-digest",
      codeMeasurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
      enclaveMeasurement: {
        tlsPublicKeyFingerprint: "fingerprint",
        hpkePublicKey: "mock-hpke-public-key",
        measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
      },
      tlsPublicKey: "test-tls-public-key",
      hpkePublicKey: "mock-hpke-public-key",
      codeFingerprint: "test-code-fingerprint",
      enclaveFingerprint: "test-enclave-fingerprint",
      selectedRouterEndpoint: "test-router.tinfoil.sh",
      securityVerified: true,
      steps: {
        fetchDigest: { status: "success" },
        verifyCode: { status: "success" },
        verifyEnclave: { status: "success" },
        compareMeasurements: { status: "success" },
      },
    };
    
    const createOpenAICompatibleMock = t.mock.fn(
      (options: { fetch: typeof fetch }) => ({ __mockProvider: true }),
    );

    await withMockedModules(
      {
        "./secure-client": {
          SecureClient: class {
            constructor() {}
            
            async ready() {
              // Mock ready method
            }
            
            async getVerificationDocument() {
              return mockVerificationDocument;
            }
            
            getBaseURL() {
              return "https://test-router.tinfoil.sh/v1/";
            }
            
            get fetch() {
              return mockFetch;
            }
          },
        },
        "@ai-sdk/openai-compatible": {
          createOpenAICompatible: createOpenAICompatibleMock,
        },
      },
      ["../ai-sdk-provider"],
      async () => {
        const { createTinfoilAI } = await import("../ai-sdk-provider");
        const provider = await createTinfoilAI("api-key");

        assert.strictEqual(createOpenAICompatibleMock.mock.callCount(), 1);
        const options = createOpenAICompatibleMock.mock.calls[0]?.arguments[0] as {
          fetch: typeof fetch;
        } | undefined;
        assert.ok(options, "Provider options should be provided");
        assert.ok(options.fetch, "fetch function should be provided");
        assert.deepStrictEqual(provider, { __mockProvider: true });
      },
    );
  });
});
