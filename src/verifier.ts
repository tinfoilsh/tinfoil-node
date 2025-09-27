import { TINFOIL_CONFIG } from "./config";

// Use native fetch and TextEncoder/TextDecoder
// In Node.js, these are available globally since v18
// In browsers, they're also available globally
let cachedFetch: typeof fetch | null = null;
function getFetch(): typeof fetch {
  if (!cachedFetch) {
    if (typeof globalThis.fetch !== "function") {
      throw new Error("fetch is not available in this environment");
    }
    cachedFetch = globalThis.fetch.bind(globalThis);
  }
  return cachedFetch;
}

let cachedTextEncoder: typeof TextEncoder | null = null;
function getTextEncoder(): typeof TextEncoder {
  if (!cachedTextEncoder) {
    if (typeof globalThis.TextEncoder !== "function") {
      throw new Error("TextEncoder is not available in this environment");
    }
    cachedTextEncoder = globalThis.TextEncoder;
  }
  return cachedTextEncoder;
}

let cachedTextDecoder: typeof TextDecoder | null = null;
function getTextDecoder(): typeof TextDecoder {
  if (!cachedTextDecoder) {
    if (typeof globalThis.TextDecoder !== "function") {
      throw new Error("TextDecoder is not available in this environment");
    }
    cachedTextDecoder = globalThis.TextDecoder;
  }
  return cachedTextDecoder;
}

const nodeRequire = createNodeRequire();
let wasmExecLoader: Promise<void> | null = null;

// Extend globalThis for Go WASM types
declare const globalThis: {
  Go: any;
  verifyCode: (repo: string, digest: string) => Promise<any>;
  verifyEnclave: (host: string) => Promise<any>;
} & typeof global;

/**
 * Attestation measurement containing platform type and register values
 */
export interface AttestationMeasurement {
  type: string;
  registers: string[];
}

// Platform type constants
const PLATFORM_TYPES = {
  SNP_TDX_MULTI_PLATFORM_V1: 'https://tinfoil.sh/predicate/snp-tdx-multiplatform/v1',
  TDX_GUEST_V1: 'https://tinfoil.sh/predicate/tdx-guest/v1',
  SEV_GUEST_V1: 'https://tinfoil.sh/predicate/sev-snp-guest/v2'
} as const;

/**
 * Attestation response containing cryptographic keys and measurements
 */
export interface AttestationResponse {
  tlsPublicKeyFingerprint: string;
  hpkePublicKey: string;
  measurement: AttestationMeasurement;
}

/**
 * Compare two measurements according to platform-specific rules
 * This is predicate function for comparing attestation measurements
 * taken from https://github.com/tinfoilsh/verifier/blob/main/attestation/attestation.go
 * 
 * @param codeMeasurement - Expected measurement from code attestation
 * @param runtimeMeasurement - Actual measurement from runtime attestation
 * @returns true if measurements match according to platform rules
 */
export function compareMeasurements(codeMeasurement: AttestationMeasurement, runtimeMeasurement: AttestationMeasurement): boolean {
  // Both are multi-platform: compare all registers directly
  if (codeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1 && 
      runtimeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1) {
    return JSON.stringify(codeMeasurement.registers) === JSON.stringify(runtimeMeasurement.registers);
  }

  // If runtime is multi-platform, flip the comparison
  if (runtimeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1) {
    return compareMeasurements(runtimeMeasurement, codeMeasurement);
  }

  // Code is multi-platform, runtime is specific platform
  if (codeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1) {
    switch (runtimeMeasurement.type) {
      case PLATFORM_TYPES.TDX_GUEST_V1: {
        // For TDX: compare RTMR1 and RTMR2
        // Multi-platform format: [SNP_MEASUREMENT, RTMR1, RTMR2]
        // TDX format: [MRTD, RTMR0, RTMR1, RTMR2]
        if (codeMeasurement.registers.length < 3 || runtimeMeasurement.registers.length < 4) {
          return false;
        }
        const expectedRtmr1 = codeMeasurement.registers[1]; // Position 1 in multi-platform
        const expectedRtmr2 = codeMeasurement.registers[2]; // Position 2 in multi-platform
        const actualRtmr1 = runtimeMeasurement.registers[2]; // Position 2 in TDX (0=MRTD, 1=RTMR0)
        const actualRtmr2 = runtimeMeasurement.registers[3]; // Position 3 in TDX
        
        return expectedRtmr1 === actualRtmr1 && expectedRtmr2 === actualRtmr2;
      }
        
      case PLATFORM_TYPES.SEV_GUEST_V1: {
        // For SEV: compare only the first register (SEV SNP measurement)
        if (codeMeasurement.registers.length < 1 || runtimeMeasurement.registers.length < 1) {
          return false;
        }
        
        return codeMeasurement.registers[0] === runtimeMeasurement.registers[0];
      }
        
      default:
        throw new Error(`Unsupported platform type for comparison: ${runtimeMeasurement.type}`);
    }
  }

  // Neither is multi-platform: types must match and all registers must match
  if (codeMeasurement.type !== runtimeMeasurement.type) {
    return false;
  }

  return JSON.stringify(codeMeasurement.registers) === JSON.stringify(runtimeMeasurement.registers);
}

