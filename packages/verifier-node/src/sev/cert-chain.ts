import crypto from 'crypto';
import type { Report } from './report.js';
import type { TCBParts } from './types.js';
import { ReportSigner } from './constants.js';
import { ARK_CERT, ASK_CERT } from './certs.js';
import { tcbFromInt, bytesToHex } from './utils.js';

// SEV-SNP VCEK OID definitions
const SnpOid = {
  STRUCT_VERSION: '1.3.6.1.4.1.3704.1.1',
  PRODUCT_NAME: '1.3.6.1.4.1.3704.1.2',
  BL_SPL: '1.3.6.1.4.1.3704.1.3.1',
  TEE_SPL: '1.3.6.1.4.1.3704.1.3.2',
  SNP_SPL: '1.3.6.1.4.1.3704.1.3.3',
  SPL4: '1.3.6.1.4.1.3704.1.3.4',
  SPL5: '1.3.6.1.4.1.3704.1.3.5',
  SPL6: '1.3.6.1.4.1.3704.1.3.6',
  SPL7: '1.3.6.1.4.1.3704.1.3.7',
  UCODE: '1.3.6.1.4.1.3704.1.3.8',
  HWID: '1.3.6.1.4.1.3704.1.4',
  CSP_ID: '1.3.6.1.4.1.3704.1.5',
};

// OIDs for signature and key algorithms
const OID_RSASSA_PSS = '1.2.840.113549.1.1.10';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';
const OID_SECP384R1 = '1.3.132.0.34';

export class CertificateChain {
  constructor(
    public ark: crypto.X509Certificate,
    public ask: crypto.X509Certificate,
    public vcek: crypto.X509Certificate
  ) {}

  static async fromReport(report: Report): Promise<CertificateChain> {
    if (report.productName !== 'Genoa') {
      throw new Error('This implementation only supports Genoa processors');
    }

    if (report.signerInfoParsed.signingKey !== ReportSigner.VcekReportSigner) {
      throw new Error('This implementation only supports VCEK signed reports');
    }

    const ark = new crypto.X509Certificate(ARK_CERT);
    const ask = new crypto.X509Certificate(ASK_CERT);

    // No caching for Node.js - always fetch fresh
    const vcekUrl = buildVCEKUrl(report.productName, report.chipId, report.reportedTcb);
    const vcekDer = await fetchVCEK(vcekUrl);
    const vcek = new crypto.X509Certificate(vcekDer);

    return new CertificateChain(ark, ask, vcek);
  }

  verifyChain(): boolean {
    try {
      // Validate certificate formats
      this.validateArkFormat();
      this.validateAskFormat();
      this.validateVcekFormat();

      // Validate certificate validity periods
      const now = new Date();
      if (!this.isValidForDate(this.ark, now)) {
        throw new Error('ARK certificate is not valid for current date');
      }
      if (!this.isValidForDate(this.ask, now)) {
        throw new Error('ASK certificate is not valid for current date');
      }
      if (!this.isValidForDate(this.vcek, now)) {
        throw new Error('VCEK certificate is not valid for current date');
      }

      // Verify signature chain: ARK self-signed, ARK signs ASK, ASK signs VCEK
      const arkSelfSigned = this.ark.verify(this.ark.publicKey);
      if (!arkSelfSigned) {
        throw new Error('ARK certificate is not self-signed');
      }

      const askSignedByArk = this.ask.verify(this.ark.publicKey);
      if (!askSignedByArk) {
        throw new Error('ASK certificate is not signed by ARK');
      }

      const vcekSignedByAsk = this.vcek.verify(this.ask.publicKey);
      if (!vcekSignedByAsk) {
        throw new Error('VCEK certificate is not signed by ASK');
      }

      return true;
    } catch (e) {
      throw new Error(`Certificate chain verification failed: ${e}`);
    }
  }

