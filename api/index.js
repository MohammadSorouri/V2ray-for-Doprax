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

    const out = new Headers();
    let clientIp = null;
    
    // ست کردن Host header
    const targetHost = new URL(TARGET_BASE).hostname;
    out.set("Host", targetHost);
    
    // روش صحیح خوندن هدرها در Vercel Serverless
    const headers = req.headers;
    
    // استفاده از headers.entries() یا headers.forEach()
    headers.forEach((value, key) => {
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

    const responseHeaders = new Headers();
    
    response.headers.forEach((value, key) => {
      if (STRIP_HEADERS.has(key.toLowerCase())) return;
      if (key.toLowerCase() === "content-encoding") return;
      responseHeaders.set(key, value);
    });

    // هدرهای CORS
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Methods", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "*");

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
    console.error("[ERROR]", err.message);
    console.error("[ERROR Cause]", err.cause);
    
    return new Response(
      `Error: ${err.message}\n\n` +
      `Target: ${TARGET_BASE}\n` +
      `Please check:\n` +
      `1. TARGET_DOMAIN is set correctly (use http://)\n` +
      `2. Cloudflare SSL/TLS is set to Flexible\n` +
      `3. Target server is accessible from Vercel`,
      { 
        status: 502,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
