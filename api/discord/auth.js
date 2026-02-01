import crypto from 'crypto';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const state = crypto.randomUUID();

  // Store state in Vercel KV with 10-minute TTL
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  await fetch(`${kvUrl}/set/discord_state:${state}/1/EX/600`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state,
  });

  return Response.redirect(
    `https://discord.com/api/oauth2/authorize?${params.toString()}`,
    302
  );
}
