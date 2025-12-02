/**
 * Configuration constants for the Tinfoil Node SDK
 */
export const TINFOIL_CONFIG = {
  /**
   * The GitHub repository for code attestation verification
   */
  INFERENCE_PROXY_REPO: "tinfoilsh/confidential-model-router",

  /**
   * The ATC (Attestation and Trust Center) API URL for fetching available routers
   */
  ATC_API_URL: "https://atc.tinfoil.sh/routers",
} as const;
