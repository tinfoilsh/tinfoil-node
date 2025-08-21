import { fetch } from 'undici';
import {TextDecoder, TextEncoder} from 'util';
import { TINFOIL_CONFIG } from './config';

// Set up browser-like globals that the Go WASM runtime expects
const globalThis = global as any;

// Performance API
globalThis.performance = {
    now: () => Date.now(),
    markResourceTiming: () => {
    },
    mark: () => {
    },
    measure: () => {
    },
    clearMarks: () => {
    },
    clearMeasures: () => {
    },
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

// Modified secure-client.ts
if (typeof window === 'undefined') {
    // Node.js environment
    globalThis.window = globalThis as any;
    globalThis.document = {
        createElement: () => ({
            setAttribute: () => {
            }
        })
    };
}

// Force process to stay running (prevent Go from exiting Node process)
// This is a common issue with Go WASM in Node - it calls process.exit()
const originalExit = process.exit;
process.exit = ((code?: number) => {
    console.log(`Process exit called with code ${code} - ignoring to keep Node.js process alive`);
    return undefined as never;
}) as any;

// Load the Go runtime helper
require('./wasm-exec.js');

/**
 * Ground truth measurements from verification
 */
export interface GroundTruth {
    publicKeyFP: string;
    measurement: string;
}

/**
 * SecureClient handles verification of code and runtime measurements using WebAssembly
 */
export class SecureClient {
    private static goInstance: any = null;
    private static initializationPromise: Promise<void> | null = null;
    
    // Values for the Tinfoil inference proxy from config
    private readonly enclave = new URL(TINFOIL_CONFIG.INFERENCE_BASE_URL).hostname;
    private readonly repo = TINFOIL_CONFIG.INFERENCE_PROXY_REPO;

    constructor() {
    }

    /**
     * Static method to initialize WASM module
     * This starts automatically when the class is loaded
     */
    public static async initializeWasm(): Promise<void> {
        if (SecureClient.initializationPromise) {
            return SecureClient.initializationPromise;
        }

        SecureClient.initializationPromise = (async () => {
            try {
                SecureClient.goInstance = new globalThis.Go();

                const wasmResponse = await fetch('https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm');
                const wasmBuffer = await wasmResponse.arrayBuffer();

                const result = await WebAssembly.instantiate(wasmBuffer, SecureClient.goInstance.importObject);
                const runPromise = SecureClient.goInstance.run(result.instance);

                let attempts = 0;
                const maxAttempts = 10;

                while (attempts < maxAttempts) {
                    attempts++;
                    await new Promise(resolve => setTimeout(resolve, 100));

                    const hasVerifyCode = typeof globalThis.verifyCode === 'function';
                    const hasVerifyEnclave = typeof globalThis.verifyEnclave === 'function';

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
     * Initialize the WASM module
     * Now just waits for the static initialization to complete
     */
    public async initialize(): Promise<void> {
        await SecureClient.initializeWasm();
    }

    /**
     * Verifies the integrity of both the code and runtime environment
     */
    public async verify(): Promise<GroundTruth> {
        await this.initialize();

        try {
            if (typeof globalThis.verifyCode !== 'function' || typeof globalThis.verifyEnclave !== 'function') {
                throw new Error('WASM functions not available');
            }

            const releaseResponse = await fetch(`https://api-github-proxy.tinfoil.sh/repos/${this.repo}/releases/latest`, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'tinfoil-node-client'
                }
            });

            if (!releaseResponse.ok) {
                throw new Error(`GitHub API request failed: ${releaseResponse.status} ${releaseResponse.statusText}`);
            }

            const releaseData = await releaseResponse.json() as { body?: string };

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
                publicKeyFP: attestationResponse.certificate,
                measurement: attestationResponse.measurement,
            };
        } catch (error) {
            throw error;
        }
    }
}

// Start initialization as soon as the module loads
SecureClient.initializeWasm().catch(console.error);
