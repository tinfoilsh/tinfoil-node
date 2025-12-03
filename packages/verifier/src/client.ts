import { verifyAttestation as verifyAmdAttestation, fetchAttestation } from './attestation.js';
import { fetchLatestDigest, fetchAttestationBundle } from './github.js';
import { verifyAttestation as verifySigstoreAttestation } from './sigstore.js';
import { AttestationDocument, AttestationMeasurement, AttestationResponse, VerificationDocument, compareMeasurements, FormatMismatchError, MeasurementMismatchError, measurementFingerprint } from './types.js';
import { getRouterAddress } from './router.js';

const DEFAULT_CONFIG_REPO = 'tinfoilsh/confidential-model-router';

export interface VerifierOptions {
  serverURL: string;
  configRepo?: string;
}

export class Verifier {
  private enclave: string;
  private configRepo: string;
  private verificationDocument?: VerificationDocument;

  constructor(options: VerifierOptions) {
    if (!options.serverURL) {
      throw new Error("serverURL is required for Verifier");
    }
    this.enclave = new URL(options.serverURL).hostname;
    this.configRepo = options.configRepo || DEFAULT_CONFIG_REPO;
  }

  async verify(): Promise<AttestationResponse> {
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
      let amdVerification: AttestationResponse;
      try {
        attestationDoc = await fetchAttestation(this.enclave);
        amdVerification = await verifyAmdAttestation(attestationDoc);
        steps.verifyEnclave = { status: 'success' };
      } catch (error) {
        steps.verifyEnclave = { status: 'failed', error: (error as Error).message };
        this.saveFailedVerificationDocument(steps);
        throw error;
      }

      // Step 2: Fetch Digest
      let digest: string;
      try {
        digest = await fetchLatestDigest(this.configRepo);
        steps.fetchDigest = { status: 'success' };
      } catch (error) {
        steps.fetchDigest = { status: 'failed', error: (error as Error).message };
        this.saveFailedVerificationDocument(steps);
        throw error;
      }

      // Step 3: Verify Code
      let codeMeasurements: AttestationMeasurement;
      try {
        const sigstoreBundle = await fetchAttestationBundle(this.configRepo, digest);
        codeMeasurements = await verifySigstoreAttestation(sigstoreBundle, digest, this.configRepo);
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

      // Build successful verification document
      this.verificationDocument = {
        configRepo: this.configRepo,
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

      return amdVerification;
    } catch (error) {
      if (!this.verificationDocument) {
        this.saveFailedVerificationDocument(steps);
      }
      throw error;
    }
  }

  private saveFailedVerificationDocument(steps: VerificationDocument['steps']): void {
    this.verificationDocument = {
      configRepo: this.configRepo,
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

  getVerificationDocument(): VerificationDocument | undefined {
    return this.verificationDocument;
  }
}
