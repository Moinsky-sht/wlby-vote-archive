const secureCookies = process.env.COOKIE_SECURE === 'true';

export function sessionCookieOptions(maxAgeSeconds: number) {
  return [
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    secureCookies ? 'Secure' : '',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`
  ]
    .filter(Boolean)
    .join('; ');
}

export function warnForInsecureProductionCookies() {
  if (process.env.NODE_ENV === 'production' && !secureCookies) {
    console.warn('[security] COOKIE_SECURE is not enabled. Set COOKIE_SECURE=true after HTTPS is configured.');
  }
}
