import { normalizeEncryptedBodyRequestArgs } from "./encrypted-body-fetch";
import { EhbpRequestBuilder } from "./ehbp-request-builder";

type ForwardingOptions = {
  /** Header name carrying the absolute URL to forward to */
  forwardHeaderName?: string;
  /** Header name carrying the desired HTTP method for the enclave destination */
  forwardMethodHeaderName?: string;
  /** Proxy path to send all requests to (default "/") */
  proxyPath?: string;
  /** If true, always send POST to proxy (default: true) */
  alwaysPost?: boolean;
};

/**
 * Creates a fetch function that sends requests to `proxyURL` while
 * encrypting the body under the HPKE public key fetched from `inferenceBaseURL`.
 *
 * This does not use the EHBP transport for sending; it builds an encrypted
 * Request with EHBP headers and issues a normal fetch to the proxy.
 */
export function createForwardingEncryptedFetch(
  inferenceBaseURL: string,
  proxyURL: string,
  options?: ForwardingOptions,
): typeof fetch {
  const builder = new EhbpRequestBuilder(inferenceBaseURL);
  const forwardHeader = options?.forwardHeaderName ?? "Ehbp-Forward-To";
  const forwardMethodHeader = options?.forwardMethodHeaderName ?? "Ehbp-Forward-Method";
  const proxyPath = options?.proxyPath ?? "/";
  const alwaysPost = options?.alwaysPost !== false; // default true

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const normalized = normalizeEncryptedBodyRequestArgs(input, init);
    // Compute destination path+query, then resolve against the inference base URL
    let forwardToUrl: string;
    try {
      const maybeAbs = new URL(normalized.url);
      // If absolute, rewrite origin to inference base, keep path+query
      const destination = new URL(maybeAbs.pathname + maybeAbs.search, inferenceBaseURL);
      forwardToUrl = destination.toString();
    } catch {
      // Not absolute; resolve relative to inference base directly
      forwardToUrl = new URL(normalized.url, inferenceBaseURL).toString();
    }
    // Build EHBP-encrypted request for that destination
    const encryptedForDest = await builder.build(forwardToUrl, normalized.init);

    // Repackage to send to proxy, preserving EHBP headers/body, adding forwarding header
    const proxyUrl = new URL(proxyPath, proxyURL).toString();
    const headers = new Headers(encryptedForDest.headers);
    headers.set(forwardHeader, forwardToUrl);
    headers.set(forwardMethodHeader, encryptedForDest.method || (normalized.init?.method || "GET"));
    const body = await encryptedForDest.arrayBuffer();
    const proxyRequest = new Request(proxyUrl, {
      method: alwaysPost ? "POST" : encryptedForDest.method,
      headers,
      body,
      // Node fetch requires duplex when streaming request body; safe for Node env
      duplex: "half",
    } as RequestInit);
    return fetch(proxyRequest);
  }) as typeof fetch;
}
