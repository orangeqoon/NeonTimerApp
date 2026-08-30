/**
 * YouTube 12時間ロールオーバー 監視スクリプト
 *
 * 使い方:
 *   node rollover_monitor.js
 *   node rollover_monitor.js --test-in=60   ← 60秒後に強制ロールオーバー（動作テスト用）
 *   node rollover_monitor.js --suffix="（延長）" ← 新枠タイトルに「（延長）」を付ける
 *
 * 前提条件:
 *   - OBSが起動してWebSocket（localhost:4455）が有効であること
 *   - NeonTimerAppでGoogleアカウント認証済みであること（token.jsonが存在すること）
 *   - OBSで配信が開始済みであること
 */

const obsService = require('./obs-service');
const ytLive     = require('./youtube-live');

// --- コマンドライン引数の解析 ---
const args      = process.argv.slice(2);
const testInArg = args.find(a => a.startsWith('--test-in='));
const suffixArg = args.find(a => a.startsWith('--suffix='));

// テスト用: この秒数後に強制ロールオーバー（省略時は 42600秒 = 11時間50分）
const ROLLOVER_THRESHOLD_SEC = testInArg
    ? parseInt(testInArg.split('=')[1], 10)
    : 42600;

// 新しい枠タイトルに付けるサフィックス（省略時は元タイトルをそのまま使用）
const TITLE_SUFFIX = suffixArg ? suffixArg.split('=')[1] : '';

// OBS配信時間チェック間隔（秒: 9分ごと）
const CHECK_INTERVAL_SEC = testInArg ? 5 : 540;

// OBS再開前のYouTube準備待機時間（秒）
const OBS_RESTART_WAIT_SEC = 15;

// ロールオーバー多重実行防止フラグ
let isRollingOver = false;

// -----------------------------------------------

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDuration(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

async function executeRollover() {
    if (isRollingOver) {
        console.log('[Monitor] ロールオーバー処理中のため、スキップします。');
        return;
    }
    isRollingOver = true;
    console.log('\n========================================');
    console.log(' ロールオーバー開始');
    console.log('========================================');

    try {
        // Step 1: OBSの配信を停止
        console.log('[Step 1/4] OBSの配信を停止します...');
        await obsService.stopStream();
        await sleep(3000); // 停止が安定するまで3秒待機

        // Step 2: YouTubeのロールオーバー（枠終了 → 新枠作成 → 配信キー紐付け）
        console.log('[Step 2/4] YouTubeロールオーバーを実行します...');
        const newBroadcastId = await ytLive.rolloverBroadcast(TITLE_SUFFIX);
        console.log(`[Step 2/4] 新しい配信枠が作成されました: ${newBroadcastId}`);

        // Step 3: YouTubeが新しい枠の映像受け入れ準備をするまで待機
        console.log(`[Step 3/4] YouTubeの準備が整うまで ${OBS_RESTART_WAIT_SEC} 秒待機します...`);
        for (let i = OBS_RESTART_WAIT_SEC; i > 0; i--) {
            process.stdout.write(`\r  残り ${i} 秒...  `);
            await sleep(1000);
        }
        process.stdout.write('\n');

        // Step 4: OBSの配信を再開
        console.log('[Step 4/4] OBSの配信を再開します...');
        await obsService.startStream();

        console.log('\n========================================');
        console.log(' ロールオーバー完了！');
        console.log(' YouTube Studioで新しい枠への映像受信を確認してください。');
        console.log('========================================\n');

    } catch (err) {
        console.error('\n[ERROR] ロールオーバー中にエラーが発生しました:', err.message);
        console.error('        手動でOBSの配信を再開してください。');
    } finally {
        isRollingOver = false;
    }
}

async function monitorLoop() {
    console.log('=== YouTube 12時間ロールオーバー 監視スクリプト ===');
    console.log(`  ロールオーバー閾値 : ${formatDuration(ROLLOVER_THRESHOLD_SEC)} (${ROLLOVER_THRESHOLD_SEC}秒)`);
    console.log(`  タイトルサフィックス: "${TITLE_SUFFIX || '（なし）'}"`);
    console.log(`  チェック間隔      : ${CHECK_INTERVAL_SEC}秒`);
    console.log('================================================\n');

    // YouTube認証チェック
    if (!ytLive.isConfigured()) {
        console.error('[ERROR] YouTube認証が完了していません。');
        console.error('        NeonTimerAppを一度起動してGoogleアカウントを認証してください。');
        process.exit(1);
    }
    console.log('[OK] YouTube認証: 確認済み');

    // OBS接続チェック
    console.log('[...] OBSへ接続中...');
    const connected = await obsService.connect();
    if (!connected) {
        console.error('[ERROR] OBSへの接続に失敗しました。');
        console.error('        OBSが起動しているか、WebSocket（localhost:4455）が有効か確認してください。');
        process.exit(1);
    }
    console.log('[OK] OBS: 接続済み');

    // 最初の配信開始チェック
    const initialStatus = await obsService.getStreamStatus();
    if (!initialStatus || !initialStatus.outputActive) {
        console.error('[ERROR] OBSで配信が開始されていません。');
        console.error('        先にOBSから配信を開始してください。');
        process.exit(1);
    }
    console.log('[OK] OBS配信: 実行中\n');
    console.log('監視を開始します。Ctrl+C で停止できます。\n');

    // 監視ループ
    while (true) {
        await sleep(CHECK_INTERVAL_SEC * 1000);

        if (isRollingOver) continue;

        const status = await obsService.getStreamStatus();

        if (!status) {
            console.warn('[Monitor] OBSからステータスを取得できませんでした（接続断の可能性）。');
            continue;
        }

        if (!status.outputActive) {
            console.log('[Monitor] OBSの配信が停止中です。ロールオーバーは行いません。');
            continue;
        }

        const elapsedSec = Math.floor(status.outputDuration / 1000);
        const remaining  = ROLLOVER_THRESHOLD_SEC - elapsedSec;

        if (remaining > 300) {
            // 残り5分より多い場合は簡潔にログ
            process.stdout.write(`\r[Monitor] 配信時間: ${formatDuration(elapsedSec)} / ロールオーバーまで残り: ${formatDuration(remaining)}  `);
        } else if (remaining > 0) {
            // 残り5分以内は警告
            console.log(`\n[Monitor] ⚠️  ロールオーバーまで残り ${remaining} 秒！`);
        } else {
            // 閾値超過 → ロールオーバー実行
            console.log(`\n[Monitor] 配信時間 ${formatDuration(elapsedSec)} が閾値を超えました。ロールオーバーを開始します。`);
            await executeRollover();
        }
    }
}

// プロセス終了時にOBSとの接続を切断
process.on('SIGINT', async () => {
    console.log('\n\n[Monitor] 停止シグナルを受信しました。OBSとの接続を切断します...');
    await obsService.disconnect();
    console.log('[Monitor] 終了しました。');
    process.exit(0);
});

monitorLoop();
