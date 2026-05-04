export const config = { runtime: "edge" };

// حذف پروتکل https پیش‌فرض و جایگزینی با http
const TARGET_BASE = (process.env.TARGET_DOMAIN || "")
  .replace(/\/$/, "")
  .replace(/^https?:\/\//, ""); // فقط دامنه را نگه می‌دارد

const USE_HTTPS = process.env.USE_HTTPS === "true"; // متغیر جدید برای کنترل پروتکل
const PROTOCOL = USE_HTTPS ? "https" : "http";

const STRIP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
  "strict-transport-security", // هدر امنیتی SSL که دیگر نیاز نیست
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname + url.search;
    
    // ساخت URL هدف با پروتکل ساده HTTP
    const targetUrl = `${PROTOCOL}://${TARGET_BASE}${path}`;

    const out = new Headers();
    let clientIp = null;
    
    for (const [k, v] of req.headers) {
      if (STRIP_HEADERS.has(k.toLowerCase())) continue;
      if (k.toLowerCase().startsWith("x-vercel-")) continue;
      if (k.toLowerCase() === "x-real-ip") {
        clientIp = v;
        continue;
      }
      if (k.toLowerCase() === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }
      out.set(k, v);
    }
    
    if (clientIp) out.set("x-forwarded-for", clientIp);
    
    // اضافه کردن هدر Host برای سرور مقصد
    out.set("host", TARGET_BASE);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    return await fetch(targetUrl, {
      method,
      headers: out,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
      // غیرفعال کردن بررسی SSL (فقط برای HTTP لازم نیست اما احتیاطاً می‌گذاریم)
      ...(USE_HTTPS ? {} : { 
        // برای HTTP نیازی به تنظیمات SSL نیست
      }),
    });
  } catch (err) {
    console.error("relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
