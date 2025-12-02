/**
 * VERIFIER COMPONENT OVERVIEW
 * ==========================
 *
 * This implementation performs end-to-end enclave and code verification entirely on the
 * client using a Go WebAssembly module, and exposes a small TypeScript API around it.
 *
 * UNIFIED VERIFICATION FLOW
 * The primary API is `verify()`, which invokes the Go WASM `verify(enclaveHost, repo)`
 * function that performs all verification steps atomically:
 *
 * 1) DIGEST FETCH
 *    - Fetches the latest release digest from GitHub
 *    - Uses Tinfoil GitHub proxy (https://api-github-proxy.tinfoil.sh) to avoid rate limits
 *
 * 2) CODE INTEGRITY (Release Verification)
 *    - Verifies code provenance using Sigstore/Rekor for GitHub Actions builds
 *    - Returns the expected code measurement for the release
 *
 * 3) REMOTE ATTESTATION (Enclave Verification)
 *    - Performs runtime attestation against the target enclave hostname
 *    - Verifies vendor certificate chains inside WASM (AMD SEV-SNP / Intel TDX)
 *    - Returns the enclave's runtime measurement and cryptographic keys (TLS fingerprint and HPKE)
 *
 * 4) HARDWARE VERIFICATION (for TDX platforms)
 *    - Fetches and verifies TDX platform measurements if required
 *    - Validates hardware attestation against expected measurements
 *
 * 5) CODE CONSISTENCY (Measurement Comparison)
 *    - Compares the runtime measurement with the expected code measurement
 *    - Uses platform-aware comparison rules for different TEE types
 *
 * ERROR HANDLING
 * When verification fails, errors are prefixed with the failing step:
 * - `fetchDigest:` - Failed to fetch GitHub release digest
 * - `verifyCode:` - Failed to verify code provenance
 * - `verifyEnclave:` - Failed runtime attestation
 * - `verifyHardware:` - Failed TDX hardware verification
 * - `validateTLS:` - TLS public key validation failed
 * - `measurements:` - Measurement comparison failed
 *
 * RUNTIME AND DELIVERY
 * - All verification executes locally via WebAssembly (Go → WASM)
 * - WASM loader: `wasm-exec.js`
 * - WASM module URL: https://tinfoilsh.github.io/verifier/tinfoil-verifier.wasm
 * - Works in Node 20+ and modern browsers with lightweight polyfills for
 *   `performance`, `TextEncoder`/`TextDecoder`, and `crypto.getRandomValues`
 * - Go stdout/stderr is suppressed by default; toggle via `suppressWasmLogs()`
 *
 * PROXIES AND TRUST
 * - GitHub proxy is used only to avoid rate limits; the WASM logic independently
 *   validates release provenance via Sigstore transparency logs
 * - AMD KDS access may be proxied within the WASM for availability; AMD roots are
 *   embedded and the full chain is verified in Go to prevent forgery
 *
 * SUPPORTED PLATFORMS
 * - AMD SEV-SNP
 * - Intel TDX (with hardware platform verification)
 * - Predicate types: SNP/TDX multi-platform v1, TDX guest v1/v2, SEV-SNP guest v1
 *
 * PUBLIC API (this module)
 * - `new Verifier({ serverURL, configRepo? })`
 * - `verify()` → Promise<AttestationResponse> - full end-to-end verification returning cryptographic keys and measurement
 * - `getVerificationDocument()` → VerificationDocument | undefined - detailed step-by-step verification results
 * - `suppressWasmLogs(suppress?)` → void - control WASM log output
 */
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
  verifyCode: (configRepo: string, digest: string) => Promise<any>;
  verifyEnclave: (host: string) => Promise<any>;
  verify: (enclaveHost: string, repo: string) => Promise<string>; // performs full verification and returns JSON object
} & typeof global;

/**
 * Attestation measurement containing platform type and register values
 */
export interface AttestationMeasurement {
  type: string;
  registers: string[];
}

