import { describe, it } from "node:test";
import assert from "node:assert";

const RUN_INTEGRATION = process.env.RUN_TINFOIL_INTEGRATION === "true";
const SKIP_MESSAGE = "Set RUN_TINFOIL_INTEGRATION=true to enable network integration tests.";

describe("TinfoilAI - inference.tinfoil.sh integration", () => {
  it("should verify enclave with confidential-inference-proxy repo", async (t) => {
    if (!RUN_INTEGRATION) {
      t.skip(SKIP_MESSAGE);
      return;
    }

    const { TinfoilAI } = await import("../client");
    const client = new TinfoilAI({
      baseURL: "https://inference.tinfoil.sh/v1/",
      configRepo: "tinfoilsh/confidential-inference-proxy",
    });

    await client.ready();

    // Get the verification document to ensure verification happened
    const verificationDoc = await client.getVerificationDocument();
    
    assert.ok(verificationDoc, "Verification document should be available");
    assert.strictEqual(verificationDoc.repo, "tinfoilsh/confidential-inference-proxy", "Should use confidential-inference-proxy repo");
    assert.ok(verificationDoc.match, "Verification should match");
    
    // TLS fingerprint should always be available
    assert.ok(verificationDoc.enclaveMeasurement.tlsPublicKeyFingerprint, "TLS public key fingerprint should be available");
    
    // HPKE is optional - if not available, TLS-only verification is used
    if (verificationDoc.enclaveMeasurement.hpkePublicKey) {
      console.log("HPKE public key available - using encrypted body transport");
    } else {
      console.log("HPKE not available - using TLS-only verification");
    }

    console.log("Verification document:", verificationDoc);
  });
});
