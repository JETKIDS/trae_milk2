import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";

const redirectToLogin = (request: NextRequest) => {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
};

const unauthorizedResponse = () =>
  new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
    },
  });

const isMastersApi = (pathname: string) =>
  pathname.startsWith("/api/masters") || pathname.startsWith("/api/temporary-changes");

const requiresAdminRedirect = (pathname: string) =>
  pathname.startsWith("/masters") || pathname.startsWith("/invoices");

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const supabase = createMiddlewareClient({ req: request, res: response });

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return isMastersApi(request.nextUrl.pathname) ? unauthorizedResponse() : redirectToLogin(request);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (profileError || profile?.role !== "admin") {
    if (isMastersApi(request.nextUrl.pathname)) {
      return unauthorizedResponse();
    }
    if (requiresAdminRedirect(request.nextUrl.pathname)) {
      return redirectToLogin(request);
    }
    return response;
  }

  return response;
}

export const config = {
  matcher: ["/masters/:path*", "/api/masters/:path*", "/api/temporary-changes/:path*", "/invoices/:path*"],
};

