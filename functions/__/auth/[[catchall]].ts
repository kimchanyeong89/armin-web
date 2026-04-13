export const onRequest = async (context: any) => {
  const url = new URL(context.request.url);
  
  // Rewrite the host to armin-web.firebaseapp.com
  url.hostname = "armin-web.firebaseapp.com";
  url.port = "";
  url.protocol = "https:";

  // Create a new request with the rewritten URL
  const proxyRequest = new Request(url.toString(), context.request);
  
  // Important for Firebase Auth cross-origin proxying:
  proxyRequest.headers.set("Host", "armin-web.firebaseapp.com");
  proxyRequest.headers.set("X-Forwarded-Host", context.request.headers.get("Host") || "");

  try {
    const response = await fetch(proxyRequest);
    return response;
  } catch (err) {
    return new Response("Auth proxy error", { status: 502 });
  }
};
