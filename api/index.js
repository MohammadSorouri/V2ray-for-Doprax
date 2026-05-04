// حذف: export const config = { runtime: "edge" };

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

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
]);

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    const pathStart = req.url.indexOf("/", 8);
    const targetUrl =
      pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + req.url.slice(pathStart);

    // لاگ کردن URL مقصد برای دیباگ
    console.log(`[DEBUG] Forwarding to: ${targetUrl}`);
    console.log(`[DEBUG] Method: ${req.method}`);

    const out = new Headers();
    let clientIp = null;
    
    for (const [k, v] of req.headers) {
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-vercel-")) continue;
      if (k === "x-real-ip") {
        clientIp = v;
        continue;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = v;
        continue;
      }
      out.set(k, v);
    }
    
    if (clientIp) out.set("x-forwarded-for", clientIp);

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    // تنظیمات اضافی برای fetch
    const fetchOptions = {
      method,
      headers: out,
      redirect: "manual",
    };

    if (hasBody && req.body) {
      fetchOptions.body = req.body;
      fetchOptions.duplex = "half";
    }

    const response = await fetch(targetUrl, fetchOptions);

    // لاگ کردن نتیجه موفق
    console.log(`[DEBUG] Response status: ${response.status}`);
    
    return response;

  } catch (err) {
    // لاگ دقیق‌تر خطا
    console.error("[ERROR] Message:", err.message);
    console.error("[ERROR] Cause:", err.cause);
    console.error("[ERROR] Code:", err.code);
    console.error("[ERROR] Stack:", err.stack);
    console.error("[ERROR] Target URL:", TARGET_BASE);
    
    let errorMessage = "Bad Gateway: Tunnel Failed";
    
    if (err.code === "ENOTFOUND" || err.message.includes("fetch failed")) {
      errorMessage = "Bad Gateway: Target server unreachable. Check if TARGET_DOMAIN is accessible from Vercel.";
    } else if (err.message.includes("timeout")) {
      errorMessage = "Bad Gateway: Connection timed out";
    } else {
      errorMessage = `Bad Gateway: ${err.message}`;
    }
    
    return new Response(errorMessage, { 
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8"
      }
    });
  }
}
