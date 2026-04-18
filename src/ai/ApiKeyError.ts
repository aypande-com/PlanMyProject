export class ApiKeyError extends Error {
  constructor(
    public readonly provider: "claude" | "openai",
    message: string
  ) {
    super(message);
    this.name = "ApiKeyError";
  }
}

export function isAuthStatus(status: number): boolean {
  return status === 401 || status === 403;
}
