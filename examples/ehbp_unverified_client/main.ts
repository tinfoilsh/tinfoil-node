import { UnverifiedClient } from "tinfoil";

async function main() {
  try {
    const client = new UnverifiedClient();

    const response = await client.fetch("/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-oss-120b-free",
        messages: [{ role: "user", content: "Hello!" }],
      }),
    });

    console.log(response);

    const responseBody = await response.text();
    console.log("Response Body:", responseBody);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();