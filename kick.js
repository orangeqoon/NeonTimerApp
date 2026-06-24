// Kick API integration for NeonTimerApp (OAuth 2.1 with PKCE)
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');
const { shell } = require('electron');

const CONFIG_PATH = path.join(__dirname, 'kick-config.json');
const TOKEN_PATH = path.join(__dirname, 'kick-token.json');

function loadConfig() {
    try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { return null; }
}
function loadToken() {
    try { return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')); } catch (e) { return null; }
}
function saveToken(token) {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

function base64url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
        if (!options.headers) options.headers = {};
        options.headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        options.headers['Accept'] = 'application/json';

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function authorize() {
    const config = loadConfig();
    if (!config) return false;

    // PKCE用のランダム文字列生成
    const codeVerifier = crypto.randomBytes(32).toString('hex');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    // Kickの公式ドキュメントに合わせたスコープ
    const scopes = 'channel:write';
    // stateパラメータ（必須: Kick公式ドキュメントに "Yes (at the moment)" と明記）
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = `https://id.kick.com/oauth/authorize` +
        `?response_type=code` +
        `&client_id=${config.client_id}` +
        `&redirect_uri=${encodeURIComponent(config.redirect_uri)}` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&code_challenge=${codeChallenge}` +
        `&code_challenge_method=S256` +
        `&state=${state}`;

    return new Promise((resolve) => {
        const server = http.createServer(async (req, res) => {
            const url = new URL(req.url, 'http://localhost:3000');
            if (url.pathname === '/oauth2callback') {
                const code = url.searchParams.get('code');
                res.end('Kick authentication successful! You can close this tab.');
                server.close();

                // Exchange code for token
                const body = new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    client_id: config.client_id,
                    client_secret: config.client_secret,
                    redirect_uri: config.redirect_uri,
                    code_verifier: codeVerifier
                }).toString();

                const tokenRes = await httpsRequest({
                    hostname: 'id.kick.com',
                    path: '/oauth/token',
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                }, body);

                if (tokenRes.status === 200 && tokenRes.body.access_token) {
                    saveToken(tokenRes.body);
                    resolve(true);
                } else {
                    const errMsg = typeof tokenRes.body === 'object' ? JSON.stringify(tokenRes.body) : tokenRes.body;
                    alert('Kick Token Error:\n' + errMsg);
                    console.error('Kick token exchange failed:', tokenRes.body);
                    resolve(false);
                }
            }
        });

        server.listen(3000, () => {
            shell.openExternal(authUrl);
        });

        setTimeout(() => { server.close(); resolve(false); }, 120000);
    });
}

async function refreshAccessToken() {
    const config = loadConfig();
    const token = loadToken();
    if (!config || !token || !token.refresh_token) return null;

    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
        client_id: config.client_id,
        client_secret: config.client_secret
    }).toString();

    const res = await httpsRequest({
        hostname: 'id.kick.com',
        path: '/oauth/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, body);

    if (res.status === 200 && res.body.access_token) {
        saveToken(res.body);
        return res.body.access_token;
    }
    return null;
}

async function updateStream(title, categoryName) {
    let token = loadToken();
    if (!token) {
        const success = await authorize();
        if (!success) throw new Error('Kick authentication failed.');
        token = loadToken();
    }

    const searchCategory = async (catName, accessToken) => {
        if (!catName) return null;
        try {
            const res = await httpsRequest({
                hostname: 'api.kick.com',
                path: `/public/v1/categories?q=${encodeURIComponent(catName)}`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });
            if (res.status === 200 && res.body.data && res.body.data.length > 0) {
                // Find exact match or use first
                const exactMatch = res.body.data.find(c => c.name.toLowerCase() === catName.toLowerCase());
                return exactMatch ? exactMatch.id : res.body.data[0].id;
            }
        } catch (e) {
            console.error('Failed to fetch Kick category:', e);
        }
        return null;
    };

    const makeRequest = async (accessToken) => {
        const bodyObj = { stream_title: title };
        const categoryId = await searchCategory(categoryName, accessToken);
        if (categoryId) bodyObj.category_id = categoryId;
        const body = JSON.stringify(bodyObj);
        return await httpsRequest({
            hostname: 'api.kick.com',
            path: '/public/v1/channels',
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, body);
    };

    let res = await makeRequest(token.access_token);
    if (res.status === 401) {
        const newToken = await refreshAccessToken();
        if (newToken) res = await makeRequest(newToken);
    }

    if (res.status !== 200 && res.status !== 204) {
        throw new Error(`Kick update failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
}

function isConfigured() {
    return !!loadConfig();
}

module.exports = { updateStream, isConfigured };
