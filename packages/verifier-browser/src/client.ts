import { verifyAttestation as verifyAmdAttestation, fetchAttestation } from './attestation.js';
import { fetchLatestDigest, fetchAttestationBundle } from './github.js';
import { verifyAttestation as verifySigstoreAttestation } from './sigstore.js';
import { AttestationDocument, AttestationMeasurement, VerificationDocument, VerificationStepState, compareMeasurements, FormatMismatchError, MeasurementMismatchError, measurementFingerprint } from './types.js';
import { getRouterAddress } from './router.js';

export interface VerificationResult {
  publicKeyFingerprint: string;
  hpkePublicKey?: string;
  digest: string;
  measurement: AttestationMeasurement;
}

export interface ClientOptions {
  enclave?: string;
  repo?: string;
  measurement?: { snp_measurement: string };
}

export class SecureClient {
  private enclave: string;
  private repo: string;
  private measurement?: { snp_measurement: string };
  private verificationResult?: VerificationResult;
  private verificationDocument?: VerificationDocument;

  constructor(options: ClientOptions = {}) {
    // Measurement takes precedence over repo
    if (options.measurement) {
      this.repo = '';
    } else {
      this.repo = options.repo || 'tinfoilsh/confidential-model-router';
    }

    // Ensure at least one verification method
    if (!options.measurement && !this.repo) {
      throw new Error('Must provide either measurement or repo parameter for verification.');
    }

    this.enclave = options.enclave || '';
    this.measurement = options.measurement;
  }

  async verify(): Promise<VerificationResult> {
    const steps: VerificationDocument['steps'] = {
      fetchDigest: { status: 'pending' },
      verifyCode: { status: 'pending' },
      verifyEnclave: { status: 'pending' },
      compareMeasurements: { status: 'pending' },
    };

    try {
      if (!this.enclave) {
        this.enclave = await getRouterAddress();
      }

      // Step 1: Verify Enclave
      let attestationDoc: AttestationDocument;
      let amdVerification;
      try {
        attestationDoc = await fetchAttestation(this.enclave);
        amdVerification = await verifyAmdAttestation(attestationDoc);
        steps.verifyEnclave = { status: 'success' };
      } catch (error) {
        steps.verifyEnclave = { status: 'failed', error: (error as Error).message };
        this.saveFailedVerificationDocument(steps);
        throw error;
      }

      let digest = 'pinned_no_digest';
      let codeMeasurements: AttestationMeasurement;

      if (this.measurement) {
        // Pinned measurement mode
        steps.fetchDigest = { status: 'success' };
        steps.verifyCode = { status: 'success' };

        const expectedSnpMeasurement = this.measurement.snp_measurement;
        if (!expectedSnpMeasurement) {
          const error = new FormatMismatchError('snp_measurement not found in provided measurement');
          steps.compareMeasurements = { status: 'failed', error: error.message };
          this.saveFailedVerificationDocument(steps);
          throw error;
        }

        const actualMeasurement = amdVerification.measurement.registers[0];

        if (actualMeasurement !== expectedSnpMeasurement) {
          const error = new MeasurementMismatchError(
            `SNP measurement mismatch: expected ${expectedSnpMeasurement}, got ${actualMeasurement}`
          );
          steps.compareMeasurements = { status: 'failed', error: error.message };
          this.saveFailedVerificationDocument(steps);
          throw error;
        }

        steps.compareMeasurements = { status: 'success' };

        codeMeasurements = {
          type: amdVerification.measurement.type,
          registers: [expectedSnpMeasurement]
        };
      } else {
        // Step 2: Fetch Digest
        try {
          digest = await fetchLatestDigest(this.repo);
          steps.fetchDigest = { status: 'success' };
        } catch (error) {
          steps.fetchDigest = { status: 'failed', error: (error as Error).message };
          this.saveFailedVerificationDocument(steps);
          throw error;
        }

        // Step 3: Verify Code
        try {
          const sigstoreBundle = await fetchAttestationBundle(this.repo, digest);
          codeMeasurements = await verifySigstoreAttestation(sigstoreBundle, digest, this.repo);
          steps.verifyCode = { status: 'success' };
        } catch (error) {
          steps.verifyCode = { status: 'failed', error: (error as Error).message };
          this.saveFailedVerificationDocument(steps);
          throw error;
        }

        // Step 4: Compare Measurements
        try {
          compareMeasurements(codeMeasurements, amdVerification.measurement);
          steps.compareMeasurements = { status: 'success' };
        } catch (error) {
          if (error instanceof FormatMismatchError) {
            steps.compareMeasurements = { status: 'failed', error: error.message };
          } else if (error instanceof MeasurementMismatchError) {
            steps.compareMeasurements = { status: 'failed', error: error.message };
          } else {
            steps.compareMeasurements = { status: 'failed', error: (error as Error).message };
          }
          this.saveFailedVerificationDocument(steps);
          throw error;
        }
      }

      // Build successful verification document
      this.verificationDocument = {
        configRepo: this.repo || 'pinned_no_repo',
        enclaveHost: this.enclave,
        releaseDigest: digest,
        codeMeasurement: codeMeasurements,
        enclaveMeasurement: amdVerification,
        tlsPublicKey: amdVerification.tlsPublicKeyFingerprint || '',
        hpkePublicKey: amdVerification.hpkePublicKey || '',
        codeFingerprint: await measurementFingerprint(codeMeasurements),
        enclaveFingerprint: await measurementFingerprint(amdVerification.measurement),
        selectedRouterEndpoint: this.enclave,
        securityVerified: true,
        steps
      };

      this.verificationResult = {
        publicKeyFingerprint: amdVerification.tlsPublicKeyFingerprint || '',
        hpkePublicKey: amdVerification.hpkePublicKey,
        digest,
        measurement: amdVerification.measurement,
      };

      return this.verificationResult;
    } catch (error) {
      // If we didn't already save a failed document, do it now
      if (!this.verificationDocument) {
        this.saveFailedVerificationDocument(steps);
      }
      throw error;
    }
  }

  private saveFailedVerificationDocument(steps: VerificationDocument['steps']): void {
    this.verificationDocument = {
      configRepo: this.repo || 'pinned_no_repo',
      enclaveHost: this.enclave || '',
      releaseDigest: '',
      codeMeasurement: { type: '', registers: [] },
      enclaveMeasurement: { measurement: { type: '', registers: [] } },
      tlsPublicKey: '',
      hpkePublicKey: '',
      codeFingerprint: '',
      enclaveFingerprint: '',
      selectedRouterEndpoint: this.enclave || '',
      securityVerified: false,
      steps
    };
  }

  getVerificationResult(): VerificationResult | undefined {
    return this.verificationResult;
  }

  getVerificationDocument(): VerificationDocument | undefined {
    return this.verificationDocument;
  }
}

export async function verifyEnclave(options: ClientOptions): Promise<VerificationResult> {
  const client = new SecureClient(options);
  return await client.verify();
}
