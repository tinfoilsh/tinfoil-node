import { PredicateType, AttestationMeasurement, AttestationError } from './types.js';

const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

// Fulcio OID for GitHub Workflow Ref (refs/heads/main, refs/tags/v1.0.0, etc.)
// See: https://github.com/sigstore/fulcio/blob/main/docs/oid-info.md
const EXTENSION_OID_GITHUB_WORKFLOW_REF = '1.3.6.1.4.1.57264.1.6';

export interface GitHubWorkflowRefPatternPolicy {
  type: 'GitHubWorkflowRefPattern';
  pattern: string;
}

export interface OIDCIssuerPolicy {
  type: 'OIDCIssuer';
  issuer: string;
}

export interface GitHubWorkflowRepositoryPolicy {
  type: 'GitHubWorkflowRepository';
  repository: string;
}

export type Policy = GitHubWorkflowRefPatternPolicy | OIDCIssuerPolicy | GitHubWorkflowRepositoryPolicy;


/**
 * Verifies the attested measurements of an enclave image against a trusted root (Sigstore)
 * and returns the measurement payload contained in the DSSE.
 *
 * @param bundleJson - The bundle JSON data
 * @param digest - The expected hex-encoded SHA256 digest of the DSSE payload
 * @param repo - The repository name
 * @returns The verified measurement data
 * @throws Error if verification fails or digests don't match
 */
export async function verifyAttestation(
  bundleJson: unknown,
  digest: string,
  repo: string
): Promise<AttestationMeasurement> {

  try {
    // Create verifier with the trusted root
    const { SigstoreVerifier } = await import('@freedomofpress/sigstore-browser');

    const verifier = new SigstoreVerifier();
    await verifier.loadSigstoreRootWithTUF();

    // Parse the bundle
    const bundle = bundleJson as any;

    // Create verification policy for GitHub Actions certificate identity
    const identity = `https://github.com/${repo}/.github/workflows/`;

    const digestBytes = Uint8Array.from(digest.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));

    /**
     * Core DSSE Verification
     *
     * This verifies the signature on the DSSE envelope, applies the
     * certificate identity policy, and checks Rekor log consistency.
     * It returns the verified payload from within the envelope.
     */
    await verifier.verifyArtifact(
      identity,
      OIDC_ISSUER,
      bundle,
      digestBytes,
      true
    );

    /**
     * Verify GitHub Workflow Ref Pattern
     *
     * Ensures attestations only come from tagged releases (refs/tags/.*).
     * This matches the Python implementation's GitHubWorkflowRefPattern policy.
     */
    const { X509Certificate } = await import('@freedomofpress/sigstore-browser');

    const certData = bundle.verificationMaterial?.certificate?.rawBytes ||
      bundle.verificationMaterial?.x509CertificateChain?.certificates?.[0]?.rawBytes;

    if (!certData) {
      throw new AttestationError('No certificate found in bundle');
    }

    const { base64ToUint8Array, Uint8ArrayToString } = await import('@freedomofpress/crypto-browser');
    const signingCert = X509Certificate.parse(base64ToUint8Array(certData));

    const workflowRefExt = signingCert.extension(EXTENSION_OID_GITHUB_WORKFLOW_REF);
    if (!workflowRefExt) {
      throw new AttestationError(
        `Certificate does not contain GitHubWorkflowRef (${EXTENSION_OID_GITHUB_WORKFLOW_REF}) extension`
      );
    }

    const workflowRef = Uint8ArrayToString(workflowRefExt.value);
    const tagPattern = /^refs\/tags\/.+$/;
    if (!tagPattern.test(workflowRef)) {
      throw new AttestationError(
        `Certificate's GitHubWorkflowRef does not match required pattern ` +
        `(got '${workflowRef}', expected pattern 'refs/tags/.*')`
      );
    }

    /**
     * Process the Verified Payload
     */
    if (!bundle.dsseEnvelope) {
      throw new Error('Bundle does not contain a DSSE envelope');
    }

    const payloadBytes = Uint8Array.from(atob(bundle.dsseEnvelope.payload), c => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

    const payloadType = bundle.dsseEnvelope.payloadType;
    if (payloadType !== 'application/vnd.in-toto+json') {
      throw new Error(`Unsupported payload type: ${payloadType}. Only supports In-toto.`);
    }

    const predicateType = payload.predicateType as PredicateType;
    const predicateFields = payload.predicate;

    /**
     * Manual Payload Digest Verification
     *
     * Now, verify that the provided external digest matches the
     * actual digest in the payload returned from the verified envelope.
     */
    if (digest !== payload.subject[0].digest.sha256) {
      throw new Error(
        `Provided digest does not match verified DSSE payload digest. Expected: ${digest}, Got: ${payload.subject[0].digest.sha256}`
      );
    }

    // Convert predicate type to measurement type
    let registers: string[];

    if (!predicateFields) {
      throw new Error('Payload does not contain predicate');
    }

    if (predicateType === PredicateType.SevGuestV1) {
      if (!predicateFields.measurement) {
        throw new Error('SEV Guest V1 predicate does not contain measurement');
      }
      registers = [predicateFields.measurement];
    } else if (predicateType === PredicateType.SnpTdxMultiplatformV1) {
      if (!predicateFields.snp_measurement) {
        throw new Error('SNP TDX Multiplatform V1 predicate does not contain snp_measurement');
      }
      registers = [predicateFields.snp_measurement];
    } else {
      throw new Error(`Unsupported predicate type: ${predicateType}`);
    }

    return {
      type: predicateType,
      registers,
    };

  } catch (e) {
    throw new Error(`Attestation processing failed: ${e}`);
  }
}
