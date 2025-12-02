import { describe, it } from "node:test";
import assert from "node:assert";
import { withMockedModules } from "./test-utils";

const MOCK_MEASUREMENT_TYPE = "https://tinfoil.sh/predicate/sev-snp-guest/v1";

describe("SecureClient (browser)", () => {
  it("should reject initialization when HPKE is not available in browser", async (t) => {
    const verifyMock = t.mock.fn(async () => ({
      tlsPublicKeyFingerprint: "mock-tls-fingerprint",
      hpkePublicKey: undefined, // No HPKE key available
      measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
    }));

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
                  hpkePublicKey: undefined,
                  tlsPublicKeyFingerprint: "mock-tls-fingerprint",
                  measurement: { type: MOCK_MEASUREMENT_TYPE, registers: [] },
                },
                securityVerified: true,
                steps: {
                  fetchDigest: { status: 'success' as const },
                  verifyCode: { status: 'success' as const },
                  verifyEnclave: { status: 'success' as const },
                  compareMeasurements: { status: 'success' as const },
                },
              };
            }
          },
        },
        "./env": { isRealBrowser: () => true },
      },
      ["../secure-client"],
      async () => {
        const { SecureClient } = await import("../secure-client");
        
        const client = new SecureClient({
          baseURL: "https://test.example.com/",
        });

        await assert.rejects(
          async () => await client.ready(),
          /HPKE public key not available and TLS-only verification is not supported in browsers/,
          "Should reject with appropriate error message"
        );
        
        assert.strictEqual(verifyMock.mock.callCount(), 1, "verify should be called once");
      },
    );
  });
});