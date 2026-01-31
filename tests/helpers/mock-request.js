// Mock Vercel req/res objects for serverless function testing

export function createMockReq({
    method = 'POST',
    body = {},
    query = {},
    headers = {},
} = {}) {
    return {
        method,
        body,
        query,
        headers: {
            'x-forwarded-for': '127.0.0.1',
            'content-type': 'application/json',
            ...headers,
        },
    };
}

export function createMockRes() {
    const res = {
        _status: 200,
        _json: null,
        _sent: false,

        status(code) {
            res._status = code;
            return res;
        },

        json(data) {
            res._json = data;
            res._sent = true;
            return res;
        },

        // Helpers for assertions
        get statusCode() {
            return res._status;
        },

        get data() {
            return res._json;
        },
    };

    return res;
}
