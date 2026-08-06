import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Next.js 16 renamed Middleware → Proxy. Clerk still ships `clerkMiddleware`,
 * which returns a handler compatible with the Proxy convention, so we
 * default-export it from `proxy.ts` (see node_modules/next/dist/docs proxy guide).
 */

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|webp|woff2?|ttf|map)).*)",
    // Always run on API routes.
    "/(api|trpc)(.*)",
  ],
};
