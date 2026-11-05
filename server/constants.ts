export const SERVER_CONFIG = {
  port: 3000,
  jsonBodyLimit: '500mb',
  exchangeBodyLimit: '250mb',
} as const;

export const AUTH_CONFIG = {
  sessionLifetimeMs: 30 * 24 * 60 * 60 * 1000,
  jwksCacheMs: 60 * 60 * 1000,
  passwordIterations: 310_000,
} as const;

export const PROXY_LIMITS = {
  requestBytes: 1 * 1024 * 1024,
  responseBytes: 10 * 1024 * 1024,
  timeoutMs: 20_000,
} as const;
