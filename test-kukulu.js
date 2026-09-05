const kukuluApi = require('./kukulu');

console.log('--- Testing KukuluLIVE API Integration ---');
console.log('isConfigured():', kukuluApi.isConfigured());

if (!kukuluApi.isConfigured()) {
    console.log('【未設定】kukulu-config.json が見つからないか、APIキーが未入力です。');
    console.log('kukulu-config.json を NeonTimerApp フォルダに配置してください。');
    process.exit(0);
}

// If configured, test port info and update
async function test() {
    try {
        console.log('1. 現在の配信枠情報を取得中 (port_info)...');
        const info = await kukuluApi.getPortInfo();
        console.log('枠情報:', info);

        console.log('2. タイトル更新をテスト中...');
        const res = await kukuluApi.updateStream('Test Title from NeonTimerApp');
        console.log('更新成功:', res);
    } catch (e) {
        console.error('テスト失敗:', e.message);
    }
}

test();
