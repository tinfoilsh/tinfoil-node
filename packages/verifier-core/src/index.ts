// Core types
export {
  PredicateType,
  AttestationError,
  FormatMismatchError,
  MeasurementMismatchError,
  compareMeasurements,
} from './types.js';

export type {
  AttestationDocument,
  AttestationMeasurement,
  AttestationResponse,
  VerificationDocument,
  VerificationStepState,
  HardwareMeasurement,
} from './types.js';

// GitHub API
export { fetchLatestDigest, fetchAttestationBundle } from './github.js';
export type { Release, AttestationBundleResponse } from './github.js';

// Router
export { getRouterAddress } from './router.js';

// SEV
export * from './sev/index.js';