  validateVcekTcb(tcb: TCBParts): void {
    // Validate BL_SPL
    const blSpl = this.getExtensionInteger(SnpOid.BL_SPL);
    if (blSpl === undefined) {
      throw new Error('missing BL_SPL extension for VCEK certificate');
    }
    if (blSpl !== tcb.blSpl) {
      throw new Error(`BL_SPL extension in VCEK certificate does not match tcb.blSpl: ${blSpl} != ${tcb.blSpl}`);
    }

    // Validate TEE_SPL
    const teeSpl = this.getExtensionInteger(SnpOid.TEE_SPL);
    if (teeSpl === undefined) {
      throw new Error('missing TEE_SPL extension for VCEK certificate');
    }
    if (teeSpl !== tcb.teeSpl) {
      throw new Error(`TEE_SPL extension in VCEK certificate does not match tcb.teeSpl: ${teeSpl} != ${tcb.teeSpl}`);
    }

    // Validate SNP_SPL
    const snpSpl = this.getExtensionInteger(SnpOid.SNP_SPL);
    if (snpSpl === undefined) {
      throw new Error('missing SNP_SPL extension for VCEK certificate');
    }
    if (snpSpl !== tcb.snpSpl) {
      throw new Error(`SNP_SPL extension in VCEK certificate does not match tcb.snpSpl: ${snpSpl} != ${tcb.snpSpl}`);
    }

    // Validate UCODE
    const ucodeSpl = this.getExtensionInteger(SnpOid.UCODE);
    if (ucodeSpl === undefined) {
      throw new Error('missing UCODE extension for VCEK certificate');
    }
    if (ucodeSpl !== tcb.ucodeSpl) {
      throw new Error(`UCODE extension in VCEK certificate does not match tcb.ucodeSpl: ${ucodeSpl} != ${tcb.ucodeSpl}`);
    }
  }

  validateVcekHwid(chipId: Uint8Array): void {
    const hwidValue = this.getExtensionValue(SnpOid.HWID);
    if (!hwidValue) {
      throw new Error('missing HWID extension for VCEK certificate');
    }

    if (!uint8ArrayEqual(hwidValue, chipId)) {
      throw new Error(`HWID extension in VCEK certificate does not match chip_id: ${bytesToHex(hwidValue)} != ${bytesToHex(chipId)}`);
    }
  }

  private validateArkFormat(): void {
    // Validate AMD location for issuer and subject
    if (!this.validateAmdLocation(this.ark.issuer)) {
      throw new Error('ARK certificate issuer is not a valid AMD location');
    }
    if (!this.validateAmdLocation(this.ark.subject)) {
      throw new Error('ARK certificate subject is not a valid AMD location');
    }

    // Check common name
    const cn = this.extractCN(this.ark.subject);
    if (cn !== 'ARK-Genoa') {
      throw new Error(`ARK certificate subject common name is not ARK-Genoa but ${cn}`);
    }
  }

  private validateAskFormat(): void {
    // Validate AMD location
    if (!this.validateAmdLocation(this.ask.issuer)) {
      throw new Error('ASK certificate issuer is not a valid AMD location');
    }
    if (!this.validateAmdLocation(this.ask.subject)) {
      throw new Error('ASK certificate subject is not a valid AMD location');
    }

    // Check common name is exactly "SEV-Genoa" (ASK cert uses SEV-Genoa)
    const cn = this.extractCN(this.ask.subject);
    if (cn !== 'SEV-Genoa') {
      throw new Error(`ASK certificate subject common name is not SEV-Genoa but ${cn}`);
    }
  }

