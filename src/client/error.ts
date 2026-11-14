export class HasznoApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /** Machine-readable error code from the API error envelope (e.g. "unauthenticated", "not_found"). */
    public readonly code?: string,
    /** Request-ID from the X-Request-Id / requestId response field — useful for support. */
    public readonly requestId?: string,
  ) {
    super(message)
    this.name = 'HasznoApiError'
  }
}
