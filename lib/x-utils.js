// X/Twitter OAuth 1.0a signing + posting utilities
// Uses Node built-in crypto — no npm dependencies
import { createHmac, randomBytes } from 'crypto';

// ========== OAuth 1.0a Signing ==========

function percentEncode(str) {
    return encodeURIComponent(str)
        .replace(/!/g, '%21')
        .replace(/\*/g, '%2A')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

function signOAuth1a(method, url, params, consumerSecret, tokenSecret) {
    // Sort params alphabetically
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys
        .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
        .join('&');

    const baseString = [
        method.toUpperCase(),
        percentEncode(url),
        percentEncode(paramString)
    ].join('&');

    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
    const signature = createHmac('sha1', signingKey).update(baseString).digest('base64');
    return signature;
}

function buildAuthHeader(oauthParams) {
    const parts = Object.keys(oauthParams)
        .filter(k => k.startsWith('oauth_'))
        .sort()
        .map(k => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
        .join(', ');
    return `OAuth ${parts}`;
}

// ========== Post Tweet ==========

function getCredentials() {
    const apiKey = process.env.X_API_KEY;
    const apiSecret = process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        throw new Error('X API credentials not configured');
    }
    return { apiKey, apiSecret, accessToken, accessSecret };
}

function makeOAuthHeader(method, url, creds) {
    const oauthParams = {
        oauth_consumer_key: creds.apiKey,
        oauth_nonce: randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: creds.accessToken,
        oauth_version: '1.0'
    };
    const signature = signOAuth1a(method, url, oauthParams, creds.apiSecret, creds.accessSecret);
    oauthParams.oauth_signature = signature;
    return buildAuthHeader(oauthParams);
}

// ========== Upload Media ==========

export async function uploadMedia(base64Data, mimeType) {
    const creds = getCredentials();
    const url = 'https://upload.twitter.com/1.1/media/upload.json';

    // X only supports: image/png, image/jpeg, image/gif, image/webp
    const supported = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (mimeType && !supported.includes(mimeType)) {
        throw new Error(`Unsupported image type: ${mimeType}. Use PNG, JPEG, GIF, or WebP.`);
    }

    // Use multipart/form-data — body params are NOT included in OAuth signature
    const authHeader = makeOAuthHeader('POST', url, creds);

    // Build multipart body
    const boundary = '----XMediaUpload' + randomBytes(8).toString('hex');
    const mediaBuffer = Buffer.from(base64Data, 'base64');

    const parts = [];
    parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${base64Data}\r\n`);
    parts.push(`--${boundary}--\r\n`);
    const body = parts.join('');

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': `multipart/form-data; boundary=${boundary}`
        },
        body
    });

    const data = await response.json();

    if (!response.ok) {
        const errorDetail = data.error || data.errors?.[0]?.message || JSON.stringify(data);
        throw new Error(`X media upload error ${response.status}: ${errorDetail}`);
    }

    return data.media_id_string;
}

// ========== Post Tweet ==========

export async function postTweet(text, mediaIds) {
    const creds = getCredentials();
    const url = 'https://api.x.com/2/tweets';
    const authHeader = makeOAuthHeader('POST', url, creds);

    const body = { text };
    if (mediaIds && mediaIds.length > 0) {
        body.media = { media_ids: mediaIds };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        const errorDetail = data.detail || data.title || JSON.stringify(data);
        throw new Error(`X API error ${response.status}: ${errorDetail}`);
    }

    return {
        tweetId: data.data?.id,
        text: data.data?.text
    };
}

// ========== Draft ID ==========

export function generateDraftId() {
    return 'draft_' + randomBytes(16).toString('hex');
}
