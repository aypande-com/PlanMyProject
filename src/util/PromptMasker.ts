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
  /\b(?:password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']+["']/gi,
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
