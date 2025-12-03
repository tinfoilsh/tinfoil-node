// Re-export from verifier-core
export { fetchLatestDigest, fetchAttestationBundle } from '@tinfoil/verifier-core';
export type { Release, AttestationBundleResponse } from '@tinfoil/verifier-core';

// Keep the local AttestationResponse type alias for backwards compatibility
// (Note: This is different from the core AttestationResponse type)
export type { AttestationBundleResponse as AttestationResponse } from '@tinfoil/verifier-core';
