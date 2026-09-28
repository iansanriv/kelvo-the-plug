export function createWorker(handlers) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      const prefix = ['/api/', '/.netlify/functions/'].find(p => url.pathname.startsWith(p));
      if (!prefix) return env.ASSETS.fetch(request);
      const name = url.pathname.slice(prefix.length);
      if (!Object.hasOwn(handlers, name)) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      try {
        const event = {
          httpMethod: request.method,
          headers: Object.fromEntries(request.headers),
          rawUrl: request.url,
          path: url.pathname,
          queryStringParameters: Object.fromEntries(url.searchParams),
          // Preserve the exact body for Stripe's signature verification.
          body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text(),
          isBase64Encoded: false
        };
        const result = await handlers[name](event);
        const headers = new Headers(result.headers);
        headers.set('Cache-Control', 'no-store');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(request.method === 'HEAD' ? null : result.body, {
          status: result.statusCode,
          headers
        });
      } catch {
        console.error(`Request failed in ${name}; check runtime configuration and upstream service status.`);
        return Response.json({ error: 'Service unavailable. Please try again later.' }, {
          status: 503, headers: { 'Cache-Control': 'no-store' }
        });
      }
    }
  };
}
