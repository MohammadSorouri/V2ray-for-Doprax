export const config = { runtime: "edge" };

// حذف اسلش انتهایی دامنه هدف
const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// هدرهایی که باید از درخواست حذف شوند
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
  // بررسی تنظیم بودن دامنه هدف
  if (!TARGET_BASE) {
    return new Response("Misconfigured: TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    // ساخت URL مقصد با استفاده از pathname و search پارامترهای درخواست
    const url = new URL(req.url);
    const targetUrl = TARGET_BASE + url.pathname + url.search;

    // ساخت هدرهای خروجی
    const out = new Headers();
    let clientIp = null;
    let xForwardedFor = null;

    // پیمایش هدرهای ورودی و فیلتر کردن آنها
    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();

      // حذف هدرهای غیرمجاز
      if (STRIP_HEADERS.has(lowerKey)) continue;
      // حذف هدرهای مخصوص Vercel
      if (lowerKey.startsWith("x-vercel-")) continue;

      // تشخیص آی‌پی کلاینت اصلی
      if (lowerKey === "x-real-ip") {
        clientIp = value;
        continue;
      }

      // ذخیره X-Forwarded-For ورودی (ممکن است شامل چند آی‌پی باشد)
      if (lowerKey === "x-forwarded-for") {
        xForwardedFor = value;
        continue;
      }

      out.set(key, value);
    }

    // تنظیم صحیح هدر X-Forwarded-For
    const ipToAdd = clientIp || (xForwardedFor?.split(",")[0]?.trim() || null);
    if (ipToAdd) {
      const existing = xForwardedFor || null;
      const newXFF = existing ? `${existing}, ${ipToAdd}` : ipToAdd;
      out.set("x-forwarded-for", newXFF);
    } else if (xForwardedFor) {
      // اگر آی‌پی جدیدی نداریم ولی هدر ورودی وجود دارد، آن را منتقل می‌کنیم
      out.set("x-forwarded-for", xForwardedFor);
    }

    const method = req.method;
    const hasBody = method !== "GET" && method !== "HEAD";

    // ارسال درخواست به سرور مقصد
    return await fetch(targetUrl, {
      method,
      headers: out,
      body: hasBody ? req.body : undefined,
      duplex: "half",
      redirect: "manual",
    });
  } catch (err) {
    console.error("Relay error:", err);
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
