import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { TINFOIL_CONFIG } from "./config";
import { SecureClient } from "tinfoil/secure-client";

interface CreateTinfoilAIOptions {
  baseURL?: string;
  hpkeKeyURL?: string;
  configRepo?: string;
}

export async function createTinfoilAI(apiKey: string, options: CreateTinfoilAIOptions = {}) {
  const baseURL = options.baseURL || TINFOIL_CONFIG.INFERENCE_BASE_URL;
  const hpkeKeyURL = options.hpkeKeyURL || TINFOIL_CONFIG.HPKE_KEY_URL;
  const configRepo = options.configRepo || TINFOIL_CONFIG.INFERENCE_PROXY_REPO;

  const secureClient = new SecureClient({
    baseURL,
    hpkeKeyURL,
    configRepo,
  });

  await secureClient.ready();

  return createOpenAICompatible({
    name: "tinfoil",
    baseURL: baseURL.replace(/\/$/, ""),
    apiKey: apiKey,
    fetch: secureClient.fetch,
  });
}
