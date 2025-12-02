import { describe, it } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

const MOCK_MEASUREMENT_TYPE = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("SecureClient", () => {
  it("should create a client and initialize securely", async (t) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: undefined,
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));
    
    const mockFetch = t.mock.fn(async () => new Response(JSON.stringify({ message: "success" })));
    const createSecureFetchMock = t.mock.fn(
      (_baseURL: string, _enclaveURL: string | undefined, hpkePublicKey: string | undefined, _tlsPublicKeyFingerprint: string | undefined) => {
        if (hpkePublicKey) {
          return mockFetch;
        }
        throw new Error("TLS-only verification not supported in tests");
      },
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
                  hpkePublicKey: "mock-hpke-public-key",
                  measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                },
                tlsPublicKey: "test-tls-public-key",
                hpkePublicKey: "mock-hpke-public-key",
                codeFingerprint: "test-code-fingerprint",
                enclaveFingerprint: "test-enclave-fingerprint",
                selectedRouterEndpoint: "test.example.com",
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
        "tinfoil/secure-fetch": { createSecureFetch: createSecureFetchMock },
      },
      ["../secure-client"],
      async () => {
        const { SecureClient } = await import("../secure-client");
        
        const client = new SecureClient({
          baseURL: "https://test.example.com/",
          enclaveURL: "https://keys.test.example.com/",
          configRepo: "test-org/test-repo",
        });

        await client.ready();
        
        assert.strictEqual(verifyMock.mock.callCount(), 1, "verify should be called once");
        assert.strictEqual(createSecureFetchMock.mock.callCount(), 1, "createSecureFetch should be called once");
        // Check that createSecureFetch was called with the right parameters
        assert.strictEqual(createSecureFetchMock.mock.calls[0]?.arguments[0], "https://test.example.com/");
        assert.strictEqual(createSecureFetchMock.mock.calls[0]?.arguments[1], "https://keys.test.example.com/");
        assert.strictEqual(createSecureFetchMock.mock.calls[0]?.arguments[2], "mock-hpke-public-key");
        assert.strictEqual(createSecureFetchMock.mock.calls[0]?.arguments[3], undefined);
      },
    );
  });

  it("should provide a fetch function that works correctly", async (t) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: undefined,
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));
    
    const mockResponseBody = { test: "response" };
    const mockFetch = t.mock.fn(async () => new Response(JSON.stringify(mockResponseBody)));
    const createSecureFetchMock = t.mock.fn(
      (_baseURL: string, _enclaveURL: string | undefined, hpkePublicKey: string | undefined, _tlsPublicKeyFingerprint: string | undefined) => {
        if (hpkePublicKey) {
          return mockFetch;
        }
        throw new Error("TLS-only verification not supported in tests");
      },
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
                  hpkePublicKey: "mock-hpke-public-key",
                  measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                },
                tlsPublicKey: "test-tls-public-key",
                hpkePublicKey: "mock-hpke-public-key",
                codeFingerprint: "test-code-fingerprint",
                enclaveFingerprint: "test-enclave-fingerprint",
                selectedRouterEndpoint: "test.example.com",
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
        "tinfoil/secure-fetch": { createSecureFetch: createSecureFetchMock },
      },
      ["../secure-client"],
      async () => {
        const { SecureClient } = await import("../secure-client");
        
        const client = new SecureClient({
          baseURL: "https://test.example.com/",
        });

        const response = await client.fetch("/test-endpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ test: "data" }),
        });
        
        const responseBody = await response.json();
        
        assert.strictEqual(verifyMock.mock.callCount(), 1, "verify should be called once");
        assert.strictEqual(mockFetch.mock.callCount(), 1, "mockFetch should be called once");
        assert.deepStrictEqual(responseBody, mockResponseBody, "Response body should match");
      },
    );
  });

  it("should handle verification document retrieval", async (t) => {
    const mockVerificationDocument = {
      configRepo: "test-repo",
      enclaveHost: "test-host",
      releaseDigest: "test-digest",
      codeMeasurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
      enclaveMeasurement: {
        hpkePublicKey: "mock-hpke-public-key",
        measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
      },
      match: true,
    };

    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: undefined,
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));
    
    const mockFetch = t.mock.fn(async () => new Response(null));
    const createSecureFetchMock = t.mock.fn(
      (_baseURL: string, _enclaveURL: string | undefined, hpkePublicKey: string | undefined, _tlsPublicKeyFingerprint: string | undefined) => {
        if (hpkePublicKey) {
          return mockFetch;
        }
        throw new Error("TLS-only verification not supported in tests");
      },
    );

    await withMockedModules(
      {
        "./verifier": {
          Verifier: class {
            verify() {
              return verifyMock();
            }
            getVerificationDocument() {
              return mockVerificationDocument;
            }
          },
        },
        "tinfoil/secure-fetch": { createSecureFetch: createSecureFetchMock },
      },
      ["../secure-client"],
      async () => {
        const { SecureClient } = await import("../secure-client");
        
        const client = new SecureClient({
          baseURL: "https://test.example.com/",
        });

        const verificationDocument = await client.getVerificationDocument();
        
        assert.strictEqual(verifyMock.mock.callCount(), 1, "verify should be called once");
        assert.deepStrictEqual(verificationDocument, mockVerificationDocument, "Verification document should match");
      },
    );
  });

  it("should lazily initialize when fetch is first accessed", async (t) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: undefined,
      hpkePublicKey: "mock-hpke-public-key",
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));
    
    const mockFetch = t.mock.fn(async () => new Response(null));
    const createSecureFetchMock = t.mock.fn(
      (_baseURL: string, _enclaveURL: string | undefined, hpkePublicKey: string | undefined, _tlsPublicKeyFingerprint: string | undefined) => {
        if (hpkePublicKey) {
          return mockFetch;
        }
        throw new Error("TLS-only verification not supported in tests");
      },
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
                  hpkePublicKey: "mock-hpke-public-key",
                  measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                },
                tlsPublicKey: "test-tls-public-key",
                hpkePublicKey: "mock-hpke-public-key",
                codeFingerprint: "test-code-fingerprint",
                enclaveFingerprint: "test-enclave-fingerprint",
                selectedRouterEndpoint: "test.example.com",
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
        "tinfoil/secure-fetch": { createSecureFetch: createSecureFetchMock },
      },
      ["../secure-client"],
      async () => {
        const { SecureClient } = await import("../secure-client");
        
        const client = new SecureClient({
          baseURL: "https://test.example.com/",
        });

        // Verify that initialization hasn't happened yet
        assert.strictEqual(verifyMock.mock.callCount(), 0, "verify should not be called yet");
        assert.strictEqual(createSecureFetchMock.mock.callCount(), 0, "createSecureFetch should not be called yet");
        
        // Access fetch for the first time - this should trigger initialization
        await client.fetch("/test", { method: "GET" });
        
        // Verify that initialization happened
        assert.strictEqual(verifyMock.mock.callCount(), 1, "verify should be called once");
        assert.strictEqual(createSecureFetchMock.mock.callCount(), 1, "createSecureFetch should be called once");
      },
    );
  });
});