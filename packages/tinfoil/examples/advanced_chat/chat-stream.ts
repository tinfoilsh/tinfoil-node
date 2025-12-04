import { TinfoilAI } from "../../src";
import { fmt } from "./ansi";

/**
 * Demonstrates how to stream chat completions and print partial output as it arrives.
 */
export async function runStreamingExample(client: TinfoilAI): Promise<void> {
  const messages = [
    { role: "system" as const, content: "You are a helpful assistant." },
    { role: "user" as const, content: "Tell me a short story about aluminum foil." },
  ];

  console.log("\n" + fmt.bold("Prompts"));
  messages.forEach((msg) => {
    const label = msg.role.toUpperCase();
    const colored = msg.role === "system" ? fmt.gray(label) : fmt.cyan(label);
    console.log(`${colored}: ${msg.content}`);
  });

  try {
    console.log("\n" + fmt.bold("Creating chat completion stream…"));
    const stream = await client.chat.completions.create({
      model: "gpt-oss-120b-free",
      messages,
      stream: true,
    });

    console.log("\n" + fmt.bold("Streaming response"));
    let fullResponse = "";

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || "";
      fullResponse += content;
      process.stdout.write(content);
    }

    console.log("\n\n" + fmt.bold("Full accumulated response"));
    console.log(fullResponse);
  } catch (error) {
    console.error(fmt.red("Stream error:"), error);
    if (error instanceof Error) {
      console.error("Full error stack:", error.stack);
    }
    console.error("Error details:", JSON.stringify(error, null, 2));
  }
}


