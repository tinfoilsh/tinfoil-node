# Tinfoil Verifier

Browser-compatible TypeScript library for verifying AMD SEV-SNP attestation reports and Sigstore bundles.

## Features

- **AMD SEV-SNP Attestation Verification**
  - Browser-compatible (uses Web Crypto API)
  - VCEK certificate chain validation (ARK → ASK → VCEK)
  - Support for v1 (uncompressed) and v2 (gzip compressed) attestation formats
  - Dynamic VCEK fetching from KDS

- **Sigstore Verification**
  - GitHub attestation bundle verification
  - DSSE envelope validation
  - Certificate chain verification with Fulcio
  - Rekor transparency log validation
  - TUF-based trusted root updates

- **End-to-End Enclave Verification**
  - Fetch attestations from enclave endpoints
  - Verify AMD attestation + Sigstore bundles in one flow
  - Compare code measurements with runtime attestation
  - Support for pinned measurements or GitHub-based verification

## Installation

```bash
npm install @tinfoilsh/verifier-js
```

## Usage

### Basic AMD Attestation Verification

```typescript
import { verifyAttestation } from '@tinfoilsh/verifier-js';

const doc = {
  format: 'https://tinfoil.sh/predicate/sev-snp-guest/v2',
  body: '<base64-encoded-attestation>'
};

const result = await verifyAttestation(doc);
console.log(result.measurement.registers);
```

### Full Enclave Verification with GitHub

```typescript
import { SecureClient } from '@tinfoilsh/verifier-js';

const client = new SecureClient({
  repo: 'tinfoilsh/confidential-model-router',
  enclave: 'example.tinfoil.sh'
});

const verification = await client.verify();
console.log(verification.publicKeyFingerprint);
console.log(verification.measurement);
```

### Verification with Pinned Measurement

```typescript
import { SecureClient } from '@tinfoilsh/verifier-js';

const client = new SecureClient({
  measurement: {
    type: 'https://tinfoil.sh/predicate/sev-snp-guest/v2',
    registers: ['ff18f0a28cd150bb...']
  },
  enclave: 'example.tinfoil.sh'
});

const verification = await client.verify();
```

## Development

```bash
npm install
npm run build
npm test
```
