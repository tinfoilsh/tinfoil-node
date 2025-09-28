import type { Transport as EhbpTransport } from "ehbp";
import { getEhbpModule, ensureEhbpEnvironment, __setEhbpModuleForTests as __setEhbpModuleForTestsShared, __resetEhbpModuleStateForTests as __resetEhbpModuleStateForTestsShared } from "./ehbp-module";

const transportCache = new Map<string, Promise<EhbpTransport>>();

// Public API
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
  hpkePublicKey: string,
  init?: RequestInit,
): Promise<Response> {
  const { url: requestUrl, init: requestInit } = normalizeEncryptedBodyRequestArgs(
    input,
    init,
  );

  const { origin } = new URL(requestUrl);
  const transport = await getTransportForOrigin(origin);

  const serverPublicKey = await transport.getServerPublicKeyHex();
  if (serverPublicKey !== hpkePublicKey) {
    throw new Error(`HPKE public key mismatch: expected ${hpkePublicKey}, got ${serverPublicKey}`);
  }
  
  return transport.request(requestUrl, requestInit);
}

export function createEncryptedBodyFetch(baseURL: string, hpkePublicKey: string): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const normalized = normalizeEncryptedBodyRequestArgs(input, init);
    const targetUrl = new URL(normalized.url, baseURL);

    return encryptedBodyRequest(targetUrl.toString(), hpkePublicKey, normalized.init);
  }) as typeof fetch;
}

async function getTransportForOrigin(origin: string): Promise<EhbpTransport> {
  const cached = transportCache.get(origin);
  if (cached) {
    return cached;
  }

  const transportPromise = (async () => {
    const { Identity, createTransport } = await getEhbpModule();
    ensureEhbpEnvironment();
    
    const clientIdentity = await Identity.generate();
    return createTransport(origin, clientIdentity);
  })().catch((error) => {
    transportCache.delete(origin);
    throw error;
  });

  transportCache.set(origin, transportPromise);
  return transportPromise;
}

// Test utilities
export function __setEhbpModuleForTests(module: Parameters<typeof __setEhbpModuleForTestsShared>[0]): void {
  __setEhbpModuleForTestsShared(module);
}

export function __resetEhbpModuleStateForTests(): void {
  __resetEhbpModuleStateForTestsShared();
  transportCache.clear();
}
