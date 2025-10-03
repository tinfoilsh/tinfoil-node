// Browser-safe entry point: avoids Node built-ins
export { TinfoilAI } from "./client.browser";
export { TinfoilAI as default } from "./client.browser";

export * from "./verifier";
export * from "./verification-runner";
export * from "./ai-sdk-provider";
export * from "./config";
export * from "./secure-client.browser";