/**
 * Verifier performs attestation verification for Tinfoil enclaves
 * 
 * The verifier loads a WebAssembly module that:
 * 1. Fetches the latest code release digest from GitHub
 * 2. Performs runtime attestation against the enclave
 * 3. Performs code attestation using the digest
 * 4. Compares measurements using platform-specific logic
 */
export class Verifier {
  private static goInstance: any = null;
  private static initializationPromise: Promise<void> | null = null;
  private static verificationCache = new Map<string, Promise<AttestationResponse>>();
  private static readonly defaultWasmUrl =
    "https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm";
  public static originalFsWriteSync: ((fd: number, buf: Uint8Array) => number) | null = null;
  public static wasmLogsSuppressed = true;
  public static globalsInitialized = false;

  public static clearVerificationCache(): void {
    Verifier.verificationCache.clear();
  }

  // Configuration for the target enclave and repository
  protected readonly enclave: string;
  protected readonly repo: string;

  constructor(options?: { baseURL?: string; repo?: string }) {
    const baseURL = options?.baseURL ?? TINFOIL_CONFIG.INFERENCE_BASE_URL;
    this.enclave = new URL(baseURL).hostname;
    this.repo = options?.repo ?? TINFOIL_CONFIG.INFERENCE_PROXY_REPO;
  }

