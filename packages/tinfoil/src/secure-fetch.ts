import { createEncryptedBodyFetch } from "./encrypted-body-fetch";
import { createPinnedTlsFetch } from "./pinned-tls-fetch";
import { isRealBrowser } from "./env";

export function createSecureFetch(baseURL: string, enclaveURL?: string, hpkePublicKey?: string, tlsPublicKeyFingerprint?: string): typeof fetch {
let fetchFunction: typeof fetch;

    if (hpkePublicKey) {
      fetchFunction = createEncryptedBodyFetch(baseURL, hpkePublicKey, enclaveURL);
    } else {
      // HPKE not available: check if we're in a browser
      if (isRealBrowser()) {
        throw new Error(
          "HPKE public key not available and TLS-only verification is not supported in browsers. " +
          "Only HPKE-enabled enclaves can be used in browser environments."
        );
      }
      
      // Node.js environment: fall back to TLS-only verification using pinned TLS fetch
      if (!tlsPublicKeyFingerprint) {
        throw new Error(
          "Neither HPKE public key nor TLS public key fingerprint available for verification"
        );
      }
      fetchFunction = createPinnedTlsFetch(baseURL, tlsPublicKeyFingerprint);
    }
    return fetchFunction
}