# Tinfoil Examples

## Examples

1. **chat** - Basic chat completion example using the TinfoilAI client
2. **secure_client** - Direct usage of the SecureClient for custom HTTP requests
3. **ehbp_chat** - TinfoilAI client with EHBP configuration
4. **ehbp_secure_client** - SecureClient with EHBP configuration
5. **ehbp_unverified_client** - UnverifiedClient with EHBP configuration
6. **advanced_chat** - Advanced example with streaming chat and simple attestation UI

## Installation

Before running any examples, install the dependencies from the root directory and build the library:

```bash
npm install
npm run build
```

## Running Examples

Navigate to any example directory and run:

```bash
npx ts-node main.ts
```

Some examples may require environment variables like `TINFOIL_API_KEY` to be set.