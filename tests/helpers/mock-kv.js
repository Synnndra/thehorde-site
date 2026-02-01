// In-memory KV store matching Upstash REST API
// Used to intercept fetch calls to KV_REST_API_URL

export class MockKV {
    constructor() {
        this.store = new Map();
        this.lists = new Map();
        this.expiries = new Map();
        this._callLog = [];
        this._failures = [];
    }

    reset() {
        this.store.clear();
        this.lists.clear();
        this.expiries.clear();
        this._callLog = [];
        this._failures = [];
    }

    // ========== Failure Injection ==========

    /**
     * Fail the next matching call with the given error response.
     * @param {string} method - 'get', 'set', 'del', 'expire', 'keys', or 'pipeline'
     * @param {string} keyPattern - glob pattern for the key (e.g. 'offer:*')
     * @param {Error|string} [error] - error to return
     */
    failOnce(method, keyPattern, error) {
        this._failures.push({
            method: method.toLowerCase(),
            keyPattern,
            countdown: 1,
            error: error || new Error('Injected KV failure'),
        });
    }

    /**
     * Fail on the Nth matching call.
     * @param {string} method
     * @param {string} keyPattern
     * @param {{ countdown: number, error?: Error|string }} opts
     */
    failOn(method, keyPattern, { countdown = 1, error } = {}) {
        this._failures.push({
            method: method.toLowerCase(),
            keyPattern,
            countdown,
            error: error || new Error('Injected KV failure'),
        });
    }

    /**
     * Returns ordered log of all KV operations.
     * Each entry: { method, key, timestamp }
     */
    getCallLog() {
        return [...this._callLog];
    }

    clearCallLog() {
        this._callLog = [];
    }

    _logCall(method, key) {
        this._callLog.push({ method, key, timestamp: Date.now() });
    }

    _shouldFail(method, key) {
        const regex = (pattern) => new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (let i = 0; i < this._failures.length; i++) {
            const f = this._failures[i];
            if (f.method === method.toLowerCase() && regex(f.keyPattern).test(key)) {
                f.countdown--;
                if (f.countdown <= 0) {
                    this._failures.splice(i, 1);
                    return f.error;
                }
            }
        }
        return null;
    }

    // ========== Core Operations ==========

    // Set a value
    set(key, value) {
        this._logCall('set', key);
        this.store.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        return { result: 'OK' };
    }

    // Get a value
    get(key) {
        this._logCall('get', key);
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
        this._logCall('del', key);
        this.store.delete(key);
        this.expiries.delete(key);
        return { result: 1 };
    }

    // Set expiry in seconds
    expire(key, seconds) {
        this._logCall('expire', key);
        this.expiries.set(key, Date.now() + seconds * 1000);
        return { result: 1 };
    }

    // Scan keys by pattern
    keys(pattern) {
        this._logCall('keys', pattern);
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        const matches = [];
        for (const key of this.store.keys()) {
            if (regex.test(key)) {
                matches.push(key);
            }
        }
        return { result: matches };
    }

    // Append to a list (Redis RPUSH)
    rpush(key, value) {
        this._logCall('rpush', key);
        if (!this.lists.has(key)) {
            this.lists.set(key, []);
        }
        this.lists.get(key).push(value);
        return { result: this.lists.get(key).length };
    }

    // Get range from list (Redis LRANGE)
    lrange(key, start, stop) {
        this._logCall('lrange', key);
        const list = this.lists.get(key) || [];
        const len = list.length;
        const s = start < 0 ? Math.max(len + start, 0) : start;
        const e = stop < 0 ? len + stop : stop;
        return { result: list.slice(s, e + 1) };
    }

    // Handle Upstash REST API-style requests
    handleRequest(url, options = {}) {
        const urlStr = typeof url === 'string' ? url : url.toString();

        // Handle pipeline/command array format (used by acquireLock, claimEscrowTx)
        if (options.body && !urlStr.includes('/get/') && !urlStr.includes('/set/') &&
            !urlStr.includes('/del/') && !urlStr.includes('/expire/') && !urlStr.includes('/keys/')) {
            try {
                const body = JSON.parse(options.body);
                if (Array.isArray(body) && body[0] === 'RPUSH') {
                    const [, key, value] = body;
                    this._logCall('rpush', key);
                    const failError = this._shouldFail('rpush', key);
                    if (failError) {
                        return this._jsonResponse({ error: String(failError) }, 500);
                    }
                    return this._jsonResponse(this.rpush(key, value));
                }
                if (Array.isArray(body) && body[0] === 'SET') {
                    const [, key, value, ...rest] = body;

                    this._logCall('pipeline', key);

                    // Check failure injection for pipeline
                    const failError = this._shouldFail('pipeline', key);
                    if (failError) {
                        return this._jsonResponse({ error: String(failError) }, 500);
                    }

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
            const key = decodeURIComponent(getMatch[1]);
            const failError = this._shouldFail('get', key);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            return this._jsonResponse(this.get(key));
        }

        // POST /set/{key}
        const setMatch = urlStr.match(/\/set\/(.+)$/);
        if (setMatch) {
            const key = decodeURIComponent(setMatch[1]);
            const failError = this._shouldFail('set', key);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            const value = options.body || '';
            return this._jsonResponse(this.set(key, value));
        }

        // POST /del/{key}
        const delMatch = urlStr.match(/\/del\/(.+)$/);
        if (delMatch) {
            const key = decodeURIComponent(delMatch[1]);
            const failError = this._shouldFail('del', key);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            return this._jsonResponse(this.del(key));
        }

        // POST /expire/{key}/{seconds}
        const expireMatch = urlStr.match(/\/expire\/(.+?)\/(\d+)$/);
        if (expireMatch) {
            const key = decodeURIComponent(expireMatch[1]);
            const failError = this._shouldFail('expire', key);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            return this._jsonResponse(this.expire(key, parseInt(expireMatch[2])));
        }

        // GET /keys/{pattern}
        const keysMatch = urlStr.match(/\/keys\/(.+)$/);
        if (keysMatch) {
            const pattern = decodeURIComponent(keysMatch[1]);
            const failError = this._shouldFail('keys', pattern);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            return this._jsonResponse(this.keys(pattern));
        }

        // GET /lrange/{key}/{start}/{stop}
        const lrangeMatch = urlStr.match(/\/lrange\/(.+?)\/(-?\d+)\/(-?\d+)$/);
        if (lrangeMatch) {
            const key = decodeURIComponent(lrangeMatch[1]);
            const failError = this._shouldFail('lrange', key);
            if (failError) {
                return this._jsonResponse({ error: String(failError) }, 500);
            }
            return this._jsonResponse(this.lrange(key, parseInt(lrangeMatch[2]), parseInt(lrangeMatch[3])));
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
