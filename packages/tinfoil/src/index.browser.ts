// Browser-safe entry point: avoids Node built-ins
export { TinfoilAI } from "./tinfoilai";
export { TinfoilAI as default } from "./tinfoilai";

export * from "./verifier";
export * from "./ai-sdk-provider";
export * from "./config";
export { SecureClient } from "./secure-client";
export { UnverifiedClient } from "./unverified-client";