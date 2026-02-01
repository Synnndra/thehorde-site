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
    return Response.redirect(`${baseUrl}/?discord_error=missing_params`, 302);
  }

  // Validate state from KV
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  const stateRes = await fetch(`${kvUrl}/get/discord_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const stateData = await stateRes.json();

  if (!stateData.result) {
    return Response.redirect(`${baseUrl}/?discord_error=invalid_state`, 302);
  }

  // Delete state after use
  await fetch(`${kvUrl}/del/discord_state:${state}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  // Exchange code for token
  let tokenData;
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI,
      }),
    });
    tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      return Response.redirect(`${baseUrl}/?discord_error=token_exchange_failed`, 302);
    }
  } catch {
    return Response.redirect(`${baseUrl}/?discord_error=token_exchange_failed`, 302);
  }

  // Fetch user info
  let user;
  try {
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    user = await userRes.json();

    if (!user.id) {
      return Response.redirect(`${baseUrl}/?discord_error=user_fetch_failed`, 302);
    }
  } catch {
    return Response.redirect(`${baseUrl}/?discord_error=user_fetch_failed`, 302);
  }

  const params = new URLSearchParams({
    discord_id: user.id,
    discord_username: user.username,
    discord_avatar: user.avatar || '',
  });

  return Response.redirect(`${baseUrl}/?${params.toString()}`, 302);
}
