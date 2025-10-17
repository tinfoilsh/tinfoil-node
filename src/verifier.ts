/**
 * VERIFIER COMPONENT OVERVIEW
 * ==========================
 *
 * This implementation performs three security checks entirely on the client using
 * a Go WebAssembly module, and exposes a small TypeScript API around it.
 *
 * 1) REMOTE ATTESTATION (Enclave Verification)
 *    - Invokes Go WASM `verifyEnclave(host)` against the target enclave hostname
 *    - Verifies vendor certificate chains inside WASM (AMD SEV-SNP / Intel TDX)
 *    - Returns the enclave's runtime measurement and at least one public key (TLS fingerprint and/or HPKE)
 *    - Falls back to TLS-only verification if only TLS key is available (Node.js only)
 *
 * 2) CODE INTEGRITY (Release Verification)
 *    - Fetches the latest release notes via the Tinfoil GitHub proxy and extracts a digest
 *      (endpoint: https://api-github-proxy.tinfoil.sh)
 *    - Invokes Go WASM `verifyCode(configRepo, digest)` to obtain the expected code measurement
 *    - The Go implementation verifies provenance using Sigstore/Rekor for GitHub Actions builds
 *
 * 3) CODE CONSISTENCY (Measurement Comparison)
 *    - Compares the runtime measurement with the expected code measurement using
 *      platform-aware rules implemented in `compareMeasurements()`
 *
 * RUNTIME AND DELIVERY
 * - All verification executes locally via WebAssembly (Go → WASM)
 * - WASM loader: `wasm-exec.js`
 * - WASM module URL: https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm
 * - Works in Node 20+ and modern browsers with lightweight polyfills for
 *   `performance`, `TextEncoder`/`TextDecoder`, and `crypto.getRandomValues`
 * - Go stdout/stderr is suppressed by default; toggle via `suppressWasmLogs()`
 * - Module auto-initializes the WASM runtime on import
 *
 * PROXIES AND TRUST
 * - GitHub proxy is used only to avoid rate limits; the WASM logic independently
 *   validates release provenance via Sigstore transparency logs
 * - AMD KDS access may be proxied within the WASM for availability; AMD roots are
 *   embedded and the full chain is verified in Go to prevent forgery
 *
 * SUPPORTED PLATFORMS AND PREDICATES
 * - Predicate types supported by this client: SNP/TDX multi-platform v1,
 *   TDX guest v1, SEV-SNP guest v1
 * - See `compareMeasurements()` for exact register mapping rules
 *
 * PUBLIC API (this module)
 * - `new Verifier({ serverURL?, configRepo? })`
 * - `verify()` → full end-to-end verification and attestation response
 * - `verifyEnclave(host?)` → runtime attestation only
 * - `verifyCode(configRepo, digest)` → expected measurement for a specific release
 * - `compareMeasurements(code, runtime)` → predicate-based comparison
 * - `fetchLatestDigest(configRepo?)` → release digest via proxy
 * - `suppressWasmLogs(suppress?)` → control WASM log output
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
} & typeof global;

/**
 * Attestation measurement containing platform type and register values
 */
export interface AttestationMeasurement {
  type: string;
  registers: string[];
}

// Platform type constants
// See https://github.com/tinfoilsh/verifier/
const PLATFORM_TYPES = {
  SNP_TDX_MULTI_PLATFORM_V1: "https://tinfoil.sh/predicate/snp-tdx-multiplatform/v1",
  TDX_GUEST_V1: "https://tinfoil.sh/predicate/tdx-guest/v1",
  TDX_GUEST_V2: "https://tinfoil.sh/predicate/tdx-guest/v2",
  SEV_GUEST_V1: "https://tinfoil.sh/predicate/sev-snp-guest/v1",
  SEV_GUEST_V2: "https://tinfoil.sh/predicate/sev-snp-guest/v2",
  HARDWARE_MEASUREMENTS_V1: "https://tinfoil.sh/predicate/hardware-measurements/v1",
} as const;

