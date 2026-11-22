import { convexAuthNextjsProxy, nextjsProxyRedirect } from "@/lib/convexAuth";
import { getAuthRedirectTarget, isAuthApiRoute } from "@/lib/routeGuard";

export default convexAuthNextjsProxy(async (request, { isAuthenticated }) => {
  const { pathname } = request.nextUrl;
  if (isAuthApiRoute(pathname)) {
    return;
  }

  const authenticated = await isAuthenticated();
  const redirectTarget = getAuthRedirectTarget(pathname, authenticated);
  if (redirectTarget !== null) {
    return nextjsProxyRedirect(request, redirectTarget);
  }
});

export const config = {
  // Run on all routes except static assets and the `/auth` route handlers,
  // which set their own cookies.
  matcher: ["/((?!auth(?:/|$)|.*\\..*|_next).*)", "/"],
};
