# Tinfoil Node SDK

[![Build Status](https://github.com/tinfoilsh/tinfoil-node/actions/workflows/test.yml/badge.svg)](https://github.com/tinfoilsh/tinfoil-node/actions)
[![NPM version](https://img.shields.io/npm/v/tinfoil.svg)](https://npmjs.org/package/tinfoil)
[![Documentation](https://img.shields.io/badge/docs-tinfoil.sh-blue)](https://docs.tinfoil.sh/sdk/node-sdk)

Secure OpenAI-compatible client for Tinfoil Private Inference. Verifies enclave attestation and encrypts all payloads using [HPKE (RFC 9180)](https://www.rfc-editor.org/rfc/rfc9180.html) via the [EHBP protocol](https://github.com/tinfoilsh/encrypted-http-body-protocol).

## Installation

```bash
npm install tinfoil
```

Requires Node 20+. Works in browsers with ES2022 support.

## Quick Start

```typescript
import { TinfoilAI } from "tinfoil";

const client = new TinfoilAI({
  apiKey: "<YOUR_API_KEY>", // or use TINFOIL_API_KEY env var
});

const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
  model: "llama3-3-70b",
});
```

## Browser Usage

```javascript
import { TinfoilAI } from 'tinfoil';

const client = new TinfoilAI({
  apiKey: 'your-api-key',
  dangerouslyAllowBrowser: true
});

await client.ready();

const completion = await client.chat.completions.create({
  model: 'llama3-3-70b',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

> **Warning:** Using API keys in the browser exposes them to anyone viewing your page source. Use a backend server for production.

## Verification API

```typescript
import { Verifier } from "tinfoil";

const verifier = new Verifier({ serverURL: "https://enclave.host.com" });

const attestation = await verifier.verify();
console.log(attestation.tlsPublicKeyFingerprint);
console.log(attestation.hpkePublicKey);

const doc = verifier.getVerificationDocument();
console.log(doc.securityVerified);
console.log(doc.steps); // fetchDigest, verifyCode, verifyEnclave, compareMeasurements
```

## Project Structure

This is a monorepo with two packages:

| Package | Description |
|---------|-------------|
| `packages/tinfoil` | Main SDK (published as `tinfoil`) |
| `packages/verifier` | Attestation verifier (published as `@tinfoilsh/verifier`) |

Browser builds use `*.browser.ts` files selected via conditional exports.

## Development

```bash
# Install dependencies
npm install

# Build all packages (verifier first, then tinfoil)
npm run build

# Run all tests
npm test

# Run browser tests
npm run test:browser

# Run integration tests (makes real network requests)
npm run test:integration
npm run test:browser:integration

# Clean build artifacts
npm run clean
```

### Test File Naming

- `*.test.ts` - Node.js unit tests
- `*.browser.test.ts` - Browser unit tests
- `*.browser.integration.test.ts` - Browser integration tests

## Documentation

- [Official SDK Documentation](https://docs.tinfoil.sh/sdk/node-sdk)
- [Examples](https://github.com/tinfoilsh/tinfoil-node/blob/main/examples/README.md)
- [OpenAI Client Reference](https://github.com/openai/openai-node) (API is compatible)

## Reporting Vulnerabilities

Email [security@tinfoil.sh](mailto:security@tinfoil.sh) or open a GitHub issue. We respond within 24 hours.
