export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const state = globalThis.crypto.randomUUID();

  // X OAuth 2.0 requires PKCE — generate code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Store state + code_verifier in Vercel KV with 10-minute TTL
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  await fetch(`${kvUrl}/set/x_state:${state}/${encodeURIComponent(codeVerifier)}/EX/600`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = process.env.X_REDIRECT_URI;

  // Debug endpoint: /api/x/auth?debug=1
  if (new URL(req.url).searchParams.get('debug') === '1') {
    return new Response(JSON.stringify({
      client_id: clientId ? clientId.slice(0, 4) + '...' : 'NOT SET',
      redirect_uri: redirectUri || 'NOT SET',
      client_secret_set: !!process.env.X_CLIENT_SECRET,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'users.read tweet.read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return Response.redirect(
    `https://x.com/i/oauth2/authorize?${params.toString()}`,
    302
  );
}

function generateCodeVerifier() {
  const array = new Uint8Array(32);
  globalThis.crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
