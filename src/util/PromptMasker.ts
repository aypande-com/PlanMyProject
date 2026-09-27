export interface PromptMaskerOptions {
  maskEmails: boolean;
  maskIpAddresses: boolean;
}

const DEFAULT_OPTIONS: PromptMaskerOptions = {
  maskEmails: false,
  maskIpAddresses: false
};

const BASE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-+/=]+\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{20,}\b/g,
  // Fine-grained GitHub PAT (distinct prefix from the classic ghp_ above).
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // GitLab personal access token.
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g,
  // AWS access key ID prefixes (long-lived, session/STS, and role variants).
  /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|ANPA|ANVA)[0-9A-Z]{16}\b/g,
  // GCP API key.
  /\bAIza[0-9A-Za-z\-_]{35}\b/g,
  // Slack tokens (bot/user/app/refresh/workspace).
  /\bxox[abprs]-[0-9A-Za-z-]{10,48}\b/g,
  // JWT: header.payload.signature, anchored on the near-universal "eyJ" header prefix.
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
  // Database/queue connection strings with inline credentials.
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|rediss|amqp|amqps|mssql):\/\/[^:@\s]+:[^@\s]+@[^\s"'<>]+/gi,
  // Matches both bareword (password: "x") and JSON-quoted-key ("api_key": "x") forms.
  /["']?\b(?:password|secret|token|api[_-]?key)\b["']?\s*[:=]\s*["'][^"']+["']/gi,
  /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g
];

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const IP_PATTERN = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export function maskPromptText(input: string, options?: Partial<PromptMaskerOptions>): string {
  const resolved = { ...DEFAULT_OPTIONS, ...options };
  let masked = input;

  for (const pattern of BASE_PATTERNS) {
    masked = masked.replace(pattern, "[REDACTED]");
  }

  if (resolved.maskEmails) {
    masked = masked.replace(EMAIL_PATTERN, "[REDACTED_EMAIL]");
  }
  if (resolved.maskIpAddresses) {
    masked = masked.replace(IP_PATTERN, "[REDACTED_IP]");
  }

  return masked;
}