const MEASUREMENT_ERROR_MESSAGES = {
  FORMAT_MISMATCH: "attestation format mismatch",
  MEASUREMENT_MISMATCH: "measurement mismatch",
  RTMR1_MISMATCH: "RTMR1 mismatch",
  RTMR2_MISMATCH: "RTMR2 mismatch",
  FEW_REGISTERS: "fewer registers than expected",
  MULTI_PLATFORM_MISMATCH: "multi-platform measurement mismatch",
  MULTI_PLATFORM_SEV_SNP_MISMATCH: "multi-platform SEV-SNP measurement mismatch",
} as const;

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

function registersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

function compareMeasurementsError(
  codeMeasurement: AttestationMeasurement,
  runtimeMeasurement: AttestationMeasurement,
): Error | null {
  if (
    codeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1 &&
    runtimeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1
  ) {
    if (!registersEqual(codeMeasurement.registers, runtimeMeasurement.registers)) {
      return new Error(MEASUREMENT_ERROR_MESSAGES.MULTI_PLATFORM_MISMATCH);
    }
    return null;
  }

  if (runtimeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1) {
    return compareMeasurementsError(runtimeMeasurement, codeMeasurement);
  }

  if (codeMeasurement.type === PLATFORM_TYPES.SNP_TDX_MULTI_PLATFORM_V1) {
    switch (runtimeMeasurement.type) {
      case PLATFORM_TYPES.TDX_GUEST_V1:
      case PLATFORM_TYPES.TDX_GUEST_V2: {
        if (codeMeasurement.registers.length < 3 || runtimeMeasurement.registers.length < 4) {
          return new Error(MEASUREMENT_ERROR_MESSAGES.FEW_REGISTERS);
        }

        const expectedRtmr1 = codeMeasurement.registers[1];
        const expectedRtmr2 = codeMeasurement.registers[2];
        const actualRtmr1 = runtimeMeasurement.registers[2];
        const actualRtmr2 = runtimeMeasurement.registers[3];

        if (expectedRtmr1 !== actualRtmr1) {
          return new Error(MEASUREMENT_ERROR_MESSAGES.RTMR1_MISMATCH);
        }
        if (expectedRtmr2 !== actualRtmr2) {
          return new Error(MEASUREMENT_ERROR_MESSAGES.RTMR2_MISMATCH);
        }
        return null;
      }

      case PLATFORM_TYPES.SEV_GUEST_V1:
      case PLATFORM_TYPES.SEV_GUEST_V2: {
        if (codeMeasurement.registers.length < 1 || runtimeMeasurement.registers.length < 1) {
          return new Error(MEASUREMENT_ERROR_MESSAGES.FEW_REGISTERS);
        }

        const expectedSevSnp = codeMeasurement.registers[0];
        const actualSevSnp = runtimeMeasurement.registers[0];

        if (expectedSevSnp !== actualSevSnp) {
          return new Error(MEASUREMENT_ERROR_MESSAGES.MULTI_PLATFORM_SEV_SNP_MISMATCH);
        }
        return null;
      }

      default:
        return new Error(
          `unsupported enclave platform for multi-platform code measurements: ${runtimeMeasurement.type}`,
        );
    }
  }

  if (codeMeasurement.type !== runtimeMeasurement.type) {
    return new Error(MEASUREMENT_ERROR_MESSAGES.FORMAT_MISMATCH);
  }

  if (!registersEqual(codeMeasurement.registers, runtimeMeasurement.registers)) {
    return new Error(MEASUREMENT_ERROR_MESSAGES.MEASUREMENT_MISMATCH);
  }

  return null;
}

export interface MeasurementComparisonResult {
  match: boolean;
  error?: Error;
}

