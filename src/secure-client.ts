import fetch from 'node-fetch';
import { TextEncoder, TextDecoder } from 'util';
import * as fs from 'fs';
import * as path from 'path';

// Set up browser-like globals that the Go WASM runtime expects
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
  getEntries: () => []
};

// Text encoding
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

// Crypto API (needed by Go WASM)
if (!globalThis.crypto) {
  globalThis.crypto = {
    getRandomValues: (buffer: Uint8Array) => {
      const randomBytes = require('crypto').randomBytes(buffer.length);
      buffer.set(new Uint8Array(randomBytes));
      return buffer;
    }
  };
}

// Additional browser polyfills that might be needed
globalThis.window = globalThis;
globalThis.document = { 
  createElement: () => ({ 
    setAttribute: () => {} 
  }) 
};

// Force process to stay running (prevent Go from exiting Node process)
// This is a common issue with Go WASM in Node - it calls process.exit()
const originalExit = process.exit;
process.exit = ((code?: number) => {
  console.log(`Process exit called with code ${code} - ignoring to keep Node.js process alive`);
  return undefined as never;
}) as any;

// Type declarations for the functions exported by the Go WASM module
declare global {
  var Go: any;
  var verifyEnclave: (enclaveHostname: string) => Promise<{
    certificate: string;
    measurement: string;
    certFingerprint: string;
  }>;
  var verifyCode: (repo: string, digest: string) => Promise<string>;
}

// Load the Go runtime helper
require('./wasm-exec.js');

/**
 * Ground truth measurements from verification
 */
export interface GroundTruth {
  certFingerprint: Uint8Array;
  measurement: string;
}

/**
 * SecureClient handles verification of code and runtime measurements using WebAssembly
 */
export class SecureClient {
  private enclave: string;
  private repo: string;
  private goInstance: any = null;
  private isInitialized: boolean = false;

  constructor(enclave: string, repo: string) {
    this.enclave = enclave;
    this.repo = repo;
  }

  /**
   * Initialize the WASM module
   * This must be called before verify() to load the WASM module
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.goInstance = new globalThis.Go();
      
      const wasmResponse = await fetch('https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm');
      const wasmBuffer = await wasmResponse.arrayBuffer();
      
      const result = await WebAssembly.instantiate(wasmBuffer, this.goInstance.importObject);
      const runPromise = this.goInstance.run(result.instance);
      
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const hasVerifyCode = typeof globalThis.verifyCode === 'function';
        const hasVerifyEnclave = typeof globalThis.verifyEnclave === 'function';
        
        if (hasVerifyCode && hasVerifyEnclave) {
          this.isInitialized = true;
          return;
        }
      }
      
      throw new Error('WASM functions not exposed after multiple attempts');
    } catch (error) {
      console.error('WASM initialization error:', error);
      throw error;
    }
  }

  /**
   * Verifies the integrity of both the code and runtime environment
   */
  public async verify(): Promise<GroundTruth> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      if (typeof globalThis.verifyCode !== 'function' || typeof globalThis.verifyEnclave !== 'function') {
        throw new Error('WASM functions not available');
      }

      const releaseResponse = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'tinfoil-node-client'
        }
      });
      
      if (!releaseResponse.ok) {
        throw new Error(`GitHub API request failed: ${releaseResponse.status} ${releaseResponse.statusText}`);
      }
      
      const releaseData = await releaseResponse.json();
      
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
        globalThis.verifyCode(this.repo, digest),
        globalThis.verifyEnclave(this.enclave)
      ]);
      
      if (measurement !== attestationResponse.measurement) {
        throw new Error('Measurements do not match');
      }
      
      return {
        certFingerprint: new Uint8Array(Buffer.from(attestationResponse.certificate, 'hex')),
        measurement: attestationResponse.measurement,
      };
    } catch (error) {
      throw error;
    }
  }
} 