/**
 * Hardware measurement from TDX platform verification
 */
export interface HardwareMeasurement {
  ID: string;
  MRTD: string;
  RTMR0: string;
}

/**
 * Ground truth response from WASM verify() function
 */
interface GroundTruth {
  tls_public_key: string;
  hpke_public_key: string;
  digest: string;
  code_measurement: AttestationMeasurement;
  enclave_measurement: AttestationMeasurement;
  hardware_measurement?: HardwareMeasurement;
  code_fingerprint: string;
  enclave_fingerprint: string;
}


/**
 * Attestation response containing cryptographic keys and measurements
 * At least one of tlsPublicKeyFingerprint or hpkePublicKey must be present
 */
export interface AttestationResponse {
  tlsPublicKeyFingerprint?: string;
  hpkePublicKey?: string;
  measurement: AttestationMeasurement;
}

/**
 * State of an intermediate verification step
 */
export interface VerificationStepState {
  status: 'pending' | 'success' | 'failed';
  error?: string;
}

/**
 * Full verification document produced by a verify() call
 * Includes state tracking for all intermediate steps
 */
export interface VerificationDocument {
  configRepo: string;
  enclaveHost: string;
  releaseDigest: string;
  codeMeasurement: AttestationMeasurement;
  enclaveMeasurement: AttestationResponse;
  tlsPublicKey: string;
  hpkePublicKey: string;
  hardwareMeasurement?: HardwareMeasurement;
  codeFingerprint: string;
  enclaveFingerprint: string;
  selectedRouterEndpoint: string;
  securityVerified: boolean;
  steps: {
    fetchDigest: VerificationStepState;
    verifyCode: VerificationStepState;
    verifyEnclave: VerificationStepState;
    compareMeasurements: VerificationStepState;
    createTransport?: VerificationStepState;
    verifyHPKEKey?: VerificationStepState;
    otherError?: VerificationStepState;
  };
}

/**
 * Verifier performs attestation verification for Tinfoil enclaves
 *
 * The verifier loads a WebAssembly module (compiled from Go) that performs
 * end-to-end attestation verification:
 * 1. Fetches the latest code release digest from GitHub
 * 2. Verifies code provenance using Sigstore/Rekor
 * 3. Performs runtime attestation against the enclave
 * 4. Verifies hardware measurements (for TDX platforms)
 * 5. Compares code and runtime measurements using platform-specific logic
 *
 * Primary method: verify() - Returns AttestationResponse with cryptographic keys
 * Verification details: getVerificationDocument() - Returns step-by-step results
 */
export class Verifier {
  private static goInstance: any = null;
  private static initializationPromise: Promise<void> | null = null;
  private static readonly defaultWasmUrl =
    "https://tinfoilsh.github.io/verifier/tinfoil-verifier.wasm";
  public static originalFsWriteSync: ((fd: number, buf: Uint8Array) => number) | null = null;
  public static wasmLogsSuppressed = true;
  public static globalsInitialized = false;

  // Stores the full verification document for the last successful verification
  private lastVerificationDocument?: VerificationDocument;

  // Configuration for the target enclave and repository
  protected readonly serverURL: string;
  protected readonly configRepo: string;

  constructor(options?: { serverURL?: string; configRepo?: string }) {
    if (!options?.serverURL) {
      throw new Error("serverURL is required for Verifier");
    }
    this.serverURL = new URL(options.serverURL).hostname;
    this.configRepo = options?.configRepo ?? TINFOIL_CONFIG.INFERENCE_PROXY_REPO;
  }

