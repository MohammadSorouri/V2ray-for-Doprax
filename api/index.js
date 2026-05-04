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
    // ساخت URL مقصد
    const pathStart = req.url.indexOf("/", 8);
    const targetUrl = pathStart === -1
      ? TARGET_BASE + "/"
      : TARGET_BASE + req.url.slice(pathStart);

    console.log(`[DEBUG] Forwarding to: ${targetUrl}`);

    // 1. تبدیل plain object headers به Headers استاندارد
    const requestHeaders = new Headers(req.headers);

    // 2. ساخت هدرهای خروجی
    const out = new Headers();
    
    // تنظیم Host header
    const targetHost = new URL(TARGET_BASE).hostname;
    out.set("Host", targetHost);

    let clientIp = null;

    requestHeaders.forEach((value, key) => {
      const k = key.toLowerCase();

      if (STRIP_HEADERS.has(k)) return;
      if (k.startsWith("x-vercel-")) return;

      if (k === "x-real-ip") {
        clientIp = value;
        return;
      }
      if (k === "x-forwarded-for") {
        if (!clientIp) clientIp = value;
        return;
      }

      out.set(k, value);
    });

    if (clientIp) out.set("x-forwarded-for", clientIp);

    // 3. مدیریت body
    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    const fetchOptions = {
      method,
      headers: out,
      redirect: "manual",
    };

    if (hasBody) {
      // در Node.js می‌تونیم req رو مستقیماً به‌عنوان body استریم بدیم
      // ولی اگه قبلاً body مصرف شده باشه، خطا میده. بهتره چک کنیم.
      // برای اطمینان، از req به‌عنوان body استفاده کن (IncomingMessage یک readable stream هست)
      fetchOptions.body = req;
      fetchOptions.duplex = "half";
    }

    // 4. ارسال درخواست
    const response = await fetch(targetUrl, fetchOptions);
    console.log(`[DEBUG] Response status: ${response.status}`);

    // 5. کپی هدرهای پاسخ
    const responseHeaders = new Headers();
    response.headers.forEach((value, key) => {
      if (STRIP_HEADERS.has(key.toLowerCase())) return;
      if (key.toLowerCase() === "content-encoding") return;
      responseHeaders.set(key, value);
    });

    // CORS
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: responseHeaders });
    }

    // 6. بازگشت پاسخ
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });

  } catch (err) {
    console.error("[ERROR]", err.message);
    console.error("[ERROR cause]", err.cause);

    return new Response(
      `Error: ${err.message}\n\nTarget: ${TARGET_BASE}`,
      {
        status: 502,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}
