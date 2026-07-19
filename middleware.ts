import { NextRequest, NextResponse } from "next/server";

/**
 * Basic Auth для всех путей кроме /api/health.
 *
 * Поддерживает двух пользователей: NICHE_USER/NICHE_PASS (основной) и
 * NICHE_USER_2/NICHE_PASS_2 (дополнительный — например, для партнёра/демо).
 *
 * Если хотите временно открыть дашборд — задайте PUBLIC_DEMO=1.
 *
 * Defensive cleanup: env-значения часто приходят с лишними кавычками
 * или пробелами (особенно после `echo "value" | vercel env add` на Windows
 * или обёртки кавычками в .env.local). Здесь снимаем их перед сравнением.
 */
function cleanEnv(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const trimmed = s.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (path === "/api/health") return NextResponse.next();
  if (path === "/api/mcp" || path.startsWith("/api/mcp/")) return NextResponse.next();

  // Public demo mode: skip Basic Auth entirely.
  // Set PUBLIC_DEMO env var (any value, even empty) to disable auth — used for
  // course demos on mock data. Unset the var to re-enable auth.
  if (process.env.PUBLIC_DEMO !== undefined) return NextResponse.next();

  const pairs = [
    [cleanEnv(process.env.NICHE_USER), cleanEnv(process.env.NICHE_PASS)],
    [cleanEnv(process.env.NICHE_USER_2), cleanEnv(process.env.NICHE_PASS_2)],
  ].filter((p): p is [string, string] => !!p[0] && !!p[1]);

  if (pairs.length === 0) {
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Server misconfigured: NICHE_USER/NICHE_PASS not set",
        { status: 500 },
      );
    }
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  const matched = pairs.some(([user, pass]) => {
    const expected = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
    return auth === expected;
  });

  if (!matched) {
    return new NextResponse("Authentication required", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="kaspi-dashboard"' },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
