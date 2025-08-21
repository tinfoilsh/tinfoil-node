import OpenAI from 'openai';
import type { 
  Chat,
  Files,
  FineTuning,
  Images,
  Audio,
  Embeddings,
  Models,
  Moderations,
  Beta
} from 'openai/resources';
import { createHash, X509Certificate } from 'crypto';
import { SecureClient, GroundTruth } from './secure-client';
import https from 'https';
import { PeerCertificate } from 'tls';
import { TINFOIL_CONFIG } from './config';

/**
 * Detects if the code is running in a real browser environment.
 * Returns false for Node.js environments, even with WASM loaded.
 */
function isRealBrowser(): boolean {
  // Check for Node.js-specific globals that wouldn't exist in a real browser
  if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    return false; // Definitely Node.js
  }
  
  // Check for browser-specific window object AND ensure it's not a Node.js global mock
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    // Additional check: real browsers have navigator.userAgent
    if (typeof navigator !== 'undefined' && navigator.userAgent) {
      return true; // Likely a real browser
    }
  }
  
  // Default to safe: assume it's not a browser (Node.js with WASM)
  return false;
}

/**
 * Creates a proxy that allows property access and method calls on a Promise before it resolves.
 * This enables a more ergonomic API where you can chain properties and methods without explicitly
 * awaiting the promise first.
 * 
 * @param promise - A Promise that will resolve to an object
 * @returns A proxied version of the promised object that allows immediate property/method access
 * 
 * @example
 * // Instead of:
 * const client = await getClient();
 * const result = await client.someProperty.someMethod();
 * 
 * // You can write:
 * const client = createAsyncProxy(getClient());
 * const result = await client.someProperty.someMethod();
 * 
 * @template T - The type of object that the promise resolves to
 */
function createAsyncProxy<T extends object>(promise: Promise<T>): T {
  return new Proxy({} as T, {
    get(target, prop) {
      return new Proxy(() => {}, {
        get(_, nestedProp) {
          return (...args: any[]) =>
            promise.then(obj => {
              const value = (obj as any)[prop][nestedProp];
              return typeof value === 'function' ? value.apply((obj as any)[prop], args) : value;
            });
        },
        apply(_, __, args) {
          return promise.then(obj => {
            const value = (obj as any)[prop];
            return typeof value === 'function' ? value.apply(obj, args) : value;
          });
        }
      });
    }
  });
}

/**
 * TinfoilAI is a wrapper around the OpenAI API client that adds additional
 * security measures through enclave verification and certificate fingerprint validation.
 * 
 * It provides:
 * - Automatic verification of Tinfoil secure enclaves
 * - Certificate fingerprint validation for each request
 * - Type-safe access to OpenAI's chat completion APIs
 */

interface TinfoilAIOptions {
  apiKey?: string;
  [key: string]: any; // Allow other OpenAI client options
}

export class TinfoilAI {
  private client?: OpenAI;
  private groundTruth?: GroundTruth;
  private clientPromise: Promise<OpenAI>;
  private readyPromise?: Promise<void>;
  
  // Expose properties for compatibility
  public apiKey?: string;
  public baseURL?: string;

  /**
   * Creates a new TinfoilAI instance.
   * @param options - Configuration options including apiKey and other OpenAI client options
   */
  constructor(options: TinfoilAIOptions = {}) {
    // Set apiKey from options or environment variable
    const openAIOptions = { ...options };
    if (options.apiKey || process.env.TINFOIL_API_KEY) {
      openAIOptions.apiKey = options.apiKey || process.env.TINFOIL_API_KEY;
    }
    
    // Store properties for compatibility
    this.apiKey = openAIOptions.apiKey;
    this.baseURL = TINFOIL_CONFIG.INFERENCE_BASE_URL;

    this.clientPromise = this.initClient(openAIOptions);
  }

