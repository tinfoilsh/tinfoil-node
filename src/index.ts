// Re-export the TinfoilAI class
export { TinfoilAI } from './client';
export { TinfoilAI as default } from './client';

// Export secure client and config
export * from './secure-client';
export * from './ai-sdk-provider';
export * from './config';

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
} from 'openai';
