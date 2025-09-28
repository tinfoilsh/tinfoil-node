import { getEhbpModule, ensureEhbpEnvironment } from "./ehbp-module";

export type BuiltEhbpRequest = Request;

/**
 * A small helper that prepares EHBP-encrypted Request objects without sending them.
 *
 * It fetches the HPKE public key from the provided config host and uses it to
 * encrypt the body and attach EHBP headers. You can then send the resulting
 * Request to any destination that can decrypt using the corresponding private key.
 */
export class EhbpRequestBuilder {
  private readonly configBaseURL: string;
  private initPromise?: Promise<void>;
  private serverPublicKey?: CryptoKey;
  private identity?: InstanceType<Awaited<ReturnType<typeof getEhbpModule>>["Identity"]>;

  constructor(configBaseURL: string) {
    this.configBaseURL = configBaseURL;
  }

  /** Initialize identity and fetch the server public key from the config host */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      ensureEhbpEnvironment();
      const { Identity, createTransport } = await getEhbpModule();
      const id = await Identity.generate();
      const transport = await createTransport(this.configBaseURL, id);
      this.identity = id;
      this.serverPublicKey = transport.getServerPublicKey();
    })();
    return this.initPromise;
  }

  /** Returns the HPKE server public key (hex) fetched from the config host */
  async getServerPublicKeyHex(): Promise<string> {
    await this.ensureInitialized();
    const { crypto } = globalThis as unknown as { crypto: Crypto };
    const exported = await crypto.subtle.exportKey("raw", this.serverPublicKey!);
    const keyBytes = new Uint8Array(exported);
    return Array.from(keyBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /**
   * Build an EHBP-encrypted Request. The request is not sent.
   * Pass an absolute URL to target a specific destination, or a Request.
   */
  async build(input: RequestInfo | URL, init?: RequestInit): Promise<BuiltEhbpRequest> {
    await this.ensureInitialized();

    // Normalize into a Request with the intended destination before encryption
    let request: Request;
    if (input instanceof Request) {
      // Clone to avoid consuming caller's original body
      const cloned = input.clone();
      request = new Request(cloned, init);
    } else {
      request = new Request(input, init);
    }

    // Encrypt body and attach EHBP headers using the config host's public key
    const { Identity } = await getEhbpModule();
    // Type hint: identity is of type InstanceType<typeof Identity>, but we stored it already
    const encRequest = await (this.identity as InstanceType<typeof Identity>).encryptRequest(
      request,
      this.serverPublicKey!,
    );
    return encRequest;
  }
}

/** Convenience: create a builder from a config host base URL */
export function createEhbpRequestBuilder(configBaseURL: string): EhbpRequestBuilder {
  return new EhbpRequestBuilder(configBaseURL);
}

