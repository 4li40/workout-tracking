import { convexAuthNextjsProxy, nextjsProxyRedirect } from "@/lib/convexAuth";
import { getAuthRedirectTarget } from "@/lib/routeGuard";

export default convexAuthNextjsProxy(async (request, { isAuthenticated }) => {
  const redirectTarget = getAuthRedirectTarget(
    request.nextUrl.pathname,
    await isAuthenticated(),
  );
  if (redirectTarget !== null) {
    return nextjsProxyRedirect(request, redirectTarget);
  }
});

export const config = {
  // Run on every route except Next.js internals, static files by extension, and
  // the `/auth` route handlers, which set their own cookies. Match static files
  // by extension, not by any dot, so page paths like `/exercises/1.5x` stay
  // protected.
  matcher: [
    "/((?!auth(?:/|$)|_next/|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|txt|xml|webmanifest|js|css|map|woff2?)$).*)",
    "/",
  ],
};
