import type { Transport as EhbpTransport } from "ehbp";
import { Identity, Transport, PROTOCOL } from "ehbp";

// Public API
export async function getHPKEKey(enclaveURL: string) : Promise<CryptoKey> {
  const url = new URL(enclaveURL);

  const keysURL = new URL(PROTOCOL.KEYS_PATH, enclaveURL);

  if (keysURL.protocol !== 'https:') {
    throw new Error(`HTTPS is required for remote key retrieval. Invalid protocol: ${keysURL.protocol}`);
  }

  const response = await fetch(keysURL.toString());

  if (!response.ok) {
    throw new Error(`Failed to get server public key: ${response.status}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType !== PROTOCOL.KEYS_MEDIA_TYPE) {
    throw new Error(`Invalid content type: ${contentType}`);
  }

  const keysData = new Uint8Array(await response.arrayBuffer());
  const serverIdentity = await Identity.unmarshalPublicConfig(keysData);
  return serverIdentity.getPublicKey();
}

export function normalizeEncryptedBodyRequestArgs(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string; init?: RequestInit } {
  if (typeof input === "string") {
    return { url: input, init };
  }

  if (input instanceof URL) {
    return { url: input.toString(), init };
  }

  const request = input as Request;
  const cloned = request.clone();

  const derivedInit: RequestInit = {
    method: cloned.method,
    headers: new Headers(cloned.headers),
    body: cloned.body ?? undefined,
    signal: cloned.signal,
  };

  return {
    url: cloned.url,
    init: { ...derivedInit, ...init },
  };
}

export async function encryptedBodyRequest(
  input: RequestInfo | URL,
  hpkePublicKey?: string,
  init?: RequestInit,
  enclaveURL?: string,
  transportInstance?: EhbpTransport,
): Promise<Response> {
  const { url: requestUrl, init: requestInit } = normalizeEncryptedBodyRequestArgs(
    input,
    init,
  );

  let actualTransport: EhbpTransport;

  if (transportInstance) {
    // Use provided transport instance
    actualTransport = transportInstance;
  } else {
    // Create a new transport for this request
    const u = new URL(requestUrl);
    const { origin } = u;
    const keyOrigin = enclaveURL ? new URL(enclaveURL).origin : origin;
    actualTransport = await getTransportForOrigin(origin, keyOrigin);
  }

  if (hpkePublicKey) {
    const transportKeyHash = await actualTransport.getServerPublicKeyHex();
    if (transportKeyHash !== hpkePublicKey) {
      throw new Error(`HPKE public key mismatch. Expected: ${hpkePublicKey}, Got: ${transportKeyHash}`);
    }
  }

  return actualTransport.request(requestUrl, requestInit);
}

export function createEncryptedBodyFetch(baseURL: string, hpkePublicKey?: string, enclaveURL?: string): typeof fetch {
  // Create a dedicated transport instance for this fetch function
  let transportPromise: Promise<EhbpTransport> | null = null;

  const getOrCreateTransport = async (): Promise<EhbpTransport> => {
    if (!transportPromise) {
      const baseUrl = new URL(baseURL);
      const keyOrigin = enclaveURL ? new URL(enclaveURL).origin : baseUrl.origin;
      transportPromise = getTransportForOrigin(baseUrl.origin, keyOrigin);
    }
    return transportPromise;
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const normalized = normalizeEncryptedBodyRequestArgs(input, init);
    const targetUrl = new URL(normalized.url, baseURL);

    // Get the dedicated transport instance for this fetch function
    const transportInstance = await getOrCreateTransport();

    return encryptedBodyRequest(targetUrl.toString(), hpkePublicKey, normalized.init, enclaveURL, transportInstance);
  }) as typeof fetch;
}

export async function getTransportForOrigin(origin: string, keyOrigin: string): Promise<EhbpTransport> {
  if (typeof globalThis !== 'undefined') {
    const isSecure = (globalThis as any).isSecureContext !== false;
    const hasSubtle = !!(globalThis.crypto && (globalThis.crypto as Crypto).subtle);
    if (!isSecure || !hasSubtle) {
      const reason = !isSecure ? 'insecure context (use HTTPS or localhost)' : 'missing WebCrypto SubtleCrypto';
      throw new Error(`EHBP requires a secure browser context: ${reason}`);
    }
  }

  const clientIdentity = await Identity.generate();

  const serverPublicKey = await getHPKEKey(keyOrigin);
  const requestHost = new URL(origin).host;
  return new Transport(clientIdentity, requestHost, serverPublicKey);
}
