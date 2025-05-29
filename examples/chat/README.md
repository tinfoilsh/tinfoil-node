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
4. Set up your environment variables by copying the example file:
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` with your configuration:
   ```bash
   TINFOIL_ENCLAVE="llama3-3-70b.model.tinfoil.sh"
   TINFOIL_REPO="tinfoilsh/confidential-llama3-3-70b"
   TINFOIL_API_KEY="your_api_key_here"
   ```
   Note: The example will use default values if environment variables are not set.

## Running the Example

Make sure you're in the examples/chat directory, then run:
```bash
npx ts-node main.ts
```

## What the Example Does

The example will:

1. Create an OpenAI client configured with Tinfoil settings

2. Demonstrate a streaming chat completion with real-time output

The code shows both the basic usage pattern and error handling for each approach. 