# Tinfoil Chat Example

This example demonstrates how to use the Tinfoil client with a clear, small-module layout. It shows:

- Enclave/code verification with a simple progress UI
- A streaming chat completion

## Setup

1. Make sure you have Node.js installed and the Tinfoil repository cloned
2. Navigate to the example directory:
   ```bash
   cd examples/chat
   ```
3. Install the required dependencies (local dev helpers for the example only):
   ```bash
   npm install dotenv openai ts-node typescript
   ```
4. Set up your API key environment variable:
   ```bash
   export TINFOIL_API_KEY="<YOUR_API_KEY>"
   ```
   Or create a `.env` file with:
   ```bash
   TINFOIL_API_KEY="<YOUR_API_KEY>"
   ```

## Running the Example

Make sure you're in the examples/chat directory, then run:

```bash
npx ts-node main.ts
```

## What the Example Does

The example will:

1. Load environment variables quietly from `.env` (if present)
2. Suppress a noisy Node experimental warning by default
3. Run enclave/code verification with an inline progress block
4. Create a `TinfoilAI` client and run a streaming chat completion

The API key is loaded from `TINFOIL_API_KEY`. The client automatically handles enclave verification and secure communication.

## File Structure

- `main.ts`: Orchestrates the example. Loads env, installs warning filter, then runs verification and chat streaming.
- `env.ts`: Quiet `.env` loader.
- `warnings.ts`: Optional suppression of the X25519 experimental warning.
- `ansi.ts`: Tiny color helpers and small utilities used by the UI.
- `verification-ui.ts`: Minimal inline renderer for verification progress.
- `verification-flow.ts`: Wires the verifier to the inline UI and logs a summary.
- `chat-stream.ts`: Minimal streaming chat demo.

Each file includes comments focusing on its responsibility, so you can read them independently.
