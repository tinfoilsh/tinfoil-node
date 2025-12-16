// Browser-safe entry point: avoids Node built-ins
export { TinfoilAI } from "./tinfoil-ai.js";
export { TinfoilAI as default } from "./tinfoil-ai.js";

export * from "./verifier.js";
export * from "./ai-sdk-provider.js";
export * from "./config.js";
export { SecureClient } from "./secure-client.js";
export { UnverifiedClient } from "./unverified-client.js";