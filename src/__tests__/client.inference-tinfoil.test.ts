import { describe, it } from "node:test";
import assert from "node:assert";

const RUN_INTEGRATION = process.env.RUN_TINFOIL_INTEGRATION === "true";
const SKIP_MESSAGE = "Set RUN_TINFOIL_INTEGRATION=true to enable network integration tests.";

console.log("- RUN_TINFOIL_INTEGRATION:", process.env.RUN_TINFOIL_INTEGRATION);

describe("TinfoilAI - API integration", () => {
  it("should verify enclave with confidential-model-router repo", async (t) => {
    if (!RUN_INTEGRATION) {
      t.skip(SKIP_MESSAGE);
      return;
    }

    const { TinfoilAI } = await import("../tinfoilai");
    const { TINFOIL_CONFIG } = await import("../config");
    const API_KEY = "MOCK_API_KEY";

    const client = new TinfoilAI({
      apiKey: API_KEY,
    });

    try {
      await client.ready();

      // Get the verification document to ensure verification happened
      const verificationDoc = await client.getVerificationDocument();

      assert.ok(verificationDoc, "Verification document should be available");
      assert.strictEqual(verificationDoc.configRepo, TINFOIL_CONFIG.INFERENCE_PROXY_REPO, "Should use configured repo");
      assert.ok(verificationDoc.securityVerified, "Security should be verified");
      
      // TLS fingerprint should always be available
      assert.ok(verificationDoc.enclaveMeasurement.tlsPublicKeyFingerprint, "TLS public key fingerprint should be available");
      
    } catch (error) {
      console.error("Test failed with error:", error);
      throw error;
    }
  });
});