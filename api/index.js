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
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { 
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }

  try {
    const pathStart = req.url.indexOf("/", 8);
    const targetUrl =
      pathStart === -1 ? TARGET_BASE + "/" : TARGET_BASE + req.url.slice(pathStart);

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

    console.log(`[DEBUG] Response status: ${response.status}`);
    console.log(`[DEBUG] Response content-type: ${response.headers.get("content-type")}`);

    // کپی کردن هدرهای مهم از پاسخ اصلی
    const responseHeaders = new Headers();
    
    // کپی همه هدرها به جز هدرهای مشکل‌ساز
    for (const [key, value] of response.headers) {
      if (STRIP_HEADERS.has(key)) continue;
      if (key === "content-encoding") continue; // Vercel خودش مدیریت میکنه
      responseHeaders.set(key, value);
    }

    // اضافه کردن هدرهای CORS (حیاتی!)
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    // برای درخواست‌های OPTIONS (preflight)
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: responseHeaders
      });
    }

    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders
    });

  } catch (err) {
    console.error("[ERROR] Full error:", err);
    console.error("[ERROR] Message:", err.message);
    console.error("[ERROR] Cause:", err.cause);
    console.error("[ERROR] Code:", err.code);
    
    let errorMessage = `Bad Gateway Error\n\nTarget: ${TARGET_BASE}\nError: ${err.message}`;
    
    if (err.cause) {
      errorMessage += `\nCause: ${err.cause}`;
    }
    
    return new Response(errorMessage, { 
      status: 502,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}
