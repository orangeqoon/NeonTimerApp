// KukuluLIVE API integration for NeonTimerApp
const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'kukulu-config.json');

function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return null;
    try {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        if (config && config.apikey && config.apikey !== 'YOUR_KUKULU_APIKEY_HERE') {
            return config;
        }
        return null;
    } catch (e) {
        return null;
    }
}

function isConfigured() {
    return !!loadConfig();
}

function httpsGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        }).on('error', reject);
    });
}

/**
 * KukuluLIVE の配信タイトルおよび説明文を更新する
 * @param {string} title 配信タイトル
 * @param {string} [description=''] 配信説明文
 */
async function updateStream(title, description = '') {
    const config = loadConfig();
    if (!config) {
        throw new Error('Kukulu config not found or invalid. Please create kukulu-config.json.');
    }

    const apiUrl = `https://live.erinn.biz/api/?category=mylive&type=port_modify&apikey=${encodeURIComponent(config.apikey)}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;

    const res = await httpsGet(apiUrl);

    if (res.status === 200 && res.body) {
        if (res.body.success === 1) {
            console.log(`[Kukulu] Title updated: "${title}"`);
            return res.body;
        } else {
            const errMsg = res.body.error_display || `Error code: ${res.body.error}`;
            console.warn(`[Kukulu] Failed to update title: ${errMsg}`);
            throw new Error(`[Kukulu] ${errMsg}`);
        }
    } else {
        throw new Error(`[Kukulu] API request failed with status: ${res.status}`);
    }
}

/**
 * KukuluLIVE の配信枠情報を取得する
 */
async function getPortInfo() {
    const config = loadConfig();
    if (!config) return null;

    const apiUrl = `https://live.erinn.biz/api/?category=mylive&type=port_info&apikey=${encodeURIComponent(config.apikey)}`;
    const res = await httpsGet(apiUrl);

    if (res.status === 200 && res.body && res.body.success === 1) {
        return res.body;
    }
    return null;
}

module.exports = {
    isConfigured,
    updateStream,
    getPortInfo
};
