/**
 * Configuration constants for the Tinfoil Node SDK.
 * These values define the secure inference endpoints and repositories.
 *
 * @constant
 */
export const TINFOIL_CONFIG = {
  /**
   * The full base URL for the inference API
   */
  INFERENCE_BASE_URL: 'https://inference.tinfoil.sh/v1/',

  /**
   * The GitHub repository for the confidential inference proxy
   */
  INFERENCE_PROXY_REPO: 'tinfoilsh/confidential-inference-proxy',
} as const;
