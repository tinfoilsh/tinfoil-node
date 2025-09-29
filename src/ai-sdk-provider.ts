import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { TINFOIL_CONFIG } from "./config";
import { createEncryptedBodyFetch } from "./encrypted-body-fetch";
import { Verifier } from "./verifier";
import { isRealBrowser } from "./env";
import https from "node:https";
import tls, { checkServerIdentity as tlsCheckServerIdentity } from "node:tls";
import { X509Certificate, createHash } from "node:crypto";

interface CreateTinfoilAIOptions {
  /** Override the inference API base URL */
  baseURL?: string;
  /** Override the config GitHub repository */
  configRepo?: string;
}

/**
 * Creates an AI SDK provider with the specified API key.
 *
 * @param apiKey - The API key for the Tinfoil API
 * @param options - Optional configuration options
 * @returns A TinfoilAI instance
 */
export async function createTinfoilAI(apiKey: string, options: CreateTinfoilAIOptions = {}) {
  const baseURL = options.baseURL || TINFOIL_CONFIG.INFERENCE_BASE_URL;
  const configRepo = options.configRepo || TINFOIL_CONFIG.INFERENCE_PROXY_REPO;

  // step 1: verify the enclave and extract the public keys
  // from the attestation response
  const verifier = new Verifier({
    baseURL,
    repo: configRepo,
  });
  const attestationResponse = await verifier.verify();
  const hpkePublicKey = attestationResponse.hpkePublicKey;
  const tlsPublicKeyFingerprint = attestationResponse.tlsPublicKeyFingerprint;

  // step 2: create the appropriate fetch function based on available keys
  let fetchFunction: typeof fetch;
  
  if (hpkePublicKey) {
    // HPKE available: use encrypted body fetch
    fetchFunction = createEncryptedBodyFetch(baseURL, hpkePublicKey);
  } else {
    // HPKE not available: check if we're in a browser
    if (isRealBrowser()) {
      throw new Error(
        "HPKE public key not available and TLS-only verification is not supported in browsers. " +
        "Only HPKE-enabled enclaves can be used in browser environments."
      );
    }
    
    // Node.js environment: fall back to TLS-only verification
    const httpsAgent = new https.Agent({
      checkServerIdentity: (
        host: string,
        cert: tls.PeerCertificate,
      ): Error | undefined => {
        if (!cert.pubkey) {
          throw new Error("No public key available in certificate");
        }
        const x509 = new X509Certificate(cert.raw);
        const publicKeyDer = x509.publicKey.export({
          type: "spki",
          format: "der",
        });
        const pubKeyFP = createHash("sha256").update(publicKeyDer).digest("hex");
        if (pubKeyFP !== tlsPublicKeyFingerprint) {
          throw new Error(
            `Certificate public key fingerprint mismatch. Expected: ${tlsPublicKeyFingerprint}, Got: ${pubKeyFP}`,
          );
        }

        return tlsCheckServerIdentity(host, cert);
      },
    });
    
    fetchFunction = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const finalInit = {
        ...init,
        agent: httpsAgent,
      } as any; // Node.js fetch accepts agent in init options
      return fetch(input, finalInit);
    }) as typeof fetch;
  }

  // step 3: create the openai compatible provider
  // that uses the appropriate fetch function
  return createOpenAICompatible({
    name: "tinfoil",
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey: apiKey,
    fetch: fetchFunction,
  });
}
