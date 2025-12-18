// Browser-safe entry point: avoids Node built-ins
export { TinfoilAI } from "./tinfoil-ai.browser.js";
export { TinfoilAI as default } from "./tinfoil-ai.browser.js";

export * from "./verifier.js";
export * from "./ai-sdk-provider.browser.js";
export * from "./config.js";
export { SecureClient } from "./secure-client.browser.js";
export { UnverifiedClient } from "./unverified-client.js";