  /**
   * Execute a function with a fresh WASM instance that auto-cleans up
   * This ensures Go runtime doesn't keep the process alive
   */
  private static async executeWithWasm<T>(fn: () => Promise<T>): Promise<T> {
    await initializeWasmGlobals();

    const goInstance = new globalThis.Go();

    // Load WASM module
    const fetchFn = getFetch();
    const wasmResponse = await fetchFn(Verifier.defaultWasmUrl);
    if (!wasmResponse.ok) {
      throw new Error(`Failed to fetch WASM: ${wasmResponse.status} ${wasmResponse.statusText}`);
    }

    const wasmBuffer = await wasmResponse.arrayBuffer();
    const result = await WebAssembly.instantiate(
      wasmBuffer,
      goInstance.importObject,
    );

    // Start the Go instance in the background
    // We don't await this - it runs continuously
    goInstance.run(result.instance);

    // Wait for WASM functions to be available
    await new Promise(resolve => setTimeout(resolve, 100));
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

    try {
      // Execute the user's function
      const result = await fn();
      return result;
    } finally {
      // Clean up the Go instance
      if (goInstance._scheduledTimeouts instanceof Map) {
        for (const timeoutId of goInstance._scheduledTimeouts.values()) {
          clearTimeout(timeoutId);
        }
        goInstance._scheduledTimeouts.clear();
      }

      if (typeof goInstance.exit === 'function') {
        try {
          goInstance.exit(0);
        } catch (e) {
          // Ignore exit errors
        }
      }
    }
  }

  /**
   * Perform end-to-end attestation verification
   *
   * This method performs all verification steps atomically via the Go WASM verify() function:
   * 1. Fetches the latest code digest from GitHub releases
   * 2. Verifies code provenance using Sigstore/Rekor
   * 3. Performs runtime attestation against the enclave
   * 4. Verifies hardware measurements (for TDX platforms)
   * 5. Compares code and runtime measurements using platform-specific logic
   *
   * The WASM runtime is automatically initialized and cleaned up within this method.
   * A detailed verification document is saved and can be accessed via getVerificationDocument().
   *
   * @returns AttestationResponse containing cryptographic keys (TLS/HPKE) and enclave measurement
   * @throws Error if measurements don't match or verification fails at any step
   */
  public async verify(): Promise<AttestationResponse> {
    return Verifier.executeWithWasm(async () => {
      return this.verifyInternal();
    });
  }

  /**
   * Save a failed verification document
   */
  private saveFailedVerificationDocument(steps: VerificationDocument['steps']): void {
    this.lastVerificationDocument = {
      configRepo: this.configRepo,
      enclaveHost: this.serverURL,
      releaseDigest: '',
      codeMeasurement: { type: '', registers: [] },
      enclaveMeasurement: { measurement: { type: '', registers: [] } },
      tlsPublicKey: '',
      hpkePublicKey: '',
      hardwareMeasurement: undefined,
      codeFingerprint: '',
      enclaveFingerprint: '',
      selectedRouterEndpoint: this.serverURL,
      securityVerified: false,
      steps,
    };
  }

