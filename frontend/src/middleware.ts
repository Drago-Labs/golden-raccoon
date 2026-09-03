import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimitHeaders } from "@/server/security/rateLimit/headers";
import {
  buildRateLimitResponse,
  evaluateRateLimitSync,
  markRateLimitChecked,
} from "@/server/security/rateLimit/limiter";
import { isHealthProbePath, resolveRoutePolicy } from "@/server/security/rateLimit/policy";

export const config = {
  matcher: ["/api/:path*"],
};

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (isHealthProbePath(pathname)) {
    return NextResponse.next();
  }

  const policy = resolveRoutePolicy(pathname, request.method);
  if (!policy) {
    return NextResponse.next();
  }

  const decision = evaluateRateLimitSync(request, policy);
  if (!decision.allowed) {
    return buildRateLimitResponse(policy, decision);
  }

  const requestHeaders = markRateLimitChecked(request);
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  applyRateLimitHeaders(response.headers, decision);
  return response;
}
