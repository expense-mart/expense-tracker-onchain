export type ProcessingErrorCode =
  | "INVALID_WALLET_ADDRESS"
  | "INVALID_PAYMENT"
  | "INVALID_REQUEST"
  | "UNSUPPORTED_OPERATION"
  | "CONFLICTING_RECORD";

/** Safe for API responses: never includes input payloads or schema values. */
export class ProcessingError extends Error {
  constructor(
    public readonly code: ProcessingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProcessingError";
  }
}
