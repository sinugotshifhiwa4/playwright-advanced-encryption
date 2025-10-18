export interface SanitizationParams {
  sensitiveKeys: string[];
  maskValue: string;
  enablePatternDetection: boolean;
  maxDepth: number;
}

/**
 * Default mask value for sensitive data
 */
export const MASK_PLACEHOLDER = "********";

export const KEY_PATTERNS = [
  // Email addresses
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,

  // JWT tokens
  /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,

  // Base64 encoded strings
  /^[A-Za-z0-9+/]{20,}={0,2}$/,

  // OAuth or Bearer tokens
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
  /access_token=\w{20,}/i,
];

export const DEFAULTMASKED_FIELDS = [
  "username",
  "password",
  "apiKey",
  "secretKey",
  "authorization",
  "auth",
  "authentication",
  "token",
  "accessToken",
  "refreshToken",
  "bearerToken",
  "cookie",
  "jwt",
];
