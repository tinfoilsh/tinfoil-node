# Tinfoil Node Client

[![Build Status](https://github.com/tinfoilsh/tinfoil-node/actions/workflows/test.yml/badge.svg)](https://github.com/tinfoilsh/tinfoil-node/actions)
[![NPM version](https://img.shields.io/npm/v/tinfoil.svg)](https://npmjs.org/package/tinfoil)

A Node.js wrapper around the OpenAI client that verifies enclave attestation and routes OpenAI-bound traffic through an [EHBP](https://github.com/tinfoilsh/encrypted-http-body-protocol)-secured transport when using Tinfoil inference.

## Requirements

Node 20.18.1 and higher.

## Installation

```bash
npm install tinfoil
```

## Quick Start

```typescript
import { TinfoilAI } from "tinfoil";

const client = new TinfoilAI({
  apiKey: "<YOUR_API_KEY>", // or use TINFOIL_API_KEY env var
});

// Uses identical method calls as the OpenAI client
const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
  model: "llama3-3-70b",
});
```

## Browser Support

The SDK supports browser environments. This allows you to use the secure enclave-backed OpenAI API directly from web applications.

### ⚠️ Security Warning

Using API keys directly in the browser exposes them to anyone who can view your page source.
For production applications, always use a backend server to handle API keys.

### Browser Usage

```javascript
import { TinfoilAI } from 'tinfoil';

const client = new TinfoilAI({
  apiKey: 'your-api-key',
  dangerouslyAllowBrowser: true // Required for browser usage
});

// Optional: pre-initialize; you can also call APIs directly
await client.ready();

const completion = await client.chat.completions.create({
  model: 'llama-free',
  messages: [{ role: 'user', content: 'Hello!' }]
});
```

### Browser Requirements

- Modern browsers with ES2020 support
- WebAssembly support for enclave verification
- Secure context (HTTPS or localhost) with WebCrypto SubtleCrypto (required by EHBP)


## Verification helpers

This package exposes verification helpers that load the Go-based WebAssembly verifier once per process and provide structured, stepwise attestation results you can use in applications (e.g., to show progress, log transitions, or gate features).

The verification functionality is split into two modules:
- `verifier.ts`: Core verification logic with low-level attestation methods
- `verification-runner.ts`: Higher-level orchestration with state management and subscriptions

### Core Verifier API

```typescript
import { Verifier } from "tinfoil";

const verifier = new Verifier();

// Perform runtime attestation
const runtime = await verifier.verifyEnclave("enclave.host.com");
// Returns: { measurement: AttestationMeasurement, tlsPublicKeyFingerprint: string, hpkePublicKey: string }

// Perform code attestation
const code = await verifier.verifyCode("tinfoilsh/repo", "digest-hash");
// Returns: { measurement: AttestationMeasurement }

// Fetch latest digest from GitHub releases
const digest = await verifier.fetchLatestDigest("tinfoilsh/repo");
```

### High-level Orchestration API

- `loadVerifier()` boots the verifier with state management and returns an enhanced client.
- `client.subscribe(callback)` subscribes to real-time verification state updates.
- `client.runVerification({ repo?, enclaveHost?, digest?, onUpdate? })` orchestrates the full flow and returns a structured result with step statuses and a comparison outcome. Both `repo` and `enclaveHost` default to values from `TINFOIL_CONFIG`.

### End-to-end orchestration

```typescript
import { loadVerifier, TINFOIL_CONFIG } from "tinfoil";

const verifier = await loadVerifier();

const result = await verifier.runVerification({
  onUpdate: (state) => {
    // Receive stepwise updates: pending -> loading -> success/error
    // Useful for logging or progress indicators
    console.log("verification update:", state);
  },
  // Optional: override defaults if needed
  // repo: "tinfoilsh/confidential-inference-proxy",
  // enclaveHost: https://inference.tinfoil.sh,
});

if (result.security.status === "success" && result.security.match) {
  console.log("Measurements match. Digest:", result.digest);
} else {
  console.error("Verification failed:", result);
}
```

`runVerification` returns:

```typescript
type VerificationResult = {
  code: { status: "pending" | "loading" | "success" | "error"; measurement?: AttestationMeasurement; error?: string };
  runtime: {
    status: "pending" | "loading" | "success" | "error";
    measurement?: AttestationMeasurement;
    tlsPublicKeyFingerprint?: string;
    hpkePublicKey?: string;
    error?: string;
  };
  security: { status: "pending" | "loading" | "success" | "error"; match?: boolean; error?: string };
  digest: string;
};
```

### Manual step-by-step use

```typescript
import { loadVerifier, TINFOIL_CONFIG } from "tinfoil";

const verifier = await loadVerifier();

// 1) Runtime attestation
const runtime = await verifier.verifyEnclave(new URL(TINFOIL_CONFIG.INFERENCE_BASE_URL).hostname);
console.log("Runtime measurement:", runtime.measurement);
console.log("TLS fingerprint:", runtime.tlsPublicKeyFingerprint);
console.log("HPKE key:", runtime.hpkePublicKey);

// 2) Get latest digest for a repo
const digest = await verifier.fetchLatestDigest("tinfoilsh/confidential-inference-proxy-hpke");

// 3) Source integrity attestation
const code = await verifier.verifyCode("tinfoilsh/confidential-inference-proxy-hpke", digest);
console.log("Code measurement:", code.measurement);

// 4) Platform-aware comparison
// The verifier automatically handles different platform types (TDX, SEV-SNP, multi-platform)
// No need to manually compare measurements - use runVerification() for automatic comparison
```

### Attestation Measurements

The verifier handles multiple TEE platform types with platform-specific measurement comparison logic:

- **Multi-platform format**: Contains measurements for both TDX and SEV-SNP platforms
- **TDX (Intel Trust Domain Extensions)**: Uses MRTD and RTMR registers
- **SEV-SNP (AMD Secure Encrypted Virtualization)**: Uses SNP measurement registers

When comparing measurements, the verifier automatically applies the correct platform-specific rules:
- Multi-platform to multi-platform: All registers must match
- Multi-platform to TDX: RTMR1 and RTMR2 must match
- Multi-platform to SEV-SNP: First register (SNP measurement) must match
- Same platform types: All registers must match

### Subscribe to state updates

```typescript
const verifier = await loadVerifier();
const unsubscribe = verifier.subscribe((state) => {
  console.log("state:", state);
});

// Run verification with default config (recommended)
await verifier.runVerification();

// Or override specific parameters if needed
// await verifier.runVerification({
//   repo: "tinfoilsh/confidential-inference-proxy",
//   enclaveHost: https://inference.tinfoil.sh,
// });

unsubscribe();

```

## EHBP Request Builder (no send)

If you need to generate an EHBP‑encrypted HTTP request without sending it (e.g., to forward through a different destination), use the request builder:

```ts
import { createEhbpRequestBuilder, TINFOIL_CONFIG } from "tinfoil";

// Fetches HPKE public key from the config host and caches identity
const builder = createEhbpRequestBuilder(TINFOIL_CONFIG.INFERENCE_BASE_URL);

// Build an encrypted Request targeting any destination URL
const encryptedReq = await builder.build(
  new Request("https://your-proxy.example/forward", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hello: "world" }),
  }),
);

// Now you can send the encrypted Request yourself
const resp = await fetch(encryptedReq);
```

Notes:
- The encryption uses the HPKE public key fetched from the config host, but the Request URL you pass into `build()` determines where you send it.
- The execution environment must be a secure context with WebCrypto SubtleCrypto available (HTTPS or localhost in browsers).

## Forwarding Mode (proxy + enclave key)

You can route all requests to any proxy POST endpoint while keeping bodies encrypted under the HPKE public key of the inference (enclave) host.

```ts
import { TinfoilAI, TINFOIL_CONFIG } from "tinfoil";

const client = new TinfoilAI({
  apiKey: "<YOUR_API_KEY>",
  // Proxy endpoint to receive a single POST with EHBP payload + forwarding headers
  proxyURL: "https://proxy.example/v1/",
});

// All requests go to the proxy URL, but are EHBP‑encrypted using the
// HPKE public key fetched from baseURL (the default enclave host).
const completion = await client.chat.completions.create({
  messages: [{ role: "user", content: "Hello!" }],
  model: "llama3-3-70b",
});
```

Advanced:
- For lower‑level access (outside the OpenAI client), use `createForwardingEncryptedFetch(inferenceBaseURL, proxyURL, options?)` which returns a `fetch` that encrypts for the inference host and sends to the proxy.

## Testing

The project includes both unit tests and integration tests:

### Running Unit Tests

```bash
npm test
```

This runs the test suite with unit tests and mocked components. These tests don't require network access and run quickly.

### Running Integration Tests

```bash
RUN_TINFOIL_INTEGRATION=true npm test
```

This runs the full test suite including integration tests that:
- Make actual network requests to Tinfoil services
- Perform real enclave attestation verification
- Test end-to-end functionality with live services

Integration tests are skipped by default to keep the test suite fast and avoid network dependencies during development.

## Running the Chat Example

The chat example demonstrates both streaming chat completions and real-time attestation verification with a visual progress UI.

1. Clone the repository

2. Install dependencies:

```bash
npm install
```

3. Optionally create a `.env` file with your configuration:

```bash
TINFOIL_API_KEY=<YOUR_API_KEY>
# Optional: Enable WASM debug logs
TINFOIL_ENABLE_WASM_LOGS=true
```

4. Run the example:

```bash
cd examples/chat
npx ts-node main.ts
```

The example will:
- Display a real-time verification progress showing each attestation step
- Verify the enclave's runtime and code measurements
- Compare measurements using platform-specific logic
- Stream chat completions through the verified secure channel

## API Documentation

This library mirrors the official OpenAI Node.js client for common endpoints (e.g., chat, images, embeddings) and types, and is designed to feel familiar. Some less commonly used surfaces may not be fully covered. See the [OpenAI client](https://github.com/openai/openai-node) for complete API usage and documentation.

## Reporting Vulnerabilities

Please report security vulnerabilities by either:

- Emailing [security@tinfoil.sh](mailto:security@tinfoil.sh)

- Opening an issue on GitHub on this repository

We aim to respond to security reports within 24 hours and will keep you updated on our progress.
