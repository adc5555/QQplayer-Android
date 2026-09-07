export enum CoreErrorCode {
  NETWORK = "NETWORK",
  TIMEOUT = "TIMEOUT",
  HTTP = "HTTP",
  INVALID_RESPONSE = "INVALID_RESPONSE",
  RATE_LIMITED = "RATE_LIMITED",
  SIGNATURE_REQUIRED = "SIGNATURE_REQUIRED",
  AUTH_REQUIRED = "AUTH_REQUIRED",
  NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
  NO_PLAYABLE_URL = "NO_PLAYABLE_URL",
  NO_PERMISSION = "NO_PERMISSION",
  NOT_FOUND = "NOT_FOUND",
  DOWNLOAD_FAILED = "DOWNLOAD_FAILED",
  FILE_SYSTEM = "FILE_SYSTEM",
  INVALID_ARGUMENT = "INVALID_ARGUMENT"
}

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly statusCode?: number;
  readonly data?: unknown;

  constructor(code: CoreErrorCode, message: string, options?: { cause?: unknown; statusCode?: number; data?: unknown }) {
    super(message, options ? { cause: options.cause } : undefined);
    this.name = "CoreError";
    this.code = code;
    this.statusCode = options?.statusCode;
    this.data = options?.data;
  }
}

export function isCoreError(value: unknown): value is CoreError {
  return value instanceof CoreError;
}
