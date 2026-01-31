// In-memory KV store matching Upstash REST API
// Used to intercept fetch calls to KV_REST_API_URL

export class MockKV {
    constructor() {
        this.store = new Map();
        this.expiries = new Map();
    }

    reset() {
        this.store.clear();
        this.expiries.clear();
    }

    // Set a value
    set(key, value) {
        this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        return { result: 'OK' };
    }

    // Get a value
    get(key) {
        // Check expiry
        if (this.expiries.has(key)) {
            if (Date.now() > this.expiries.get(key)) {
                this.store.delete(key);
                this.expiries.delete(key);
                return { result: null };
            }
        }
        const value = this.store.get(key) ?? null;
        return { result: value };
    }

    // Delete a key
    del(key) {
        this.store.delete(key);
        this.expiries.delete(key);
        return { result: 1 };
    }

    // Set expiry in seconds
    expire(key, seconds) {
        this.expiries.set(key, Date.now() + seconds * 1000);
        return { result: 1 };
    }

    // Scan keys by pattern
    keys(pattern) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matches = [];
        for (const key of this.store.keys()) {
            if (regex.test(key)) {
                matches.push(key);
            }
        }
        return { result: matches };
    }

    // Handle Upstash REST API-style requests
    handleRequest(url, options = {}) {
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Handle pipeline/command array format (used by acquireLock)
        if (options.body && !urlStr.includes('/get/') && !urlStr.includes('/set/') &&
            !urlStr.includes('/del/') && !urlStr.includes('/expire/') && !urlStr.includes('/keys/')) {
            try {
                const body = JSON.parse(options.body);
                if (Array.isArray(body) && body[0] === 'SET') {
                    const [, key, value, ...rest] = body;
                    const hasNX = rest.includes('NX');
                    const exIdx = rest.indexOf('EX');
                    const ttl = exIdx >= 0 ? rest[exIdx + 1] : null;

                    if (hasNX && this.store.has(key)) {
                        return this._jsonResponse({ result: null });
                    }
                    this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
                    if (ttl) {
                        this.expiries.set(key, Date.now() + ttl * 1000);
                    }
                    return this._jsonResponse({ result: 'OK' });
                }
            } catch {}
        }

        // Parse REST-style paths
        // GET /get/{key}
        const getMatch = urlStr.match(/\/get\/(.+)$/);
        if (getMatch) {
            return this._jsonResponse(this.get(decodeURIComponent(getMatch[1])));
        }

        // POST /set/{key}
        const setMatch = urlStr.match(/\/set\/(.+)$/);
        if (setMatch) {
            const value = options.body || '';
            return this._jsonResponse(this.set(decodeURIComponent(setMatch[1]), value));
        }

        // POST /del/{key}
        const delMatch = urlStr.match(/\/del\/(.+)$/);
        if (delMatch) {
            return this._jsonResponse(this.del(decodeURIComponent(delMatch[1])));
        }

        // POST /expire/{key}/{seconds}
        const expireMatch = urlStr.match(/\/expire\/(.+?)\/(\d+)$/);
        if (expireMatch) {
            return this._jsonResponse(this.expire(decodeURIComponent(expireMatch[1]), parseInt(expireMatch[2])));
        }

        // GET /keys/{pattern}
        const keysMatch = urlStr.match(/\/keys\/(.+)$/);
        if (keysMatch) {
            return this._jsonResponse(this.keys(decodeURIComponent(keysMatch[1])));
        }

        // Unknown endpoint
        return this._jsonResponse({ error: 'Unknown KV endpoint' }, 400);
    }

    _jsonResponse(data, status = 200) {
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data)),
        });
    }
}

// Singleton instance for use across tests
export const mockKV = new MockKV();
