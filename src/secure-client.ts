import { TextDecoder, TextEncoder } from 'util';
import fetch from 'node-fetch';
import { TINFOIL_CONFIG } from './config';

// Set up browser-like globals that the Go WASM runtime expects
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */
const globalThis = global as any;

// Performance API
globalThis.performance = {
  now: () => Date.now(),
  markResourceTiming: () => {},
  mark: () => {},
  measure: () => {},
  clearMarks: () => {},
  clearMeasures: () => {},
  getEntriesByName: () => [],
  getEntriesByType: () => [],
  getEntries: () => [],
};

// Text encoding
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// Crypto API (needed by Go WASM)
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: (buffer: Uint8Array) => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-require-imports
      const randomBytes = require('crypto').randomBytes(buffer.length) as Buffer;
      buffer.set(new Uint8Array(randomBytes));
      return buffer;
    },
  };
}

// Modified secure-client.ts
if (typeof window === 'undefined') {
  // Node.js environment
  globalThis.window = globalThis;
  globalThis.document = {
    createElement: () => ({
      setAttribute: () => {},
    }),
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment */

// Force process to stay running (prevent Go from exiting Node process)
// This is a common issue with Go WASM in Node - it calls process.exit()
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _originalExit = process.exit.bind(process);
process.exit = ((code?: number) => {
  // eslint-disable-next-line no-console
  console.log(`Process exit called with code ${code} - ignoring to keep Node.js process alive`);
  return undefined as never;
}) as typeof process.exit;

// Load the Go runtime helper
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
require('./wasm-exec.js');

/**
 * Ground truth measurements from enclave verification.
 * Contains cryptographic measurements to ensure secure execution environment.
 */
export interface GroundTruth {
  /**
   * SHA-256 fingerprint of the enclave's public key
   */
  publicKeyFP: string;
  /**
   * Cryptographic measurement of the enclave's code and configuration
   */
  measurement: string;
}

/**
 * SecureClient handles verification of code and runtime measurements using WebAssembly.
 * Ensures that the inference proxy is running in a verified secure enclave.
 *
 * @example
 * ```typescript
 * const secureClient = new SecureClient();
 * const groundTruth = await secureClient.verify();
 * console.log('Public key fingerprint:', groundTruth.publicKeyFP);
 * console.log('Measurement:', groundTruth.measurement);
 * ```
 */
export class SecureClient {
  private static goInstance: Go | null = null;
  private static initializationPromise: Promise<void> | null = null;

  // Values for the Tinfoil inference proxy from config
  private readonly enclave = new URL(TINFOIL_CONFIG.INFERENCE_BASE_URL).hostname;
  private readonly repo = TINFOIL_CONFIG.INFERENCE_PROXY_REPO;

  constructor() {}

  /**
   * Static method to initialize WASM module.
   * This starts automatically when the class is loaded.
   *
   * @returns Promise that resolves when WASM module is loaded and ready
   * @throws {Error} If WASM initialization fails or functions are not exposed
   */
  public static async initializeWasm(): Promise<void> {
    if (SecureClient.initializationPromise) {
      return SecureClient.initializationPromise;
    }

    SecureClient.initializationPromise = (async () => {
      try {
        SecureClient.goInstance = new Go();

        const wasmResponse = await fetch(
          'https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm'
        );
        const wasmBuffer = await wasmResponse.arrayBuffer();

        const result = await WebAssembly.instantiate(
          wasmBuffer,
          SecureClient.goInstance.importObject
        );
        void SecureClient.goInstance.run(result.instance);

        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 100));

          const hasVerifyCode = typeof verifyCode === 'function';
          const hasVerifyEnclave = typeof verifyEnclave === 'function';

          if (hasVerifyCode && hasVerifyEnclave) {
            return;
          }
        }

        throw new Error('WASM functions not exposed after multiple attempts');
      } catch (error) {
        console.error('WASM initialization error:', error);
        throw error;
      }
    })();

    return SecureClient.initializationPromise;
  }

  /**
   * Initialize the WASM module.
   * Waits for the static initialization to complete.
   *
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(): Promise<void> {
    await SecureClient.initializeWasm();
  }

  /**
   * Verifies the integrity of both the code and runtime environment.
   * Fetches the latest release information and verifies it matches the running enclave.
   *
   * @returns Ground truth measurements including public key fingerprint and measurement
   * @throws {Error} If verification fails, GitHub API is unavailable, or measurements don't match
   */
  public async verify(): Promise<GroundTruth> {
    await this.initialize();

    try {
      if (typeof verifyCode !== 'function' || typeof verifyEnclave !== 'function') {
        throw new Error('WASM functions not available');
      }

      const releaseResponse = await fetch(
        `https://api.github.com/repos/${this.repo}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'tinfoil-node-client',
          },
        }
      );

      if (!releaseResponse.ok) {
        throw new Error(
          `GitHub API request failed: ${releaseResponse.status} ${releaseResponse.statusText}`
        );
      }

      const releaseData = (await releaseResponse.json()) as { body?: string };

      const eifRegex = /EIF hash: ([a-f0-9]{64})/i;
      const digestRegex = /Digest: `([a-f0-9]{64})`/;

      let digest;
      const eifMatch = releaseData.body?.match(eifRegex);
      const digestMatch = releaseData.body?.match(digestRegex);

      if (eifMatch) {
        digest = eifMatch[1];
      } else if (digestMatch) {
        digest = digestMatch[1];
      } else {
        throw new Error('Could not find digest in release notes');
      }

      const [measurement, attestationResponse] = await Promise.all([
        verifyCode(this.repo, digest),
        verifyEnclave(this.enclave),
      ]);

      if (measurement !== attestationResponse.measurement) {
        throw new Error('Measurements do not match');
      }

      return {
        publicKeyFP: attestationResponse.certificate,
        measurement,
      };
    } catch (error) {
      throw new Error(
        `Verification failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

// Start initialization as soon as the module loads
SecureClient.initializeWasm().catch(console.error);
