/** Hostnames from BANKAI_ALLOWED_ORIGINS (comma separated), e.g. `localhost,app.example`. */
export function allowedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  return (env.BANKAI_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/** The request's Origin when its hostname is listed, else null. */
function listed(req: Request, allowed: string[]): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  try {
    return allowed.includes(new URL(origin).hostname.toLowerCase()) ? origin : null;
  } catch {
    return null;
  }
}

/** Unlisted origins get no CORS headers, so the browser blocks the read. */
export function withCors(req: Request, res: Response, allowed: string[]): Response {
  const origin = listed(req, allowed);
  if (!origin) return res;
  const out = new Response(res.body, res);
  out.headers.set("Access-Control-Allow-Origin", origin);
  out.headers.append("Vary", "Origin");
  return out;
}

export function preflight(req: Request, allowed: string[]): Response {
  const res = new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-protocol-version, mcp-session-id",
      "Access-Control-Max-Age": "600",
    },
  });
  return withCors(req, res, allowed);
}
