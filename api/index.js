export default async function handler(req) {
  const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

  if (!TARGET_BASE) {
    return new Response("TARGET_DOMAIN is not set", { status: 500 });
  }

  try {
    console.log(`Testing connection to: ${TARGET_BASE}`);
    
    // فقط یک تست ساده - بدون هیچ هدر اضافه یا body
    const response = await fetch(TARGET_BASE, {
      signal: AbortSignal.timeout(10000) // 10 ثانیه تایم‌اوت
    });

    console.log(`Success! Status: ${response.status}`);
    
    return new Response(
      `Connection successful!\nStatus: ${response.status}\nURL: ${TARGET_BASE}`,
      { status: 200 }
    );
    
  } catch (err) {
    console.error("Connection test failed:", err.message);
    console.error("Error cause:", err.cause);
    
    return new Response(
      `Connection failed!\nTarget: ${TARGET_BASE}\nError: ${err.message}\nCause: ${err.cause}`,
      { status: 502 }
    );
  }
}
