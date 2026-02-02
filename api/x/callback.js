export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const baseUrl = `${url.protocol}//${url.host}`;

  if (!code || !state) {
    return Response.redirect(`${baseUrl}/?x_error=missing_params`, 302);
  }

  // Retrieve code_verifier from KV
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  const stateRes = await fetch(`${kvUrl}/get/x_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const stateData = await stateRes.json();

  if (!stateData.result) {
    return Response.redirect(`${baseUrl}/?x_error=invalid_state`, 302);
  }

  const codeVerifier = decodeURIComponent(stateData.result);

  // Delete state after use
  await fetch(`${kvUrl}/del/x_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  // Exchange code for token
  let tokenData;
  try {
    const clientId = (process.env.X_CLIENT_ID || '').trim();
    const clientSecret = (process.env.X_CLIENT_SECRET || '').trim();
    const basicAuth = btoa(clientId + ':' + clientSecret);

    const tokenRes = await fetch('https://api.x.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + basicAuth,
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.X_REDIRECT_URI,
        code_verifier: codeVerifier,
        client_id: clientId,
      }),
    });
    tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return Response.redirect(`${baseUrl}/?x_error=token_exchange_failed`, 302);
    }
  } catch {
    return Response.redirect(`${baseUrl}/?x_error=token_exchange_failed`, 302);
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
      return Response.redirect(`${baseUrl}/?x_error=user_fetch_failed`, 302);
    }
  } catch {
    return Response.redirect(`${baseUrl}/?x_error=user_fetch_failed`, 302);
  }

  const params = new URLSearchParams({
    x_id: user.id,
    x_username: user.username,
    x_avatar: user.profile_image_url || '',
  });

  return Response.redirect(`${baseUrl}/?${params.toString()}`, 302);
}
