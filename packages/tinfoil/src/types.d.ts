import type { AttestationMeasurement } from './verifier';

declare global {
  let Go: any;
  let verifyEnclave: (enclaveHostname: string) => Promise<{
    measurement: AttestationMeasurement;
    tls_public_key: string;
    hpke_public_key: string;
  }>;
  let verifyCode: (configRepo: string, digest: string) => Promise<AttestationMeasurement | string>;
}

export {};
