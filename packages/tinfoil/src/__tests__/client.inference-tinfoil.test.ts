import { describe, it, expect } from "vitest";

const RUN_INTEGRATION = process.env.RUN_TINFOIL_INTEGRATION === "true";

describe("TinfoilAI - API integration", () => {
  it.skipIf(!RUN_INTEGRATION)("should verify enclave with confidential-model-router repo", async () => {
    const { TinfoilAI } = await import("../tinfoilai");
    const { TINFOIL_CONFIG } = await import("../config");
    const API_KEY = "MOCK_API_KEY";

    const client = new TinfoilAI({
      apiKey: API_KEY,
    });

    await client.ready();

    // Get the verification document to ensure verification happened
    const verificationDoc = await client.getVerificationDocument();

    expect(verificationDoc).toBeTruthy();
    expect(verificationDoc?.configRepo).toBe(TINFOIL_CONFIG.INFERENCE_PROXY_REPO);
    expect(verificationDoc?.securityVerified).toBe(true);

    // TLS fingerprint should always be available
    expect(verificationDoc?.enclaveMeasurement.tlsPublicKeyFingerprint).toBeTruthy();
  });
});
