// Small fixed-window, in-memory rate limiter (one Render instance today).
// Keyed by authenticated user id when available, otherwise by client IP.
// For multiple instances, swap the Map for a shared store (e.g. Redis).
const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
}, 60_000).unref();

// server.js sets `trust proxy` to 1 (Render's load balancer), so req.ip is the
// real client address and cannot be spoofed by a client-supplied X-Forwarded-For.
export function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit({ windowMs = 60_000, max = 60, key = "default", by = "user" } = {}) {
  return (req, res, next) => {
    if (process.env.DISABLE_RATE_LIMIT === "1") return next();
    const who = by === "ip" || !req.user ? `ip:${clientIp(req)}` : `u:${req.user._id}`;
    const k = `${key}:${who}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      res.setHeader("Retry-After", Math.ceil((b.resetAt - now) / 1000));
      return res.status(429).json({ success: false, message: "Too many requests. Please wait a moment and try again." });
    }
    next();
  };
}
