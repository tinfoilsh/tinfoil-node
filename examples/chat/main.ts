import { TinfoilAI } from "tinfoil";

async function main() {
  try {
    const client = new TinfoilAI();

    const completion = await client.chat.completions.create({
      messages: [{ role: "user", content: "Hello!" }],
      model: "gpt-oss-120b-free",
    });

    console.log(completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();