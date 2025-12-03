// Re-export everything from verifier-core
export {
  PredicateType,
  AttestationError,
  FormatMismatchError,
  MeasurementMismatchError,
  compareMeasurements,
} from '@tinfoil/verifier-core';

export type {
  AttestationDocument,
  AttestationMeasurement,
  AttestationResponse,
  VerificationDocument,
  VerificationStepState,
  HardwareMeasurement,
} from '@tinfoil/verifier-core';

// Node.js-specific implementation using crypto module
import crypto from 'crypto';
import type { AttestationMeasurement } from '@tinfoil/verifier-core';

/**
 * Computes the fingerprint of a measurement.
 * If there is only one register, returns that register directly.
 * Otherwise, returns SHA-256 hash of type + all registers concatenated.
 */
export function measurementFingerprint(m: AttestationMeasurement): string {
  if (m.registers.length === 1) {
    return m.registers[0];
  }

  const allData = m.type + m.registers.join('');
  const hash = crypto.createHash('sha256').update(allData).digest('hex');
  return hash;
}