  /**
   * Ensures the client is ready to use.
   * @returns Promise that resolves when the client is initialized
   */
  public async ready(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = (async () => {
        this.client = await this.clientPromise;
      })();
    }
    return this.readyPromise;
  }

  private async initClient(options?: Partial<Omit<ConstructorParameters<typeof OpenAI>[0], 'baseURL'>>): Promise<OpenAI> {
    return this.createOpenAIClient(options);
  }

  private async createOpenAIClient(options: Partial<Omit<ConstructorParameters<typeof OpenAI>[0], 'baseURL'>> = {}): Promise<OpenAI> {
    // Verify the enclave and get the certificate fingerprint
    const secureClient = new SecureClient();
    
    try {
      this.groundTruth = await secureClient.verify();
    } catch (error) {
      throw new Error(`Failed to verify enclave: ${error}`);
    }

    const expectedFingerprint = this.groundTruth.publicKeyFP;

    // Create a custom HTTPS agent that verifies certificate fingerprints
    const httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      checkServerIdentity: (host: string, cert: PeerCertificate) => {
        if (!cert || !cert.raw) {
          throw new Error('No certificate found');
        }
        if (!cert.pubkey) {
          throw new Error('No public key found');
        }

        const pemCert = `-----BEGIN CERTIFICATE-----\n${cert.raw.toString('base64')}\n-----END CERTIFICATE-----`;
        const x509Cert = new X509Certificate(pemCert);
        const publicKey = x509Cert.publicKey.export({ format: 'der', type: 'spki' });
        const publicKeyHash = createHash('sha256').update(publicKey).digest('hex');

        if (publicKeyHash !== expectedFingerprint) {
          throw new Error(`Certificate fingerprint mismatch. Got ${publicKeyHash}, expected ${expectedFingerprint}`);
        }

        return undefined; // Validation successful
      }
    });

    // Create the OpenAI client with our custom configuration
    // Note: baseURL will need to be determined by the verification process
    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
      ...options,
      baseURL: TINFOIL_CONFIG.INFERENCE_BASE_URL,
    };

    // Only enable dangerouslyAllowBrowser when we're NOT in a real browser
    // This prevents API key exposure if code is ever bundled for browser use
    if (!isRealBrowser()) {
      // We're in Node.js with WASM, which makes OpenAI SDK think we're in a browser
      clientOptions.dangerouslyAllowBrowser = true;
    }

    return new OpenAI(clientOptions);
  }

  /**
   * Helper method to ensure the OpenAI client is initialized before use.
   * Automatically calls ready() if needed.
   * @returns The initialized OpenAI client
   * @private
   */
  private async ensureReady(): Promise<OpenAI> {
    await this.ready();
    // We can safely assert this now because ready() must have completed
    return this.client!;
  }

  /**
   * Access to OpenAI's chat completions API for creating chat conversations.
   * Automatically initializes the client if needed.
   */
  get chat(): Chat {
    return createAsyncProxy(this.ensureReady().then(client => client.chat));
  }

  /**
   * Access to OpenAI's files API for managing files used with the API.
   * Automatically initializes the client if needed.
   */
  get files(): Files {
    return createAsyncProxy(this.ensureReady().then(client => client.files));
  }

  /**
   * Access to OpenAI's fine-tuning API for creating and managing fine-tuned models.
   * Automatically initializes the client if needed.
   */
  get fineTuning(): FineTuning {
    return createAsyncProxy(this.ensureReady().then(client => client.fineTuning));
  }

  /**
   * Access to OpenAI's image generation and editing API.
   * Automatically initializes the client if needed.
   */
  get images(): Images {
    return createAsyncProxy(this.ensureReady().then(client => client.images));
  }

  /**
   * Access to OpenAI's audio API for speech-to-text and text-to-speech.
   * Automatically initializes the client if needed.
   */
  get audio(): Audio {
    return createAsyncProxy(this.ensureReady().then(client => client.audio));
  }

  /**
   * Access to OpenAI's embeddings API for creating vector embeddings of text.
   * Automatically initializes the client if needed.
   */
  get embeddings(): Embeddings {
    return createAsyncProxy(this.ensureReady().then(client => client.embeddings));
  }

  /**
   * Access to OpenAI's models API for listing and managing available models.
   * Automatically initializes the client if needed.
   */
  get models(): Models {
    return createAsyncProxy(this.ensureReady().then(client => client.models));
  }

  /**
   * Access to OpenAI's content moderation API.
   * Automatically initializes the client if needed.
   */
  get moderations(): Moderations {
    return createAsyncProxy(this.ensureReady().then(client => client.moderations));
  }

  /**
   * Access to OpenAI's beta features.
   * Automatically initializes the client if needed.
   */
  get beta(): Beta {
    return createAsyncProxy(this.ensureReady().then(client => client.beta));
  }
}

// Namespace declaration merge to add OpenAI types to TinfoilAI
export namespace TinfoilAI {
  // Re-export all OpenAI namespace types
  export import Chat = OpenAI.Chat;
  export import Audio = OpenAI.Audio;
  export import Beta = OpenAI.Beta;
  export import Batches = OpenAI.Batches;
  export import Completions = OpenAI.Completions;
  export import Embeddings = OpenAI.Embeddings;
  export import Files = OpenAI.Files;
  export import FineTuning = OpenAI.FineTuning;
  export import Images = OpenAI.Images;
  export import Models = OpenAI.Models;
  export import Moderations = OpenAI.Moderations;
  export import Uploads = OpenAI.Uploads;
  export import VectorStores = OpenAI.VectorStores;
}