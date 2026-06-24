const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'twitch-config.json');

// 設定ファイルの読み込み
let config;
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
    console.error('エラー: twitch-config.json が見つかりません。');
    process.exit(1);
}

if (!config.client_id || config.client_id === 'YOUR_CLIENT_ID_HERE' || !config.client_secret || config.client_secret === 'YOUR_CLIENT_SECRET_HERE') {
    console.error('エラー: twitch-config.json に client_id と client_secret を設定してください。');
    process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3000';
const SCOPES = 'channel:manage:broadcast'; // タイトルとカテゴリの変更権限

const server = http.createServer(async (req, res) => {
    const queryObject = url.parse(req.url, true).query;

    if (queryObject.code) {
        // 認証コードを使ってトークンを取得
        const body = new URLSearchParams({
            client_id: config.client_id,
            client_secret: config.client_secret,
            code: queryObject.code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        }).toString();

        const reqApi = https.request({
            hostname: 'id.twitch.tv',
            path: '/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (resApi) => {
            let data = '';
            resApi.on('data', chunk => data += chunk);
            resApi.on('end', () => {
                const tokenData = JSON.parse(data);
                if (tokenData.access_token) {
                    config.access_token = tokenData.access_token;
                    config.refresh_token = tokenData.refresh_token;
                    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
                    
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>認証成功！</h1><p>Twitchの連携が完了しました。この画面を閉じて、NeonTimerアプリを起動してください。</p>');
                    console.log('✅ トークンの取得と保存に成功しました！');
                    process.exit(0);
                } else {
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>エラー発生</h1><p>トークンの取得に失敗しました。</p>');
                    console.error('❌ エラー:', tokenData);
                    process.exit(1);
                }
            });
        });

        reqApi.on('error', (e) => {
            console.error('APIリクエストエラー:', e);
            process.exit(1);
        });

        reqApi.write(body);
        reqApi.end();
    } else {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('認証コードが見つかりません。');
    }
});

server.listen(3000, () => {
    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${config.client_id}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}`;
    console.log('ブラウザを開いて以下のURLで認証を行っています...');
    console.log(authUrl);
    
    // Windows環境でデフォルトブラウザを開く
    exec(`powershell -NoProfile -Command "Start-Process '${authUrl}'"`);
});
