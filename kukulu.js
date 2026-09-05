// KukuluLIVE API integration for NeonTimerApp
const fs = require('fs');
const path = require('path');
const https = require('https');

// 設定ファイルの探索パス（exe配置場所や開発ルートなど）
const CONFIG_PATHS = [
    path.join(__dirname, 'kukulu-config.json'),
    path.join(__dirname, '..', 'kukulu-config.json'),
    path.join(__dirname, '..', '..', 'kukulu-config.json'),
    path.join(process.cwd(), 'kukulu-config.json')
];

function loadConfig() {
    for (const configPath of CONFIG_PATHS) {
        if (fs.existsSync(configPath)) {
            try {
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                if (config && config.apikey && config.apikey !== 'YOUR_KUKULU_APIKEY_HERE') {
                    return config;
                }
            } catch (e) {}
        }
    }
    return null;
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
 * KukuluLIVE の配信枠を取得する (mylive.port_get)
 */
async function getPort() {
    const config = loadConfig();
    if (!config) throw new Error('Kukulu config not found.');

    const apiUrl = `https://live.erinn.biz/api/?category=mylive&type=port_get&apikey=${encodeURIComponent(config.apikey)}&eula=1`;
    const res = await httpsGet(apiUrl);

    if (res.status === 200 && res.body && res.body.success === 1) {
        console.log('[Kukulu] Broadcast port successfully acquired.');
        return res.body;
    }
    const errMsg = res.body?.error_display || `Error code: ${res.body?.error}`;
    console.warn(`[Kukulu] Failed to get port: ${errMsg}`);
    throw new Error(`[Kukulu] 枠取得エラー: ${errMsg}`);
}

/**
 * KukuluLIVE の配信タイトルおよび説明文を更新する (mylive.port_modify)
 * 枠が存在しない場合は自動で枠取得 (port_get) を試みます。
 * @param {string} title 配信タイトル
 * @param {string} [description=''] 配信説明文
 */
async function updateStream(title, description = '') {
    const config = loadConfig();
    if (!config) {
        throw new Error('Kukulu config not found or invalid. Please create kukulu-config.json.');
    }

    // 1. まず現在の枠情報を確認
    let portInfo = await getPortInfo();
    // 配信枠がない（mylive === 0 または情報なし）場合、自動で枠取得（port_get）を行う
    if (!portInfo || portInfo.mylive === 0) {
        console.log('[Kukulu] 配信枠が見つからないため、自動で枠取得(port_get)を実行します...');
        try {
            await getPort();
            // 枠取得後の反映を待つため1秒待機
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.warn('[Kukulu] 自動枠取得に失敗しました:', e.message);
        }
    }

    // 2. 配信タイトルを変更
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
 * KukuluLIVE の配信枠情報を取得する (mylive.port_info)
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
    getPort,
    updateStream,
    getPortInfo
};

