import { ReportSigner } from './constants.js';

export interface SignerInfo {
  signingKey: ReportSigner;
  maskChipKey: boolean;
  authorKeyEn: boolean;
}

export interface TCBParts {
  ucodeSpl: number;
  snpSpl: number;
  teeSpl: number;
  blSpl: number;
}

export interface SnpPlatformInfo {
  smtEnabled: boolean;
  tsmeEnabled: boolean;
  eccEnabled: boolean;
  raplDisabled: boolean;
  ciphertextHidingDramEnabled: boolean;
  aliasCheckComplete: boolean;
  tioEnabled: boolean;
}

export interface SnpPolicy {
  abiMinor: number;
  abiMajor: number;
  smt: boolean;
  migrateMa: boolean;
  debug: boolean;
  singleSocket: boolean;
  cxlAllowed: boolean;
  memAes256Xts: boolean;
  raplDis: boolean;
  ciphertextHidingDram: boolean;
  pageSwapDisabled: boolean;
}
