const SIGN_IN_PATH = "/signin";
const AUTH_PREFIX = "/auth";
const DEFAULT_AUTHENTICATED_PATH = "/";

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function isSignInRoute(pathname: string): boolean {
  return normalizePathname(pathname) === SIGN_IN_PATH;
}

export function isAuthApiRoute(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return normalized === AUTH_PREFIX || normalized.startsWith(`${AUTH_PREFIX}/`);
}

/**
 * Fail-closed route protection decision.
 *
 * Every route outside `/signin` and `/auth/*` requires an authenticated
 * session. Authenticated requests to `/signin` redirect to `/`.
 */
export function getAuthRedirectTarget(
  pathname: string,
  isAuthenticated: boolean,
): string | null {
  if (isAuthApiRoute(pathname)) {
    return null;
  }

  if (isSignInRoute(pathname)) {
    return isAuthenticated ? DEFAULT_AUTHENTICATED_PATH : null;
  }

  return isAuthenticated ? null : SIGN_IN_PATH;
}
