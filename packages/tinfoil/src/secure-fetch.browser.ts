import { createEncryptedBodyFetch } from "./encrypted-body-fetch";

export function createSecureFetch(baseURL: string, enclaveURL?: string, hpkePublicKey?: string, tlsPublicKeyFingerprint?: string): typeof fetch {
    if (hpkePublicKey) {
        return createEncryptedBodyFetch(baseURL, hpkePublicKey, enclaveURL);
    } else {
        throw new Error(
            "HPKE public key not available and TLS-only verification is not supported in browsers. " +
            "Only HPKE-enabled enclaves can be used in browser environments."
        );
    }
}