  /**
   * Internal verification logic that runs within WASM context
   */
  private async verifyInternal(): Promise<AttestationResponse> {
    const steps: VerificationDocument['steps'] = {
      fetchDigest: { status: 'pending' },
      verifyCode: { status: 'pending' },
      verifyEnclave: { status: 'pending' },
      compareMeasurements: { status: 'pending' },
    };

    if (typeof globalThis.verify !== "function") {
      steps.fetchDigest = { status: 'failed', error: 'WASM verify function not available' };
      this.saveFailedVerificationDocument(steps);
      throw new Error("WASM verify function not available");
    }

    let groundTruth: GroundTruth;
    try {
      const groundTruthJSON = await globalThis.verify(this.serverURL, this.configRepo);
      groundTruth = JSON.parse(groundTruthJSON);

      // Mark all steps as successful since WASM verify() succeeded
      steps.fetchDigest = { status: 'success' };
      steps.verifyCode = { status: 'success' };
      steps.verifyEnclave = { status: 'success' };
      steps.compareMeasurements = { status: 'success' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (errorMessage.startsWith('fetchDigest:')) {
        steps.fetchDigest = { status: 'failed', error: errorMessage };
      } else if (errorMessage.startsWith('verifyCode:')) {
        steps.fetchDigest = { status: 'success' };
        steps.verifyCode = { status: 'failed', error: errorMessage };
      } else if (errorMessage.startsWith('verifyEnclave:')) {
        steps.fetchDigest = { status: 'success' };
        steps.verifyCode = { status: 'success' };
        steps.verifyEnclave = { status: 'failed', error: errorMessage };
      } else if (errorMessage.startsWith('measurements:')) {
        steps.fetchDigest = { status: 'success' };
        steps.verifyCode = { status: 'success' };
        steps.verifyEnclave = { status: 'success' };
        steps.compareMeasurements = { status: 'failed', error: errorMessage };
      } else if (errorMessage.startsWith('verifyHardware:') || errorMessage.startsWith('validateTLS:')) {
        steps.fetchDigest = { status: 'success' };
        steps.verifyCode = { status: 'success' };
        steps.verifyEnclave = { status: 'success' };
        steps.otherError = { status: 'failed', error: errorMessage };
      } else {
        steps.otherError = { status: 'failed', error: errorMessage };
      }

      this.saveFailedVerificationDocument(steps);
      throw error;
    }

    const attestation: AttestationResponse = {
      tlsPublicKeyFingerprint: groundTruth.tls_public_key,
      hpkePublicKey: groundTruth.hpke_public_key,
      measurement: groundTruth.enclave_measurement,
    };

    this.lastVerificationDocument = {
      configRepo: this.configRepo,
      enclaveHost: this.serverURL,
      releaseDigest: groundTruth.digest,
      codeMeasurement: groundTruth.code_measurement,
      enclaveMeasurement: attestation,
      tlsPublicKey: groundTruth.tls_public_key,
      hpkePublicKey: groundTruth.hpke_public_key,
      hardwareMeasurement: groundTruth.hardware_measurement,
      codeFingerprint: groundTruth.code_fingerprint,
      enclaveFingerprint: groundTruth.enclave_fingerprint,
      selectedRouterEndpoint: this.serverURL,
      securityVerified: true,
      steps,
    };

    return attestation;
  }

  /**
   * Returns the verification document from the last verify() call
   *
   * The document contains detailed step-by-step verification results including:
   * - Step status (pending/success/failed) for each verification phase
   * - Measurements, fingerprints, and cryptographic keys
   * - Error messages for any failed steps
   *
   * Available even if verification failed, allowing inspection of which step failed.
   *
   * @returns VerificationDocument with complete verification details, or undefined if verify() hasn't been called
   */
  public getVerificationDocument(): VerificationDocument | undefined {
    return this.lastVerificationDocument;
  }
}

// Start initialization as soon as the module loads
function shouldAutoInitializeWasm(): boolean {
  const globalAny = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
      versions?: { node?: string };
    };
    window?: unknown;
    document?: unknown;
  };

  const env = globalAny.process?.env;
  const autoInitFlag = env?.TINFOIL_SKIP_WASM_AUTO_INIT ?? env?.TINFOIL_DISABLE_WASM_AUTO_INIT;
  if (typeof autoInitFlag === "string") {
    const normalized = autoInitFlag.toLowerCase();
    if (normalized === "1" || normalized === "true") {
      return false;
    }
  }

  if (env?.NODE_ENV === "test") {
    return false;
  }

  const isNode = typeof globalAny.process?.versions?.node === "string";
  if (isNode) {
    return false;
  }

  const hasBrowserGlobals = typeof globalAny.window === "object" && typeof globalAny.document === "object";
  return hasBrowserGlobals;
}

/**
 * Control WASM log output
 *
 * The Go WASM runtime outputs logs (stdout/stderr) through a polyfilled fs.writeSync.
 * This function allows suppressing those logs without affecting other console output.
 * By default, WASM logs are suppressed to reduce noise.
 *
 * @param suppress - Whether to suppress WASM logs (default: true)
 * @returns void
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
        // @ts-expect-error: Local JS helper has no TS types; ambient module declared in wasm-exec.d.ts
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
