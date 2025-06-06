import { streamText } from 'ai';
import { TinfoilAI } from '../client';
import { createTinfoilAI } from '../ai-sdk-provider';
import '@jest/globals';

// Test configuration
interface TestConfig {
  enclave: string;
  repo: string;
  apiKey: string;
}

const getEnvOrDefault = (key: string, defaultValue: string): string => {
  return process.env[key] || defaultValue;
};

const testConfig: TestConfig = {
  enclave: getEnvOrDefault('TINFOIL_TEST_ENCLAVE', 'llama3-3-70b.model.tinfoil.sh'),
  repo: getEnvOrDefault('TINFOIL_TEST_REPO', 'tinfoilsh/confidential-llama3-3-70b'),
  apiKey: 'tinfoil'
};

describe('TinfoilAI', () => {
  it('should create a client with direct parameters', async () => {
    const client = new TinfoilAI({
      enclave: testConfig.enclave,
      repo: testConfig.repo,
      apiKey: testConfig.apiKey
    });
    await client.ready();
    expect(client).toBeDefined();
  }, 60000);

  it('should create a client with environment variables fallback', async () => {
    // Set environment variables
    process.env.TINFOIL_ENCLAVE = testConfig.enclave;
    process.env.TINFOIL_REPO = testConfig.repo;
    process.env.OPENAI_API_KEY = testConfig.apiKey;

    try {
      const client = new TinfoilAI();
      await client.ready();
      expect(client).toBeDefined();
    } finally {
      // Clean up
      delete process.env.TINFOIL_ENCLAVE;
      delete process.env.TINFOIL_REPO;
      delete process.env.OPENAI_API_KEY;
    }
  }, 60000);

  it('should throw error when required parameters are missing', () => {
    // Ensure no environment variables are set
    delete process.env.TINFOIL_ENCLAVE;
    delete process.env.TINFOIL_REPO;
    delete process.env.OPENAI_API_KEY;
    
    expect(() => new TinfoilAI({
      apiKey: testConfig.apiKey
      // Missing enclave and repo
    })).toThrow('tinfoil: enclave and repo must be specified either in options or via TINFOIL_ENCLAVE and TINFOIL_REPO environment variables');
  });

  it('should perform non-streaming chat completion', async () => {
    const client = new TinfoilAI({
      enclave: testConfig.enclave,
      repo: testConfig.repo,
      apiKey: testConfig.apiKey
    });

    await client.ready();

    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: 'No matter what the user says, only respond with: Done.' },
        { role: 'user', content: 'Is this a test?' }
      ],
      model: 'llama3-3-70b'
    });

    console.log('Response received:', response.choices[0].message.content);
    expect(response.choices[0].message.content).toBeDefined();
  }, 60000);

  it('should handle streaming chat completion', async () => {
    const client = new TinfoilAI({
      enclave: testConfig.enclave,
      repo: testConfig.repo,
      apiKey: testConfig.apiKey
    });

    await client.ready();

    const stream = await client.chat.completions.create({
      messages: [
        { role: 'system', content: 'No matter what the user says, only respond with: Done.' },
        { role: 'user', content: 'Is this a test?' }
      ],
      model: 'llama3-3-70b',
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
    const tinfoilai = await createTinfoilAI(
      testConfig.repo,
      testConfig.enclave,
      testConfig.apiKey
    );

    const { textStream } = streamText({
        model: tinfoilai("llama3-3-70b"),
        prompt: "say hi to me"
    });
    
    for await (const textPart of textStream) {
        process.stdout.write(textPart);
    }
    console.log();
  });  
});