export function compareMeasurementsDetailed(
  codeMeasurement: AttestationMeasurement,
  runtimeMeasurement: AttestationMeasurement,
): MeasurementComparisonResult {
  const error = compareMeasurementsError(codeMeasurement, runtimeMeasurement);
  if (error) {
    return { match: false, error };
  }
  return { match: true };
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
export function compareMeasurements(
  codeMeasurement: AttestationMeasurement,
  runtimeMeasurement: AttestationMeasurement,
): boolean {
  return compareMeasurementsError(codeMeasurement, runtimeMeasurement) === null;
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
  private static readonly defaultWasmUrl =
    "https://tinfoilsh.github.io/verifier-js/tinfoil-verifier.wasm";
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
   * Fetch the latest release digest from GitHub
   * @param configRepo - Repository name (e.g., "tinfoilsh/confidential-model-router")
   * @returns The digest hash
   */
  public async fetchLatestDigest(configRepo?: string): Promise<string> {
    // GitHub Proxy Note:
    // We use api-github-proxy.tinfoil.sh instead of the direct GitHub API to avoid
    // rate limiting that could degrade UX. The proxy caches responses while the
    // integrity of the data is independently verified in `verifyCode` via
    // Sigstore transparency logs (Rekor). Using the proxy therefore does not
    // weaken security.
    const targetRepo = configRepo || this.configRepo;
    
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
    const digestRegex = /Digest: `([a-f0-9]{64})`/;

    const digestMatch = releaseData.body?.match(digestRegex);

    if (!digestMatch) {
      throw new Error("Could not find digest in release notes");
    }

    const digest = digestMatch[1];

    return digest;
  }
  
  /**
   * Perform runtime attestation on the enclave
   * @param enclaveHost - The enclave hostname
   * @returns Attestation response with measurement and keys
   */
  public async verifyEnclave(enclaveHost?: string): Promise<AttestationResponse> {
    // Expose errors via explicit Promise rejection and add a timeout
    return new Promise(async (resolve, reject) => {
      try {
        const targetHost = enclaveHost || this.serverURL;

        if (typeof globalThis.verifyEnclave !== "function") {
          reject(new Error("WASM verifyEnclave function not available"));
          return;
        }

        let attestationResponse: any;
        let timeoutHandle: NodeJS.Timeout | number | undefined;
        try {
          const timeoutPromise = new Promise((_, timeoutReject) => {
            timeoutHandle = setTimeout(
              () => timeoutReject(new Error("WASM verifyEnclave timed out after 10 seconds")),
              10000,
            );
          });

          attestationResponse = await Promise.race([
            (globalThis as any).verifyEnclave(targetHost),
            timeoutPromise,
          ]);
          
          // Clear timeout on success
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
          }
        } catch (error) {
          // Clear timeout on error
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle);
          }
          reject(new Error(`WASM verifyEnclave failed: ${error}`));
          return;
        }

        // Validate required fields - fail fast with explicit rejection
        // At least one key must be present (TLS or HPKE)
        if (!attestationResponse?.tls_public_key && !attestationResponse?.hpke_public_key) {
          reject(new Error("Missing both tls_public_key and hpke_public_key in attestation response"));
          return;
        }

        // Parse runtime measurement
        let parsedRuntimeMeasurement: AttestationMeasurement;
        try {
          if (
            attestationResponse.measurement &&
            typeof attestationResponse.measurement === "string"
          ) {
            parsedRuntimeMeasurement = JSON.parse(attestationResponse.measurement);
          } else if (
            attestationResponse.measurement &&
            typeof attestationResponse.measurement === "object"
          ) {
            parsedRuntimeMeasurement = attestationResponse.measurement;
          } else {
            reject(new Error("Invalid runtime measurement format"));
            return;
          }
        } catch (parseError) {
          reject(new Error(`Failed to parse runtime measurement: ${parseError}`));
          return;
        }

        const result: AttestationResponse = {
          measurement: parsedRuntimeMeasurement,
        };

        // Include keys if available
        if (attestationResponse.tls_public_key) {
          result.tlsPublicKeyFingerprint = attestationResponse.tls_public_key;
        }
        if (attestationResponse.hpke_public_key) {
          result.hpkePublicKey = attestationResponse.hpke_public_key;
        }

        resolve(result);
      } catch (outerError) {
        reject(outerError as Error);
      }
    });
  }
  
  /**
   * Perform code attestation
   * @param configRepo - Repository name
   * @param digest - Code digest hash
   * @returns Code measurement
   */
  public async verifyCode(configRepo: string, digest: string): Promise<{ measurement: AttestationMeasurement }> {
    if (typeof globalThis.verifyCode !== "function") {
      throw new Error("WASM verifyCode function not available");
    }
    
    const rawMeasurement = await globalThis.verifyCode(configRepo, digest);

    const normalizedMeasurement =
      typeof rawMeasurement === 'string'
        ? (() => {
            try {
              return JSON.parse(rawMeasurement) as unknown;
            } catch (error) {
              throw new Error(`Invalid code measurement format: ${(error as Error).message}`);
            }
          })()
        : rawMeasurement;

    if (!normalizedMeasurement || typeof normalizedMeasurement !== 'object') {
      throw new Error('Invalid code measurement format');
    }

    const measurementObject = normalizedMeasurement as {
      type?: unknown;
      registers?: unknown;
    };

    if (typeof measurementObject.type !== 'string' || !Array.isArray(measurementObject.registers)) {
      throw new Error('Invalid code measurement format');
    }

    const parsedCodeMeasurement: AttestationMeasurement = {
      type: measurementObject.type,
      registers: measurementObject.registers.map((value) => String(value))
    };
    
    return { measurement: parsedCodeMeasurement };
  }

  /**
   * Perform attestation verification
   *
   * This method:
   * 1. Fetches the latest code digest from GitHub releases
   * 2. Calls verifyCode to get the expected measurement for the code
   * 3. Calls verifyEnclave to get the actual runtime measurement
   * 4. Compares measurements using platform-specific logic (see `compareMeasurements()`)
   * 5. Returns the attestation response if verification succeeds
   *
   * The WASM runtime is automatically initialized and cleaned up within this method.
   *
   * @throws Error if measurements don't match or verification fails
   */
  public async verify(): Promise<AttestationResponse> {
    return Verifier.executeWithWasm(async () => {
      return this.verifyInternal();
    });
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

    let releaseDigest: string;
    let codeMeasurement: AttestationMeasurement;
    let attestation: AttestationResponse;

    try {
      releaseDigest = await this.fetchLatestDigest(this.configRepo);
      steps.fetchDigest = { status: 'success' };
    } catch (error) {
      steps.fetchDigest = { status: 'failed', error: (error as Error).message };
      this.lastVerificationDocument = {
        configRepo: this.configRepo,
        enclaveHost: this.serverURL,
        releaseDigest: '',
        codeMeasurement: { type: '', registers: [] },
        enclaveMeasurement: { measurement: { type: '', registers: [] } },
        securityVerified: false,
        steps,
      };
      throw error;
    }

    try {
      const results = await Promise.all([
        this.verifyCode(this.configRepo, releaseDigest).then(
          (result) => {
            steps.verifyCode = { status: 'success' };
            return result;
          },
          (error) => {
            steps.verifyCode = { status: 'failed', error: (error as Error).message };
            throw error;
          }
        ),
        this.verifyEnclave(this.serverURL).then(
          (result) => {
            steps.verifyEnclave = { status: 'success' };
            return result;
          },
          (error) => {
            steps.verifyEnclave = { status: 'failed', error: (error as Error).message };
            throw error;
          }
        ),
      ]);

      codeMeasurement = results[0].measurement;
      attestation = results[1];
    } catch (error) {
      this.lastVerificationDocument = {
        configRepo: this.configRepo,
        enclaveHost: this.serverURL,
        releaseDigest: releaseDigest!,
        codeMeasurement: codeMeasurement!,
        enclaveMeasurement: attestation!,
        securityVerified: false,
        steps,
      };
      throw error;
    }

    const measurementsMatchError = compareMeasurementsError(codeMeasurement, attestation.measurement);

    if (measurementsMatchError) {
      steps.compareMeasurements = { status: 'failed', error: measurementsMatchError.message };
      this.lastVerificationDocument = {
        configRepo: this.configRepo,
        enclaveHost: this.serverURL,
        releaseDigest: releaseDigest,
        codeMeasurement,
        enclaveMeasurement: attestation,
        securityVerified: false,
        steps,
      };
      throw new Error(
        `Verification failed: measurements did not match.\nCode measurement (${codeMeasurement.type}: ${codeMeasurement.registers})\n` +
        `Runtime measurement (${attestation.measurement.type}: ${attestation.measurement.registers}:)\n ${measurementsMatchError.message}`
      );
    }

    steps.compareMeasurements = { status: 'success' };

    this.lastVerificationDocument = {
      configRepo: this.configRepo,
      enclaveHost: this.serverURL,
      releaseDigest: releaseDigest,
      codeMeasurement,
      enclaveMeasurement: attestation,
      securityVerified: true,
      steps,
    };

    return attestation;
  }

  /**
   * Returns the full verification document from the last successful verify() call
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
