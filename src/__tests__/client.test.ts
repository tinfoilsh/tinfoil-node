import { streamText } from 'ai';
import { TinfoilAI } from '../client';
import { createTinfoilAI } from '../ai-sdk-provider';
import '@jest/globals';

// Test configuration
interface TestConfig {
  apiKey: string;
}

const testConfig: TestConfig = {
  apiKey: 'tinfoil'
};

describe('TinfoilAI', () => {
  it('should create a client with direct parameters', async () => {
    const client = new TinfoilAI({
      apiKey: testConfig.apiKey
    });
    await client.ready();
    expect(client).toBeDefined();
  }, 60000);

  it('should create a client with environment variables fallback', async () => {
    // Set environment variables
    process.env.TINFOIL_API_KEY = testConfig.apiKey;

    try {
      const client = new TinfoilAI();
      await client.ready();
      expect(client).toBeDefined();
    } finally {
      // Clean up
      delete process.env.TINFOIL_API_KEY;
    }
  }, 60000);

  it('should perform non-streaming chat completion', async () => {
    const client = new TinfoilAI({
      apiKey: testConfig.apiKey
    });

    await client.ready();

    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: 'No matter what the user says, only respond with: Done.' },
        { role: 'user', content: 'Is this a test?' }
      ],
      model: 'llama-free'
    });

    console.log('Response received:', response.choices[0].message.content);
    expect(response.choices[0].message.content).toBeDefined();
  }, 60000);

  it('should handle streaming chat completion', async () => {
    const client = new TinfoilAI({
      apiKey: testConfig.apiKey
    });

    await client.ready();

    const stream = await client.chat.completions.create({
      messages: [
        { role: 'system', content: 'No matter what the user says, only respond with: Done.' },
        { role: 'user', content: 'Is this a test?' }
      ],
      model: 'llama-free',
      stream: true
    });

    let accumulatedContent = '';
    console.log('Chat completion streaming response:');
    
    for await (const chunk of stream) {
      if (chunk.choices[0]?.delta?.content) {
        const content = chunk.choices[0].delta.content;
        accumulatedContent += content;
        console.log('Received:', content);
      }
    }

    console.log('Complete response:', accumulatedContent);
    expect(accumulatedContent.length).toBeGreaterThan(0);
  }, 60000);

  it('should pass client verification with the AI SDK provider', async () => {
    const tinfoilai = await createTinfoilAI(testConfig.apiKey);

    const { textStream } = streamText({
        model: tinfoilai("llama-free"),
        prompt: "say hi to me"
    });
    
    for await (const textPart of textStream) {
        process.stdout.write(textPart);
    }
    console.log();
  });  
});