  private validateVcekFormat(): void {
    // Validate AMD location
    if (!this.validateAmdLocation(this.vcek.issuer)) {
      throw new Error('VCEK certificate issuer is not a valid AMD location');
    }
    if (!this.validateAmdLocation(this.vcek.subject)) {
      throw new Error('VCEK certificate subject is not a valid AMD location');
    }

    // Validate common name
    const cn = this.extractCN(this.vcek.subject);
    if (cn !== 'SEV-VCEK') {
      throw new Error(`VCEK certificate subject common name is not SEV-VCEK but ${cn}`);
    }

    // Validate signature algorithm (must be RSASSA-PSS for VCEK signed by ASK)
    // signatureAlgorithmOid is available in Node.js 20+ but not in older @types/node
    const sigAlgOid = (this.vcek as crypto.X509Certificate & { signatureAlgorithmOid: string }).signatureAlgorithmOid;
    if (sigAlgOid !== OID_RSASSA_PSS) {
      throw new Error(`VCEK certificate signature algorithm is not RSASSA-PSS but OID ${sigAlgOid}`);
    }

    // Validate public key algorithm (must be ECDSA with P-384)
    const keyType = this.vcek.publicKey.asymmetricKeyType;
    if (keyType !== 'ec') {
      throw new Error(`VCEK certificate public key type is not EC but ${keyType}`);
    }

    // CSP_ID must NOT be present (critical for VCEK vs VLEK distinction)
    const cspId = this.getExtensionValue(SnpOid.CSP_ID);
    if (cspId) {
      throw new Error(`unexpected CSP_ID in VCEK certificate: ${bytesToHex(cspId)}`);
    }

    // HWID must be present and correct length
    const hwid = this.getExtensionValue(SnpOid.HWID);
    if (!hwid || hwid.length !== 64) {
      throw new Error('missing or invalid HWID extension for VCEK certificate');
    }

    // Product name validation
    const productName = this.getExtensionValue(SnpOid.PRODUCT_NAME);
    if (!productName) {
      throw new Error('missing PRODUCT_NAME extension for VCEK certificate');
    }
    // The extension value should be DER-encoded IA5String: tag 0x16, length 0x05, value "Genoa"
    const expectedProductName = new Uint8Array([0x16, 0x05, 0x47, 0x65, 0x6e, 0x6f, 0x61]);
    if (!uint8ArrayEqual(productName, expectedProductName)) {
      throw new Error(`unexpected PRODUCT_NAME in VCEK certificate: ${bytesToHex(productName)}`);
    }
  }

  private validateAmdLocation(dn: string): boolean {
    // Node.js X509Certificate returns DN as a string like:
    // "C=US\nST=CA\nL=Santa Clara\nO=Advanced Micro Devices\nOU=Engineering\nCN=..."
    const parts = this.parseDN(dn);
    return (
      parts.get('C') === 'US' &&
      parts.get('L') === 'Santa Clara' &&
      parts.get('ST') === 'CA' &&
      parts.get('O') === 'Advanced Micro Devices' &&
      parts.get('OU') === 'Engineering'
    );
  }

  private parseDN(dn: string): Map<string, string> {
    const parts = new Map<string, string>();
    // DN format: "C=US\nST=CA\nL=Santa Clara\n..."
    const lines = dn.split('\n');
    for (const line of lines) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.slice(0, idx);
        const value = line.slice(idx + 1);
        parts.set(key, value);
      }
    }
    return parts;
  }

  private extractCN(dn: string): string | undefined {
    return this.parseDN(dn).get('CN');
  }

  private isValidForDate(cert: crypto.X509Certificate, date: Date): boolean {
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);
    return date >= notBefore && date <= notAfter;
  }

  private getExtensionValue(oid: string): Uint8Array | undefined {
    // Node.js doesn't have a direct API to get extension by OID
    // We need to parse the raw DER and extract extensions
    const raw = this.vcek.raw;
    return extractExtensionValue(raw, oid);
  }

  private getExtensionInteger(oid: string): number | undefined {
    const value = this.getExtensionValue(oid);
    if (!value) return undefined;

    // Parse DER INTEGER from the extension value
    // The value is wrapped in OCTET STRING containing a DER INTEGER
    return decodeExtensionInteger(value);
  }

  get vcekPublicKey(): crypto.KeyObject {
    return this.vcek.publicKey;
  }
}

function buildVCEKUrl(productName: string, chipId: Uint8Array, reportedTcb: bigint): string {
  const tcb = tcbFromInt(reportedTcb);
  const chipIdHex = bytesToHex(chipId);
  const baseUrl = 'https://kds-proxy.tinfoil.sh/vcek/v1';

  return `${baseUrl}/${productName}/${chipIdHex}?blSPL=${tcb.blSpl}&teeSPL=${tcb.teeSpl}&snpSPL=${tcb.snpSpl}&ucodeSPL=${tcb.ucodeSpl}`;
}

async function fetchVCEK(url: string): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch VCEK certificate: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

