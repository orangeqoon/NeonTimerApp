/**
 * YouTube Live API テスト
 * 実行方法: node test-youtube.js
 */
const path = require('path');
const { google } = require('googleapis');
const fs = require('fs');

const TOKEN_PATH_OPTIONS = [
    path.join(__dirname, 'token.json'),
    path.join(process.env.APPDATA || '', 'neon-timer-compact', 'token.json'),
    path.join(process.env.APPDATA || '', 'NeonTimer', 'token.json'),
    path.join(process.env.APPDATA || '', 'Electron', 'token.json'),
];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

console.log('=== YouTube Live API テスト ===\n');

// トークンを探す
let tokenPath = null;
let tokenData = null;
for (const p of TOKEN_PATH_OPTIONS) {
    if (fs.existsSync(p)) {
        console.log('✅ トークンファイルが見つかりました:', p);
        tokenPath = p;
        tokenData = JSON.parse(fs.readFileSync(p));
        console.log('  スコープ:', tokenData.scope || '(スコープ情報なし)');
        break;
    }
}

if (!tokenPath) {
    console.log('❌ トークンファイルが見つかりません。以下のパスを確認しました:');
    TOKEN_PATH_OPTIONS.forEach(p => console.log('  -', p));
    process.exit(1);
}

if (!fs.existsSync(CREDENTIALS_PATH)) {
    console.log('❌ credentials.json が見つかりません:', CREDENTIALS_PATH);
    process.exit(1);
}
console.log('✅ credentials.json が見つかりました\n');

// YouTube API を試す
(async () => {
    const keys = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const key = keys.installed || keys.web;
    const redirectUri = key.redirect_uris.find(u => u.includes('localhost')) || key.redirect_uris[0];

    const authClient = new google.auth.OAuth2(key.client_id, key.client_secret, redirectUri);
    authClient.setCredentials(tokenData);

    const yt = google.youtube({ version: 'v3', auth: authClient });

    console.log('--- ライブ配信枠を検索中... ---');
    for (const status of ['active', 'upcoming']) {
        try {
            const res = await yt.liveBroadcasts.list({
                part: ['snippet', 'status'],
                broadcastStatus: status,
                broadcastType: 'all',
                mine: true,
                maxResults: 5
            });
            const items = res.data.items || [];
            console.log(`[${status}] ${items.length}件見つかりました`);
            items.forEach(b => {
                console.log(`  ID: ${b.id}, タイトル: "${b.snippet.title}", 状態: ${b.status?.lifeCycleStatus}`);
            });
        } catch (e) {
            console.error(`[${status}] エラー:`, e.message);
            if (e.message.includes('insufficientPermissions') || e.message.includes('forbidden')) {
                console.log('  → YouTubeのスコープが含まれていません。token.jsonを削除して再認証が必要です。');
            }
        }
    }
})().catch(e => {
    console.error('致命的エラー:', e.message);
});
