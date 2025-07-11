import { TinfoilAI } from '../../src';
import { config } from 'dotenv';

config();

async function runStreamingExample(client: TinfoilAI) {
  const messages = [
    { role: 'system' as const, content: 'You are a helpful assistant.' },
    { role: 'user' as const, content: 'Tell me a short story about aluminum foil.' },
  ];

  console.log('\nPrompts:');
  messages.forEach(msg => {
    console.log(`${msg.role.toUpperCase()}: ${msg.content}`);
  });

  try {
    console.log('Creating chat completion stream...');
    const stream = await client.chat.completions.create({
      model: 'llama3-3-70b',
      messages: messages,
      stream: true,
    });

    console.log('\nStreaming response:');
    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      fullResponse += content;
      process.stdout.write(content);
    }

    console.log('\n\nFull accumulated response:');
    console.log(fullResponse);
  } catch (error) {
    console.error('Stream error:', error);
    if (error instanceof Error) {
      console.error('Full error stack:', error.stack);
    }
    // Log any additional error properties
    console.error('Error details:', JSON.stringify(error, null, 2));
  }
}

async function main() {
  try {
    console.log('Configuration:');
    console.log('API Key:', process.env.TINFOIL_API_KEY ? 'Set' : 'Not set');

    // Create a new TinfoilAI instance
    const client = new TinfoilAI({
      // apiKey will be taken from TINFOIL_API_KEY environment variable
    });

    // Run streaming example
    await runStreamingExample(client);
  } catch (error) {
    console.error('Main error:', error);
    if (error instanceof Error) {
      console.error('Main error stack:', error.stack);
    }
    throw error;
  }
}

// Run the example
main().catch(error => {
  console.error('Top level error:', error);
  process.exit(1);
});
