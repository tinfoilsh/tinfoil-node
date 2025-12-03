import { describe, it, expect } from 'vitest';
import { Verifier } from '../src/client.js';

describe('Browser Integration Tests', () => {
  describe('Verifier against real enclave', () => {
    it('should verify enclave with default config repo', async () => {
      const verifier = new Verifier({
        serverURL: 'https://inference.tinfoil.sh'
      });

      const result = await verifier.verify();

      expect(result).toBeDefined();
      expect(result.measurement).toBeDefined();
      expect(result.measurement.type).toBeTruthy();
      expect(result.measurement.registers).toBeInstanceOf(Array);
      expect(result.measurement.registers.length).toBeGreaterThan(0);

      const doc = verifier.getVerificationDocument();
      expect(doc).toBeDefined();
      expect(doc!.securityVerified).toBe(true);
      expect(doc!.steps.fetchDigest.status).toBe('success');
      expect(doc!.steps.verifyCode.status).toBe('success');
      expect(doc!.steps.verifyEnclave.status).toBe('success');
      expect(doc!.steps.compareMeasurements.status).toBe('success');
    }, 30000);

    it('should return TLS public key fingerprint', async () => {
      const verifier = new Verifier({
        serverURL: 'https://inference.tinfoil.sh'
      });

      const result = await verifier.verify();

      expect(result.tlsPublicKeyFingerprint).toBeDefined();
      expect(result.tlsPublicKeyFingerprint).toMatch(/^[0-9a-f]+$/i);
    }, 30000);

    it('should return HPKE public key', async () => {
      const verifier = new Verifier({
        serverURL: 'https://inference.tinfoil.sh'
      });

      const result = await verifier.verify();

      expect(result.hpkePublicKey).toBeDefined();
      expect(result.hpkePublicKey!.length).toBeGreaterThan(0);
    }, 30000);

    it('should populate verification document fingerprints', async () => {
      const verifier = new Verifier({
        serverURL: 'https://inference.tinfoil.sh'
      });

      await verifier.verify();
      const doc = verifier.getVerificationDocument();

      expect(doc!.codeFingerprint).toBeTruthy();
      expect(doc!.enclaveFingerprint).toBeTruthy();
      expect(doc!.releaseDigest).toBeTruthy();
      expect(doc!.tlsPublicKey).toBeTruthy();
    }, 30000);
  });

  describe('Verification failure handling', () => {
    it('should handle invalid server URL gracefully', async () => {
      const verifier = new Verifier({
        serverURL: 'https://invalid-enclave-that-does-not-exist.tinfoil.sh'
      });

      await expect(verifier.verify()).rejects.toThrow();

      const doc = verifier.getVerificationDocument();
      expect(doc).toBeDefined();
      expect(doc!.securityVerified).toBe(false);
    }, 15000);
  });
});
