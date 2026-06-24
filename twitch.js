// Twitch API integration for NeonTimerApp
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'twitch-config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
        return null;
    }
}

function httpsRequest(options, body) {
    return new Promise((resolve, reject) => {
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

async function refreshAccessToken(config) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token,
        client_id: config.client_id,
        client_secret: config.client_secret
    }).toString();

    const res = await httpsRequest({
        hostname: 'id.twitch.tv',
        path: '/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body)
        }
    }, body);

    if (res.status === 200 && res.body.access_token) {
        config.access_token = res.body.access_token;
        if (res.body.refresh_token) config.refresh_token = res.body.refresh_token;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        return config.access_token;
    }
    throw new Error('Failed to refresh Twitch token: ' + JSON.stringify(res.body));
}

function reAuthorizeTwitch() {
    return new Promise((resolve, reject) => {
        exec('node get-twitch-token.js', { cwd: __dirname }, (error) => {
            if (error) {
                console.error('[Twitch] Re-authorization failed:', error);
                reject(error);
            } else {
                console.log('[Twitch] Re-authorization successful.');
                resolve();
            }
        });
    });
}

async function getUserId(config) {
    const res = await httpsRequest({
        hostname: 'api.twitch.tv',
        path: '/helix/users',
        method: 'GET',
        headers: {
            'Client-ID': config.client_id,
            'Authorization': `Bearer ${config.access_token}`
        }
    });
    if (res.status === 401) return null; // needs refresh
    if (!res.body.data || !res.body.data[0]) throw new Error('Could not get Twitch user ID');
    return res.body.data[0].id;
}

async function searchCategory(config, query) {
    const res = await httpsRequest({
        hostname: 'api.twitch.tv',
        path: `/helix/search/categories?query=${encodeURIComponent(query)}&first=5`,
        method: 'GET',
        headers: {
            'Client-ID': config.client_id,
            'Authorization': `Bearer ${config.access_token}`
        }
    });
    if (res.status !== 200) return [];
    return (res.body.data || []).map(g => ({ id: g.id, name: g.name }));
}

async function updateStream(title, categoryName) {
    const config = loadConfig();
    if (!config || !config.client_id || !config.access_token) {
        throw new Error('Twitch config not found. Please create twitch-config.json.');
    }

    // Get broadcaster ID (retry once if 401)
    let broadcasterId = await getUserId(config);
    if (broadcasterId === null) {
        config.access_token = await refreshAccessToken(config);
        broadcasterId = await getUserId(config);
    }

    // Resolve category name -> game_id
    let gameId = '';
    if (categoryName) {
        const cats = await searchCategory(config, categoryName);
        const match = cats.find(c => c.name.toLowerCase() === categoryName.toLowerCase()) || cats[0];
        if (match) gameId = match.id;
    }

    const patchBody = JSON.stringify({
        title,
        ...(gameId ? { game_id: gameId } : {})
    });

    const res = await httpsRequest({
        hostname: 'api.twitch.tv',
        path: `/helix/channels?broadcaster_id=${broadcasterId}`,
        method: 'PATCH',
        headers: {
            'Client-ID': config.client_id,
            'Authorization': `Bearer ${config.access_token}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(patchBody)
        }
    }, patchBody);

    if (res.status === 401) {
        try {
            config.access_token = await refreshAccessToken(config);
        } catch (e) {
            console.log('[Twitch] Token refresh failed, launching re-authorization flow...');
            await reAuthorizeTwitch();
        }
        await updateStream(title, categoryName);
        return;
    }
    if (res.status !== 204) {
        throw new Error(`Twitch update failed (${res.status}): ${JSON.stringify(res.body)}`);
    }
}

async function getSuggestions(query) {
    const config = loadConfig();
    if (!config || !config.client_id || !config.access_token) return [];
    try {
        let res = await httpsRequest({
            hostname: 'api.twitch.tv',
            path: `/helix/search/categories?query=${encodeURIComponent(query)}&first=10`,
            method: 'GET',
            headers: {
                'Client-ID': config.client_id,
                'Authorization': `Bearer ${config.access_token}`
            }
        });

        // 401エラー（期限切れ）ならトークンを更新して再試行
        if (res.status === 401) {
            try {
                config.access_token = await refreshAccessToken(config);
            } catch (e) {
                console.log('[Twitch] Token refresh failed, launching re-authorization flow...');
                await reAuthorizeTwitch();
                const newConfig = loadConfig();
                if (newConfig) config.access_token = newConfig.access_token;
            }
            res = await httpsRequest({
                hostname: 'api.twitch.tv',
                path: `/helix/search/categories?query=${encodeURIComponent(query)}&first=10`,
                method: 'GET',
                headers: {
                    'Client-ID': config.client_id,
                    'Authorization': `Bearer ${config.access_token}`
                }
            });
        }

        if (res.status !== 200) return [];
        return (res.body.data || []).map(g => g.name);
    } catch (e) {
        console.error('[Twitch] Suggest error:', e.message);
        return [];
    }
}

function isConfigured() {
    const config = loadConfig();
    return !!(config && config.client_id && config.access_token);
}

module.exports = { updateStream, getSuggestions, isConfigured };
