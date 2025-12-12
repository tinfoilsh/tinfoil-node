# @tinfoilsh/verifier

Browser-compatible TypeScript library for verifying AMD SEV-SNP attestation reports and Sigstore code provenance.

## Installation

```bash
npm install @tinfoilsh/verifier
```

## Usage

```typescript
import { Verifier } from '@tinfoilsh/verifier';

const verifier = new Verifier({ serverURL: 'https://enclave.example.com' });
const attestation = await verifier.verify();

console.log(attestation.measurement);
console.log(attestation.tlsPublicKeyFingerprint);
console.log(attestation.hpkePublicKey);
```

## Features

- AMD SEV-SNP attestation verification (VCEK certificate chain validation)
- Sigstore code provenance verification (Fulcio + Rekor)
- TUF-based trusted root updates
- Works in Node.js and browsers (uses Web Crypto API)

### TODOs
- [ ] add support for TDX attestation verification 

## Development

```bash
npm run build
npm test
npm run test:browser
```
