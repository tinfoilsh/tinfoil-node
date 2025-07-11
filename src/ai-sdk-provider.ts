import { X509Certificate, createHash } from 'node:crypto';
import tls, { checkServerIdentity as tlsCheckServerIdentity } from 'node:tls';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { Agent, buildConnector, RequestInit, fetch as undiciFetch } from 'undici';
import { TINFOIL_CONFIG } from './config';
import { SecureClient } from './secure-client';

/**
 * Creates an AI SDK provider with the specified API key.
 * This provider is compatible with Vercel's AI SDK and includes
 * automatic enclave verification and certificate fingerprint validation.
 *
 * @param apiKey - The API key for the Tinfoil API
 * @returns A TinfoilAI-compatible provider for use with Vercel AI SDK
 * @throws {Error} If enclave verification fails or certificate fingerprint doesn't match
 *
 * @example
 * ```typescript
 * import { createTinfoilAI } from 'tinfoil';
 * import { streamText } from 'ai';
 *
 * const tinfoil = await createTinfoilAI('your-api-key');
 *
 * const result = await streamText({
 *   model: tinfoil('gpt-3.5-turbo'),
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * ```
 */
export async function createTinfoilAI(
  apiKey: string
): Promise<ReturnType<typeof createOpenAICompatible>> {
  const sc = new SecureClient();
  const groundTruth = await sc.verify();

  const connect = buildConnector({
    checkServerIdentity: (host: string, cert: tls.PeerCertificate): Error | undefined => {
      if (!cert.pubkey) {
        throw new Error('No public key available in certificate');
      }
      const x509 = new X509Certificate(cert.raw);
      const publicKeyDer = x509.publicKey.export({
        type: 'spki',
        format: 'der',
      });
      const pubKeyFP = createHash('sha256').update(publicKeyDer).digest('hex');
      if (pubKeyFP !== groundTruth.publicKeyFP) {
        throw new Error(
          `Certificate public key fingerprint mismatch. Expected: ${groundTruth.publicKeyFP}, Got: ${pubKeyFP}`
        );
      }

      return tlsCheckServerIdentity(host, cert);
    },
  });

  const agent = new Agent({ connect });

  return createOpenAICompatible({
    name: 'tinfoil',
    baseURL: TINFOIL_CONFIG.INFERENCE_BASE_URL.replace(/\/$/, ''),
    apiKey: apiKey,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!init) {
        init = {};
      }
      init.dispatcher = agent;
      // Cast is needed due to type mismatch between different fetch implementations
      return await undiciFetch(input as Parameters<typeof undiciFetch>[0], init);
    }) as unknown as typeof fetch,
  });
}