  /**
   * Initialize the WebAssembly module
   * This loads the Go runtime and makes verification functions available
   */
  public static async initializeWasm(): Promise<void> {
    if (Verifier.initializationPromise) {
      return Verifier.initializationPromise;
    }

    Verifier.initializationPromise = (async () => {
      try {
        // Initialize globals if not already done
        await initializeWasmGlobals();
        
        Verifier.goInstance = new globalThis.Go();

        // Load WASM module
        const fetchFn = getFetch();
        const wasmResponse = await fetchFn(Verifier.defaultWasmUrl);
        if (!wasmResponse.ok) {
          throw new Error(`Failed to fetch WASM: ${wasmResponse.status} ${wasmResponse.statusText}`);
        }
        
        const wasmBuffer = await wasmResponse.arrayBuffer();
        const result = await WebAssembly.instantiate(
          wasmBuffer,
          Verifier.goInstance.importObject,
        );
        
        // Run the Go instance - this makes functions available on globalThis
        Verifier.goInstance.run(result.instance);
        
        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Ensure required functions are available
        if (typeof globalThis.verifyCode === "undefined" || typeof globalThis.verifyEnclave === "undefined") {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Apply log suppression if requested
        if (Verifier.wasmLogsSuppressed && (globalThis as any).fs?.writeSync) {
          const fsObj = (globalThis as any).fs as { writeSync: (fd: number, buf: Uint8Array) => number };
          if (!Verifier.originalFsWriteSync) {
            Verifier.originalFsWriteSync = fsObj.writeSync.bind(fsObj);
          }
          fsObj.writeSync = function (_fd: number, buf: Uint8Array) {
            return buf.length;
          };
        }
      } catch (error) {
        console.error("WASM initialization error:", error);
        throw error;
      }
    })();

    return Verifier.initializationPromise;
  }

  /**
   * Fetch the latest release digest from GitHub
   * @param repo - Repository name (e.g., "tinfoilsh/confidential-inference-proxy-hpke")
   * @returns The digest hash
   */
  public async fetchLatestDigest(repo?: string): Promise<string> {
    const targetRepo = repo || this.repo;
    
    const fetchFn = getFetch();
    const releaseResponse = await fetchFn(
      `https://api-github-proxy.tinfoil.sh/repos/${targetRepo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "tinfoil-node-client",
        },
      },
    );

    if (!releaseResponse.ok) {
      throw new Error(
        `GitHub API request failed: ${releaseResponse.status} ${releaseResponse.statusText}`,
      );
    }

    const releaseData = (await releaseResponse.json()) as { body?: string };

    // Extract digest from release notes
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
      throw new Error("Could not find digest in release notes");
    }

    return digest;
  }
  
  /**
   * Perform runtime attestation on the enclave
   * @param enclaveHost - The enclave hostname
   * @returns Attestation response with measurement and keys
   */
  public async verifyEnclave(enclaveHost?: string): Promise<AttestationResponse> {
    const targetHost = enclaveHost || this.enclave;
    
    await Verifier.initializeWasm();
    
    if (typeof globalThis.verifyEnclave !== "function") {
      throw new Error("WASM verifyEnclave function not available");
    }
    
    const attestationResponse = await globalThis.verifyEnclave(targetHost);
    
    // Validate required fields
    if (!attestationResponse.tls_public_key) {
      throw new Error('Missing tls_public_key in attestation response');
    }
    if (!attestationResponse.hpke_public_key) {
      throw new Error('Missing hpke_public_key in attestation response');
    }
    
    // Parse runtime measurement
    let parsedRuntimeMeasurement: AttestationMeasurement;
    if (attestationResponse.measurement && typeof attestationResponse.measurement === 'string') {
      parsedRuntimeMeasurement = JSON.parse(attestationResponse.measurement);
    } else if (attestationResponse.measurement && typeof attestationResponse.measurement === 'object') {
      parsedRuntimeMeasurement = attestationResponse.measurement;
    } else {
      throw new Error('Invalid runtime measurement format');
    }
    
    return {
      tlsPublicKeyFingerprint: attestationResponse.tls_public_key,
      hpkePublicKey: attestationResponse.hpke_public_key,
      measurement: parsedRuntimeMeasurement,
    };
  }
  
  /**
   * Perform code attestation
   * @param repo - Repository name
   * @param digest - Code digest hash
   * @returns Code measurement
   */
  public async verifyCode(repo: string, digest: string): Promise<{ measurement: AttestationMeasurement }> {
    await Verifier.initializeWasm();
    
    if (typeof globalThis.verifyCode !== "function") {
      throw new Error("WASM verifyCode function not available");
    }
    
    const codeMeasurement = await globalThis.verifyCode(repo, digest);
    
    // Parse code measurement to ensure correct format
    let parsedCodeMeasurement: AttestationMeasurement;
    if (typeof codeMeasurement === 'string') {
      parsedCodeMeasurement = JSON.parse(codeMeasurement);
    } else if (codeMeasurement && typeof codeMeasurement === 'object') {
      parsedCodeMeasurement = {
        type: codeMeasurement.type || 'unknown',
        registers: codeMeasurement.registers || []
      };
    } else {
      throw new Error('Invalid code measurement format');
    }
    
    return { measurement: parsedCodeMeasurement };
  }
  
  /**
   * Compare measurements using platform-specific logic
   * @param codeMeasurement - Expected measurement from code attestation
   * @param runtimeMeasurement - Actual measurement from runtime attestation
   * @returns true if measurements match according to platform rules
   */
  public async compareMeasurements(codeMeasurement: AttestationMeasurement, runtimeMeasurement: AttestationMeasurement): Promise<boolean> {
    return compareMeasurements(codeMeasurement, runtimeMeasurement);
  }

  /**
   * Perform attestation verification (backward compatibility)
   * 
   * This method:
   * 1. Fetches the latest code digest from GitHub releases
   * 2. Calls verifyCode to get the expected measurement for the code
   * 3. Calls verifyEnclave to get the actual runtime measurement
   * 4. Compares measurements using platform-specific logic:
   *    - Multi-platform to multi-platform: all registers must match
   *    - Multi-platform to TDX: RTMR1 and RTMR2 must match
   *    - Multi-platform to SEV: first register (SNP measurement) must match
   *    - Same platform types: all registers must match
   * 5. Returns the attestation response if verification succeeds
   * 
   * @throws Error if measurements don't match or verification fails
   */
  public async verify(): Promise<AttestationResponse> {
    const cacheKey = `${this.repo}::${this.enclave}`;
    const cachedResult = Verifier.verificationCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }
    
    const verificationPromise = (async () => {
      await Verifier.initializeWasm();

      if (
        typeof globalThis.verifyCode !== "function" ||
        typeof globalThis.verifyEnclave !== "function"
      ) {
        throw new Error("WASM verification functions not available");
      }

      // Fetch the latest release digest
      const fetchFn = getFetch();
      const releaseResponse = await fetchFn(
        `https://api-github-proxy.tinfoil.sh/repos/${this.repo}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "tinfoil-node-client",
          },
        },
      );

