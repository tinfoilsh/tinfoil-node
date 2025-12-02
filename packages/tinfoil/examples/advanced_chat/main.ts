import { TinfoilAI } from "../../src";
import { fmt } from "./ansi";
import { loadEnvQuietly } from "./env";
import { installX25519WarningFilter } from "./warnings";
import { runStreamingExample } from "./chat-stream";
import { displayVerificationSteps } from "./verification-ui";

// 1) Load env early (quietly) so API keys are available to the rest of the app
loadEnvQuietly();

// 2) Hide the noisy experimental X25519 warning unless explicitly enabled
installX25519WarningFilter();

async function main() {
  try {
    // 3) Show config surface so users know whether their API key is picked up
    console.log(fmt.bold("Configuration"));
    console.log("API Key:", process.env.TINFOIL_API_KEY ? fmt.green("Set") : fmt.red("Not set"));

    // 4) Create a client and run the streaming chat example
    const client = new TinfoilAI();

    await client.ready();
    const doc = await client.getVerificationDocument();

    if (doc) {
      displayVerificationSteps(doc);
    }

    await runStreamingExample(client);
  } catch (error) {
    console.error("Main error:", error);
    if (error instanceof Error) {
      console.error("Main error stack:", error.stack);
    }
    throw error;
  }
}

// Run the example
main().catch((error) => {
  console.error("Top level error:", error);
  process.exit(1);
});