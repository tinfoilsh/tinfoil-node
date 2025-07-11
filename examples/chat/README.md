# Tinfoil Chat Example

This example demonstrates how to use the Tinfoil client to interact with OpenAI's chat completion API in both streaming and non-streaming modes.

## Setup

1. Make sure you have Node.js installed and the Tinfoil repository cloned
2. Navigate to the example directory:
   ```bash
   cd examples/chat
   ```
3. Install the required dependencies:
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

1. Create a TinfoilAI client with default parameters

2. Demonstrate a streaming chat completion with real-time output

The code shows both the basic usage pattern and error handling. The API key is loaded from the `TINFOIL_API_KEY` environment variable, and the client automatically handles enclave verification and secure communication.