function uint8ArrayEqual(a: Uint8Array, b: Uint8Array): boolean {
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Extract an X.509 extension value by OID from raw DER certificate.
 * This is a simplified parser that finds the extension by OID.
 */
function extractExtensionValue(certDer: Buffer, targetOid: string): Uint8Array | undefined {
  // Convert OID string to DER encoded form
  const oidDer = encodeOID(targetOid);

  // Search for the OID in the certificate
  let pos = 0;
  while (pos < certDer.length - oidDer.length) {
    if (bufferStartsWith(certDer, oidDer, pos)) {
      // Found OID, now parse the extension structure
      // Extension ::= SEQUENCE { extnID OBJECT IDENTIFIER, critical BOOLEAN DEFAULT FALSE, extnValue OCTET STRING }
      // We found extnID, need to skip to extnValue
      const afterOid = pos + oidDer.length;

      // Skip optional critical BOOLEAN
      let valuePos = afterOid;
      if (certDer[valuePos] === 0x01) {
        // BOOLEAN tag
        valuePos += 2 + certDer[valuePos + 1]; // Skip tag + length + value
      }

      // Next should be OCTET STRING (tag 0x04)
      if (certDer[valuePos] === 0x04) {
        const { length, headerLen } = readDerLength(certDer, valuePos + 1);
        const valueStart = valuePos + 1 + headerLen;
        return new Uint8Array(certDer.subarray(valueStart, valueStart + length));
      }
    }
    pos++;
  }

  return undefined;
}

/**
 * Encode an OID string (like "1.3.6.1.4.1.3704.1.3.1") to DER format.
 */
function encodeOID(oid: string): Uint8Array {
  const parts = oid.split('.').map(Number);
  if (parts.length < 2) throw new Error('Invalid OID');

  // First two components are encoded as: first * 40 + second
  const bytes: number[] = [];
  bytes.push(parts[0] * 40 + parts[1]);

  // Remaining components use variable-length encoding
  for (let i = 2; i < parts.length; i++) {
    let val = parts[i];
    if (val === 0) {
      bytes.push(0);
    } else {
      const encoded: number[] = [];
      while (val > 0) {
        encoded.unshift(val & 0x7f);
        val >>= 7;
      }
      // Set high bit on all but the last byte
      for (let j = 0; j < encoded.length - 1; j++) {
        encoded[j] |= 0x80;
      }
      bytes.push(...encoded);
    }
  }

  // Prepend tag (0x06) and length
  const result = new Uint8Array(2 + bytes.length);
  result[0] = 0x06; // OBJECT IDENTIFIER tag
  result[1] = bytes.length;
  result.set(bytes, 2);

  return result;
}

function bufferStartsWith(buf: Buffer, prefix: Uint8Array, offset: number): boolean {
  if (offset + prefix.length > buf.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buf[offset + i] !== prefix[i]) return false;
  }
  return true;
}

function readDerLength(buf: Buffer, pos: number): { length: number; headerLen: number } {
  const firstByte = buf[pos];
  if (firstByte < 0x80) {
    return { length: firstByte, headerLen: 1 };
  }
  const numBytes = firstByte & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[pos + 1 + i];
  }
  return { length, headerLen: 1 + numBytes };
}

/**
 * Decode a DER INTEGER from an extension OCTET STRING value.
 * The value is the raw bytes inside the OCTET STRING.
 */
function decodeExtensionInteger(value: Uint8Array): number {
  // Extension value contains a DER INTEGER: 02 <len> <value bytes>
  if (value[0] !== 0x02) {
    throw new Error('Expected DER INTEGER');
  }
  const { length, headerLen } = readDerLengthUint8(value, 1);
  let result = 0;
  for (let i = 0; i < length; i++) {
    result = (result << 8) | value[1 + headerLen + i];
  }
  return result;
}

function readDerLengthUint8(buf: Uint8Array, pos: number): { length: number; headerLen: number } {
  const firstByte = buf[pos];
  if (firstByte < 0x80) {
    return { length: firstByte, headerLen: 1 };
  }
  const numBytes = firstByte & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | buf[pos + 1 + i];
  }
  return { length, headerLen: 1 + numBytes };
}
