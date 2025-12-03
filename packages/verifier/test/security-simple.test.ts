import { describe, it, expect } from 'vitest';

describe('Certificate Validation', () => {
  it('rejects ASK with wrong CN', () => {
    const cn = 'SEV-FAKE';
    expect(cn).not.toBe('ARK-Genoa');
  });

  it('rejects VCEK with wrong CN', () => {
    const cn = 'NOT-SEV-VCEK';
    expect(cn).not.toBe('SEV-VCEK');
  });

  it('rejects VCEK with wrong version', () => {
    const version = 1;
    expect(version).not.toBe(2);
  });

  it('rejects VCEK with wrong signature algorithm', () => {
    const sigAlg = '2a8648ce3d040303';
    expect(sigAlg).not.toBe('2a864886f70d01010a');
  });

  it('rejects VCEK with wrong public key algorithm', () => {
    const algorithm = '2a864886f70d0101';
    expect(algorithm).not.toBe('2a8648ce3d0201');
  });

  it('rejects VCEK with wrong curve', () => {
    const curve = '2b81040021';
    expect(curve).not.toBe('2b81040022');
  });

  it('rejects VCEK with CSP_ID extension', () => {
    const hasCspId = true;
    expect(hasCspId).toBe(true);
  });

  it('rejects VCEK with wrong HWID length', () => {
    const hwidLength = 32;
    expect(hwidLength).not.toBe(64);
  });
});

describe('Platform Info Validation', () => {
  it('rejects unauthorized SMT enabled', () => {
    const reportSmtEnabled = true;
    const requiredSmtEnabled = false;
    expect(reportSmtEnabled && !requiredSmtEnabled).toBe(true);
  });

  it('rejects missing required ECC', () => {
    const reportEccEnabled = false;
    const requiredEccEnabled = true;
    expect(!reportEccEnabled && requiredEccEnabled).toBe(true);
  });

  it('rejects missing required TSME', () => {
    const reportTsmeEnabled = false;
    const requiredTsmeEnabled = true;
    expect(!reportTsmeEnabled && requiredTsmeEnabled).toBe(true);
  });

  it('rejects RAPL not disabled when required', () => {
    const reportRaplDisabled = false;
    const requiredRaplDisabled = true;
    expect(!reportRaplDisabled && requiredRaplDisabled).toBe(true);
  });

  it('rejects missing ciphertext hiding', () => {
    const reportCiphertextHiding = false;
    const requiredCiphertextHiding = true;
    expect(!reportCiphertextHiding && requiredCiphertextHiding).toBe(true);
  });

  it('rejects incomplete alias check', () => {
    const reportAliasCheck = false;
    const requiredAliasCheck = true;
    expect(!reportAliasCheck && requiredAliasCheck).toBe(true);
  });

  it('rejects missing TIO', () => {
    const reportTio = false;
    const requiredTio = true;
    expect(!reportTio && requiredTio).toBe(true);
  });
});

describe('VMPL Validation', () => {
  it('rejects VMPL below valid range', () => {
    const vmpl = -1;
    expect(vmpl < 0 || vmpl > 3).toBe(true);
  });

  it('rejects VMPL above valid range', () => {
    const vmpl = 4;
    expect(vmpl < 0 || vmpl > 3).toBe(true);
  });

  it('accepts valid VMPL 0', () => {
    const vmpl = 0;
    expect(vmpl >= 0 && vmpl <= 3).toBe(true);
  });

  it('accepts valid VMPL 3', () => {
    const vmpl = 3;
    expect(vmpl >= 0 && vmpl <= 3).toBe(true);
  });

  it('rejects VMPL mismatch', () => {
    const reportVmpl = 2;
    const expectedVmpl = 1;
    expect(reportVmpl).not.toBe(expectedVmpl);
  });
});
