// Re-export the TinfoilAI class
export { TinfoilAI } from "./client";
export { TinfoilAI as default } from "./client";

// Export verifier and loader
export * from "./verifier";
export * from "./verification-runner";
export * from "./ai-sdk-provider";
export * from "./config";
export * from "tinfoil/secure-client";

// Re-export OpenAI utility types and classes that users might need
// Using public exports from the main OpenAI package instead of deep imports
export {
  type Uploadable,
  toFile,
  APIPromise,
  PagePromise,
  OpenAIError,
  APIError,
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  BadRequestError,
  AuthenticationError,
  InternalServerError,
  PermissionDeniedError,
  UnprocessableEntityError,
} from "openai";
