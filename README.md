# Tinfoil Node Client

[![Build Status](https://github.com/tinfoilsh/tinfoil-node/actions/workflows/test.yml/badge.svg)](https://github.com/tinfoilsh/tinfoil-node/actions)
[![NPM version](https://img.shields.io/npm/v/tinfoil.svg)](https://npmjs.org/package/tinfoil)

A Node.js wrapper around the OpenAI client that verifies enclave attestation and routes OpenAI-bound traffic through an [EHBP](https://github.com/tinfoilsh/encrypted-http-body-protocol)-secured transport when using Tinfoil inference. EHBP encrypts all payloads directly to an attested enclave using [HPKE (RFC 9180)](https://www.rfc-editor.org/rfc/rfc9180.html).

## Installation

```bash
npm install tinfoil
```

## Requirements

Node 20+.

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
- `client.runVerification({ configRepo?, serverURL?, releaseDigest?, onUpdate? })` orchestrates the full flow and returns a structured result with step statuses and a comparison outcome. Both `configRepo` and `serverURL` default to values from `TINFOIL_CONFIG`.

### End-to-end verification 

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
  // configRepo: "tinfoilsh/confidential-inference-proxy",
  // serverURL: "https://inference.tinfoil.sh",
  // releaseDigest: "<specific-release-sha256>",
});

if (result.verification.status === "success" && result.verification.securityVerified) {
  console.log("Measurements match. Digest:", result.releaseDigest);
} else {
  console.error("Verification failed:", result);
}
```

`runVerification` returns:

```typescript
type VerificationResult = {
  code: { status: StepStatus; measurement?: AttestationMeasurement; error?: string };
  runtime: {
    status: StepStatus;
    measurement?: AttestationMeasurement;
    tlsPublicKeyFingerprint?: string;
    hpkePublicKey?: string;
    error?: string;
  };
  verification: { status: StepStatus; securityVerified?: boolean; error?: string };
  releaseDigest: string;
};
```

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
//   configRepo: "tinfoilsh/confidential-inference-proxy",
//   serverURL: "https://inference.tinfoil.sh",
//   releaseDigest: "<specific-release-sha256>",
// });

unsubscribe();
```

## Verification Center (React UI)

The Verification Center is a drop‑in React component that visualizes the full verification process with status, steps, and an optional flow diagram. It runs the same local, WASM‑based attestation as the helpers above and can also display a precomputed `VerificationDocument`.

Note: Browser‑only (React + DOM). Rendering this component outside a real browser (e.g., Node/SSR server) throws a clear error. For Node usage, use the headless verification helpers instead.

### Install UI Peer Deps

The UI lives under the `tinfoil/verification-center` export and relies on a few peer dependencies. Install them if you don’t already use them:

```bash
npm install react react-dom @xyflow/react framer-motion @heroicons/react react-icons
```

Notes:
- CSS for `@xyflow/react` and the internal flow diagram is imported by the component. The package marks CSS as side effects, so bundlers keep it. Ensure your bundler allows CSS imports from `node_modules`.


### Import

```tsx
// Named or default import
import { VerificationCenter } from 'tinfoil/verification-center'
// or
import VerificationCenter from 'tinfoil/verification-center'
```

### Props

```ts
import type { VerificationDocument } from 'tinfoil'

type VerificationCenterProps = {
  isDarkMode?: boolean // Default: true
  flowDiagramExpanded?: boolean // Control expanded/collapsed state
  onFlowDiagramToggle?: () => void // Called when the header is toggled
  showVerificationFlow?: boolean // Show the flow diagram (default: true)
  verificationDocument?: VerificationDocument // Use precomputed data instead of running
}
```

Behavior:
- If `verificationDocument` is provided, the UI renders that state immediately and does not start a run.
- Without it, the UI calls the verifier and streams live progress; the “Verify Again” button forces a fresh run (cache is cleared).


### Use a Precomputed VerificationDocument

If you already verified using the SDK, you can pass the `VerificationDocument` to avoid re‑running.

Using the TinfoilAI client:

```tsx
import { useEffect, useState } from 'react'
import { TinfoilAI } from 'tinfoil'
import { VerificationCenter } from 'tinfoil/verification-center'
import type { VerificationDocument } from 'tinfoil'

export function VerifiedModal() {
  const [doc, setDoc] = useState<VerificationDocument | null>(null)

  useEffect(() => {
    const run = async () => {
      const client = new TinfoilAI({ apiKey: process.env.NEXT_PUBLIC_TINFOIL_API_KEY })
      await client.ready()
      setDoc(await client.getVerificationDocument())
    }
    void run()
  }, [])

  return (
    <div style={{ height: 520 }}>
      <VerificationCenter isDarkMode verificationDocument={doc ?? undefined} />
    </div>
  )
}
```

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
# TINFOIL_ENABLE_WASM_LOGS=true
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
