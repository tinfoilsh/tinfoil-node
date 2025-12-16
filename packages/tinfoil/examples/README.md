# Tinfoil Examples

## Examples

1. **chat** - Basic chat completion using the TinfoilAI client
2. **secure_client** - Direct usage of SecureClient for custom HTTP requests
3. **unverified_client** - UnverifiedClient for development/testing without attestation

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