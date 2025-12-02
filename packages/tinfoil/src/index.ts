// Re-export the TinfoilAI class
export { TinfoilAI } from "./tinfoilai";
export { TinfoilAI as default } from "./tinfoilai";

// Export verifier
export * from "./verifier";
export * from "./ai-sdk-provider";
export * from "./config";
export { SecureClient} from "./secure-client";
export { UnverifiedClient } from "./unverified-client";
export { fetchRouter } from "./router";

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
