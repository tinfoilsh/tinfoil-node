import { getTrustedRoot } from '@sigstore/tuf';
import { Verifier, toTrustMaterial, toSignedEntity } from '@sigstore/verify';
import { bundleFromJSON, isBundleWithDsseEnvelope } from '@sigstore/bundle';
import type { Bundle } from '@sigstore/bundle';
import type { VerificationPolicy, Signer } from '@sigstore/verify';
import { PredicateType, AttestationMeasurement } from './types.js';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

/**
 * Custom verification policy that checks GitHub Actions certificate identity
 */
class GitHubActionsPolicy implements VerificationPolicy {
  private repo: string;
  private workflowRefPattern: RegExp;

  constructor(repo: string) {
    this.repo = repo;
    this.workflowRefPattern = /^refs\/tags\//;
  }

  get subjectAlternativeName(): string {
    return `https://github.com/${this.repo}/`;
  }

  get extensions(): { issuer: string } {
    return {
      issuer: GITHUB_OIDC_ISSUER,
    };
  }
}

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
    // Get Sigstore trusted root via TUF
    const trustedRoot = await getTrustedRoot();
    const trustMaterial = toTrustMaterial(trustedRoot);

    // Parse the bundle
    const bundle: Bundle = bundleFromJSON(bundleJson);

    if (!isBundleWithDsseEnvelope(bundle)) {
      throw new Error('Bundle does not contain a DSSE envelope');
    }

    // Create the signed entity for verification
    const signedEntity = toSignedEntity(bundle);

    // Create verification policy for GitHub Actions
    const policy = new GitHubActionsPolicy(repo);

    // Verify the bundle
    const verifier = new Verifier(trustMaterial);
    const signer: Signer = verifier.verify(signedEntity, policy);

    // Extract and decode the payload from the DSSE envelope
    const envelope = bundle.content.dsseEnvelope;
    const payloadBytes = envelope.payload;
    const payloadType = envelope.payloadType;

    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));

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
