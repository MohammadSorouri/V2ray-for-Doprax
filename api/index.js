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

const CUSTOM_HEADERS = {
  "Host": new URL(TARGET_BASE || "http://localhost").hostname,
};

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
    
    out.set("Host", CUSTOM_HEADERS.Host);
    
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

    const responseHeaders = new Headers();
    
    for (const [key, value] of response.headers) {
      if (STRIP_HEADERS.has(key)) continue;
      if (key === "content-encoding") continue;
      responseHeaders.set(key, value);
    }

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
      `This usually means SSL/TLS error. Check Cloudflare settings:\n` +
      `1. SSL/TLS mode should be "Flexible"\n` +
      `2. TARGET_DOMAIN should be http:// (not https://)`,
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
