export const config = { runtime: "edge" };

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
    // ساخت URL مقصد
    const url = new URL(req.url);
    const pathAndQuery = url.pathname + url.search;
    const targetUrl = TARGET_BASE + pathAndQuery;

    console.log(`[relay] ${req.method} ${targetUrl}`);

    // آماده‌سازی هدرها
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
    
    if (clientIp) {
      out.set("x-forwarded-for", clientIp);
    }

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    // تنظیمات fetch بدون SSL
    const fetchOptions = {
      method,
      headers: out,
      redirect: "manual",
    };

    // فقط برای متدهایی که body دارن اضافه کن
    if (hasBody) {
      fetchOptions.body = req.body;
      fetchOptions.duplex = "half";
    }

    // اضافه کردن option برای ignore SSL errors (فقط برای http:// کاربرد نداره
    // ولی اگه خواستی با https:// و SSL نامعتبر تست کنی میتونی uncomment کنی)
    // توجه: این option در Edge Runtime وجود نداره
    // برای https نامعتبر باید از http:// استفاده کنی

    const response = await fetch(targetUrl, fetchOptions);

    // کپی کردن response به صورت کامل
    const responseHeaders = new Headers(response.headers);
    
    // اضافه کردن CORS headers اگر لازم داری
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error("relay error:", err);
    console.error("Target URL:", TARGET_BASE);
    return new Response(`Bad Gateway: ${err.message}`, { status: 502 });
  }
}