      if (!releaseResponse.ok) {
        throw new Error(
          `GitHub API request failed: ${releaseResponse.status} ${releaseResponse.statusText}`,
        );
      }

      const releaseData = (await releaseResponse.json()) as { body?: string };

      // Extract digest from release notes
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
        throw new Error("Could not find digest in release notes");
      }

      // Perform both verifications in parallel
      const [codeMeasurement, attestationResponse] = await Promise.all([
        globalThis.verifyCode(this.repo, digest),
        globalThis.verifyEnclave(this.enclave),
      ]);

      // Parse measurements to ensure correct format
      let parsedCodeMeasurement: AttestationMeasurement;
      let parsedRuntimeMeasurement: AttestationMeasurement;

      // Code measurement may be returned as JSON string or object
      if (typeof codeMeasurement === 'string') {
        parsedCodeMeasurement = JSON.parse(codeMeasurement);
      } else if (codeMeasurement && typeof codeMeasurement === 'object') {
        parsedCodeMeasurement = {
          type: codeMeasurement.type || 'unknown',
          registers: codeMeasurement.registers || []
        };
      } else {
        throw new Error('Invalid code measurement format');
      }

      // Runtime measurement from attestation response
      if (attestationResponse.measurement && typeof attestationResponse.measurement === 'string') {
        parsedRuntimeMeasurement = JSON.parse(attestationResponse.measurement);
      } else if (attestationResponse.measurement && typeof attestationResponse.measurement === 'object') {
        parsedRuntimeMeasurement = attestationResponse.measurement;
      } else {
        throw new Error('Invalid runtime measurement format');
      }

      // Compare measurements using platform-specific logic
      const measurementsMatch = compareMeasurements(parsedCodeMeasurement, parsedRuntimeMeasurement);
      
      if (!measurementsMatch) {
        throw new Error(
          `Measurement verification failed: Code measurement (${parsedCodeMeasurement.type}) ` +
          `does not match runtime measurement (${parsedRuntimeMeasurement.type})`
        );
      }

      return {
        tlsPublicKeyFingerprint: attestationResponse.tls_public_key,
        hpkePublicKey: attestationResponse.hpke_public_key,
        measurement: parsedRuntimeMeasurement,
      };
    })();

    Verifier.verificationCache.set(cacheKey, verificationPromise);
    verificationPromise.catch(() => {
      Verifier.verificationCache.delete(cacheKey);
    });

    return verificationPromise;
  }
}

// Start initialization as soon as the module loads
Verifier.initializeWasm().catch(console.error);

/**
 * Control WASM log output
 * 
 * The Go WASM runtime outputs logs through a polyfilled fs.writeSync.
 * This function allows suppressing those logs without affecting other console output.
 * 
 * @param suppress - Whether to suppress WASM logs (default: true)
 */
export function suppressWasmLogs(suppress = true): void {
  (globalThis as any).__tinfoilSuppressWasmLogs = suppress;
  Verifier.wasmLogsSuppressed = suppress;

  const fsObj = (globalThis as any).fs as { writeSync: (fd: number, buf: Uint8Array) => number } | undefined;
  if (!fsObj || typeof fsObj.writeSync !== "function") return;

  if (suppress) {
    if (!Verifier.originalFsWriteSync) {
      Verifier.originalFsWriteSync = fsObj.writeSync.bind(fsObj);
    }
    fsObj.writeSync = function (_fd: number, buf: Uint8Array) {
      return buf.length;
    };
  } else if (Verifier.originalFsWriteSync) {
    fsObj.writeSync = Verifier.originalFsWriteSync;
  }
}

/**
 * Initialize globals needed for Go WASM runtime
 * This function sets up browser-like globals that the Go WASM runtime expects
 */
