import type { Report } from './report.js';
import type { CertificateChain } from './cert-chain.js';
import { POLICY_RESERVED_1_BIT } from './constants.js';
import { KeyTypes, HashAlgorithms } from '@freedomofpress/crypto-browser';

/**
 * Verify the attestation report signature using VCEK's public key.
 *
 * @param vcekPublicKey - The VCEK public key
 * @param report - The attestation report
 * @returns True if signature is valid
 * @throws Error if validation fails
 */
async function verifyReportSignature(
  vcekPublicKey: CryptoKey,
  report: Report
): Promise<boolean> {
  // Validate Report Format
  if (report.version < 2) {
    throw new Error(`Report version is lower than 2: is ${report.version}`);
  }

  // Check reserved bit must be 1
  if (!(report.policy & (1n << BigInt(POLICY_RESERVED_1_BIT)))) {
    throw new Error(`policy[${POLICY_RESERVED_1_BIT}] is reserved, must be 1, got 0`);
  }

  // Check policy bits 63-26 must be zero
  if (report.policy >> 26n) {
    throw new Error('policy bits 63-26 must be zero');
  }  

  // Check signature algorithm must be ECDSA
  if (report.signatureAlgo !== 1) {
    throw new Error(`Unknown SignatureAlgo: ${report.signatureAlgo}`);
  }

  // Convert the raw signature to DER format
  // The signature in the report is in raw R||S format in AMD's little-endian format
  // Each component is 72 bytes (0x48) for P384
  const rBytes = reverseBytes(report.signature.slice(0, 0x48));
  const sBytes = reverseBytes(report.signature.slice(0x48, 0x90));

  const rBytesStripped = stripLeadingZeros(rBytes);
  const sBytesStripped = stripLeadingZeros(sBytes);

  const r = bytesToBigInt(rBytesStripped);
  const s = bytesToBigInt(sBytesStripped);

  const derSignature = encodeDerSignature(r, s);

  try {
    const isValid = await crypto.subtle.verify(
      { name: KeyTypes.Ecdsa, hash: HashAlgorithms.SHA384 },
      vcekPublicKey,
      derSignature.buffer as ArrayBuffer,
      report.signedData.buffer as ArrayBuffer
    );

    return isValid;
  } catch (e) {
    throw new Error(`Attestation signature verification failed: ${e}`);
  }
}

/**
 * Verify attestation report with the certificate chain.
 *
 * @param chain - The certificate chain (ARK > ASK > VCEK)
 * @param report - The attestation report
 * @returns True if verification succeeds
 */
export async function verifyAttestation(
  chain: CertificateChain,
  report: Report
): Promise<boolean> {
  // Verify certificate chain
  const isChainValid = await chain.verifyChain();
  if (!isChainValid) {
    return false;
  }

  // Verify report - get the CryptoKey from VCEK certificate
  const vcekPublicKey = await chain.vcekPublicKey;
  const isSignatureValid = await verifyReportSignature(vcekPublicKey, report);
  if (!isSignatureValid) {
    return false;
  }

  return true;
}

/**
 * Reverse the bytes in a bytes array.
 *
 * @param bytes - The bytes array to reverse
 * @returns The reversed bytes array
 */
function reverseBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array([...bytes].reverse());
}

/**
 * Strip leading zeros from a bytes array.
 *
 * @param bytes - The bytes array to strip
 * @returns The bytes array without leading zeros
 */
function stripLeadingZeros(bytes: Uint8Array): Uint8Array {
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) {
    start++;
  }
  if (start === bytes.length) {
    return new Uint8Array([0]);
  }
  return bytes.slice(start);
}

/**
 * Convert a bytes array to a bigint.
 *
 * @param bytes - The bytes array to convert
 * @returns The bigint
 */
function bytesToBigInt(bytes: Uint8Array): bigint {
  if (bytes.length === 0) {
    return 0n;
  }
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

/**
 * Encode the signature in DER format.
 *
 * @param r - The R component of the signature
 * @param s - The S component of the signature
 * @returns The signature in DER format
 */
function encodeDerSignature(r: bigint, s: bigint): Uint8Array {
  const rBytes = bigIntToMinimalBytes(r);
  const sBytes = bigIntToMinimalBytes(s);

  const rLength = rBytes.length;
  const sLength = sBytes.length;

  const totalLength = 2 + rLength + 2 + sLength;

  const der = new Uint8Array(2 + totalLength);
  let offset = 0;

  der[offset++] = 0x30;
  der[offset++] = totalLength;

  der[offset++] = 0x02;
  der[offset++] = rLength;
  der.set(rBytes, offset);
  offset += rLength;

  der[offset++] = 0x02;
  der[offset++] = sLength;
  der.set(sBytes, offset);

  return der;
}

/**
 * Convert a bigint to a minimal bytes array.
 *
 * @param value - The bigint to convert
 * @returns The bytes array
 */
function bigIntToMinimalBytes(value: bigint): Uint8Array {
  let hex = value.toString(16);
  if (hex.length % 2) {
    hex = '0' + hex;
  }

  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }

  if (bytes[0] & 0x80) {
    bytes.unshift(0x00);
  }

  return new Uint8Array(bytes);
}
