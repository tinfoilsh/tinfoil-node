import { describe, it, expect } from 'vitest';
import { X509Certificate } from '@freedomofpress/sigstore-browser';
import { ARK_CERT, ASK_CERT } from '../src/sev/certs.js';

describe('AMD Certificate Chain Verification', () => {
  it('parses ARK certificate correctly', () => {
    const ark = X509Certificate.parse(ARK_CERT);
    expect(ark.version).toBe('v3');
    expect(ark.signatureAlgorithm).toBe('sha384');
  });

  it('parses ASK certificate correctly', () => {
    const ask = X509Certificate.parse(ASK_CERT);
    expect(ask.version).toBe('v3');
    expect(ask.signatureAlgorithm).toBe('sha384');
  });

  it('validates ARK date range', () => {
    const ark = X509Certificate.parse(ARK_CERT);
    const now = new Date();
    expect(ark.validForDate(now)).toBe(true);
  });

  it('validates ASK date range', () => {
    const ask = X509Certificate.parse(ASK_CERT);
    const now = new Date();
    expect(ask.validForDate(now)).toBe(true);
  });

  it('verifies ARK self-signature with RSA-PSS', async () => {
    const ark = X509Certificate.parse(ARK_CERT);
    const selfSigned = await ark.verify();
    expect(selfSigned).toBe(true);
  });

  it('verifies ASK signed by ARK with RSA-PSS', async () => {
    const ark = X509Certificate.parse(ARK_CERT);
    const ask = X509Certificate.parse(ASK_CERT);
    const signedByArk = await ask.verify(ark);
    expect(signedByArk).toBe(true);
  });
});