async function initializeWasmGlobals(): Promise<void> {
  // Only initialize once
  if (Verifier.globalsInitialized) {
    return;
  }

  const root = globalThis as any;

  // Performance API (Go runtime expects a few methods to exist)
  if (!root.performance) {
    root.performance = {
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
  } else {
    root.performance.now = root.performance.now ?? (() => Date.now());
    root.performance.markResourceTiming = root.performance.markResourceTiming ?? (() => {});
    root.performance.mark = root.performance.mark ?? (() => {});
    root.performance.measure = root.performance.measure ?? (() => {});
    root.performance.clearMarks = root.performance.clearMarks ?? (() => {});
    root.performance.clearMeasures = root.performance.clearMeasures ?? (() => {});
    root.performance.getEntriesByName = root.performance.getEntriesByName ?? (() => []);
    root.performance.getEntriesByType = root.performance.getEntriesByType ?? (() => []);
    root.performance.getEntries = root.performance.getEntries ?? (() => []);
  }

  // Text encoding
  if (!root.TextEncoder) {
    root.TextEncoder = getTextEncoder();
  }
  if (!root.TextDecoder) {
    root.TextDecoder = getTextDecoder();
  }

  // Crypto API (needed by Go WASM)
  ensureCrypto(root);

  // Default: suppress WASM (Go) stdout/stderr logs unless explicitly enabled by caller
  if (typeof root.__tinfoilSuppressWasmLogs === "undefined") {
    root.__tinfoilSuppressWasmLogs = true;
  }

  // Force process to stay running (prevent Go from exiting Node process)
  // This is a common issue with Go WASM in Node - it calls process.exit()
  if (root.process && typeof root.process.exit === "function" && !root.__tinfoilProcessExitPatched) {
    root.__tinfoilProcessExitPatched = true;
    const originalExit = root.process.exit.bind(root.process);
    root.__tinfoilOriginalProcessExit = originalExit;
    // Replace process.exit to prevent the Go WASM runtime from terminating the Node.js process.
    // When wasm log suppression is enabled, suppress the informational log about the ignored exit
    // so callers can silence only the WASM-related noise while keeping application logs intact.
    root.process.exit = ((code?: number) => {
      if (!root.__tinfoilSuppressWasmLogs) {
        console.log(`Process exit called with code ${code} - ignoring to keep runtime alive`);
      }
      return undefined as never;
    }) as any;
  }

  await loadWasmExec();

  Verifier.globalsInitialized = true;
}

function ensureCrypto(root: Record<string, any>): void {
  const hasWorkingGetRandomValues =
    root.crypto && typeof root.crypto.getRandomValues === "function"
      ? root.crypto
      : resolveWindowCrypto(root);

  if (hasWorkingGetRandomValues) {
    if (!root.crypto) {
      root.crypto = hasWorkingGetRandomValues;
    }
    return;
  }

  const nodeRandomBytes = resolveNodeRandomBytes();
  if (!nodeRandomBytes) {
    throw new Error("crypto.getRandomValues is not available in this environment");
  }

  const fallbackCrypto = {
    getRandomValues: (buffer: Uint8Array) => {
      const bytes = nodeRandomBytes(buffer.length);
      buffer.set(bytes);
      return buffer;
    },
  };

  try {
    root.crypto = fallbackCrypto;
  } catch {
    Object.defineProperty(root, "crypto", {
      configurable: true,
      enumerable: false,
      value: fallbackCrypto,
      writable: false,
    });
  }
}

function resolveWindowCrypto(root: Record<string, any>): Crypto | undefined {
  const maybeWindow = root.window ?? (typeof window !== "undefined" ? window : undefined);
  if (maybeWindow?.crypto && typeof maybeWindow.crypto.getRandomValues === "function") {
    return maybeWindow.crypto;
  }
  return undefined;
}

function resolveNodeRandomBytes(): ((size: number) => Uint8Array) | undefined {
  if (!nodeRequire) {
    return undefined;
  }

  try {
    const cryptoModule = nodeRequire("crypto") as { randomBytes?: (size: number) => Uint8Array } | undefined;
    const randomBytes = typeof cryptoModule?.randomBytes === "function" ? cryptoModule.randomBytes : undefined;
    if (randomBytes) {
      return (size: number) => {
        const result = randomBytes(size);
        return result instanceof Uint8Array ? result : new Uint8Array(result);
      };
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function loadWasmExec(): Promise<void> {
  if (!wasmExecLoader) {
    wasmExecLoader = (async () => {
      // Prefer a dynamic import so bundlers (Next/Webpack/Vite) include the file.
      // If that fails (e.g., pure Node without bundler), fall back to require.
      try {
        await import("./wasm-exec.js");
      } catch {
        if (nodeRequire) {
          nodeRequire("./wasm-exec.js");
          return;
        }
        throw new Error("Failed to load wasm-exec.js via dynamic import, and require() is unavailable");
      }
    })();

    wasmExecLoader.catch(() => {
      wasmExecLoader = null;
    });
  }

  return wasmExecLoader;
}

function createNodeRequire(): ((id: string) => any) | undefined {
  try {
    return typeof require === "function" ? require : undefined;
  } catch {
    return undefined;
  }
}
