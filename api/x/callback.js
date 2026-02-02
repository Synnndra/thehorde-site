export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const debug = url.searchParams.get('debug') === '1';
  const baseUrl = `${url.protocol}//${url.host}`;

  if (!code || !state) {
    return Response.redirect(`${baseUrl}/?x_error=missing_params&x_detail=no_code_or_state`, 302);
  }

  // Retrieve code_verifier from KV
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  const stateRes = await fetch(`${kvUrl}/get/x_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const stateData = await stateRes.json();

  if (!stateData.result) {
    return Response.redirect(`${baseUrl}/?x_error=invalid_state&x_detail=kv_empty`, 302);
  }

  const codeVerifier = decodeURIComponent(stateData.result);

  // Delete state after use
  await fetch(`${kvUrl}/del/x_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  // Exchange code for token
  let tokenData;
  try {
    const basicAuth = btoa(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`);
    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.X_REDIRECT_URI,
        code_verifier: codeVerifier,
      }),
    });
    tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      const detail = encodeURIComponent(JSON.stringify(tokenData));
      return Response.redirect(`${baseUrl}/?x_error=token_exchange_failed&x_detail=${detail}`, 302);
    }
  } catch (e) {
    const detail = encodeURIComponent(e.message);
    return Response.redirect(`${baseUrl}/?x_error=token_catch&x_detail=${detail}`, 302);
  }

  // Fetch user info
  let user;
  try {
    const userRes = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();
    user = userData.data;

    if (!user?.id) {
      if (debug) return new Response(JSON.stringify({ error: 'no_user_id', userData }), { headers: { 'Content-Type': 'application/json' } });
      return Response.redirect(`${baseUrl}/?x_error=user_fetch_failed`, 302);
    }
  } catch (e) {
    if (debug) return new Response(JSON.stringify({ error: 'user_catch', message: e.message }), { headers: { 'Content-Type': 'application/json' } });
    return Response.redirect(`${baseUrl}/?x_error=user_fetch_failed`, 302);
  }

  const params = new URLSearchParams({
    x_id: user.id,
    x_username: user.username,
    x_avatar: user.profile_image_url || '',
  });

  return Response.redirect(`${baseUrl}/?${params.toString()}`, 302);
}
