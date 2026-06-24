// YouTube Live stream title update for NeonTimerApp
// google-calendar.js と同じ authClient を共有する

const { google } = require('googleapis');
const googleCalendar = require('./google-calendar');

async function updateLiveTitle(title) {
    // google-calendar.js の authorize() を呼んで authClient を確保
    const authSuccess = await googleCalendar.authorize();
    if (!authSuccess) {
        throw new Error('Google認証が完了していません。タイマーを使って一度カレンダー認証を行ってください。');
    }

    // google-calendar モジュールの authClient を取得
    const auth = googleCalendar.getAuthClient();
    if (!auth) throw new Error('authClientが取得できませんでした。');

    const yt = google.youtube({ version: 'v3', auth });

    // アクティブな配信を検索
    let broadcast = null;

    // 1. まず「配信中(active)」または「開始前(upcoming)」を探す
    for (const status of ['active', 'upcoming']) {
        try {
            const res = await yt.liveBroadcasts.list({
                part: ['snippet'],
                broadcastStatus: status,
                broadcastType: 'all',
                maxResults: 5
            });
            const items = res.data.items || [];
            if (items.length > 0) {
                broadcast = items[0];
                console.log(`[YT] Found ${status} broadcast: ${broadcast.id} - ${broadcast.snippet.title}`);
                break;
            }
        } catch (error) {
            console.error(`[YT] Error searching for ${status} broadcast:`, error.message);
        }
    }

    // 2. それでも見つからない場合、mine=true で直近のものを探す
    if (!broadcast) {
        try {
            const res = await yt.liveBroadcasts.list({
                part: ['snippet'],
                mine: true,
                maxResults: 5
            });
            const items = res.data.items || [];
            if (items.length > 0) {
                broadcast = items[0];
                console.log(`[YT] Found broadcast with mine=true: ${broadcast.id} - ${broadcast.snippet.title}`);
            }
        } catch (error) {
            console.error('[YT] Error searching with mine=true:', error.message);
        }
    }

    if (!broadcast) {
        throw new Error('YouTubeに有効な配信枠が見つかりませんでした。YouTube Studioで配信枠を作成してください。');
    }

    const snippet = broadcast.snippet;
    const oldTitle = snippet.title;
    snippet.title = title;

    await yt.liveBroadcasts.update({
        part: ['snippet'],
        requestBody: {
            id: broadcast.id,
            snippet
        }
    });

    console.log(`[YT] Title updated: "${oldTitle}" -> "${title}"`);
}

/**
 * 配信枠を終了し、新しい枠を作成して配信キーを紐付け直す
 */
async function rolloverBroadcast(title, description = "") {
    const auth = googleCalendar.getAuthClient();
    if (!auth) throw new Error('authClientが取得できませんでした。');

    const yt = google.youtube({ version: 'v3', auth });

    // 1. アクティブな放送を取得
    const activeRes = await yt.liveBroadcasts.list({
        part: ['snippet', 'contentDetails', 'status'],
        broadcastStatus: 'active',
        broadcastType: 'all'
    });

    const activeBroadcast = (activeRes.data.items || [])[0];
    if (!activeBroadcast) {
        console.warn('[YT] No active broadcast found for rollover.');
        return null;
    }

    const broadcastId = activeBroadcast.id;
    const streamId = activeBroadcast.contentDetails.boundStreamId;
    const privacyStatus = activeBroadcast.status.privacyStatus;
    
    console.log(`[YT] Rollover: Ending broadcast ${broadcastId}...`);

    // 2. 現在の放送を「完了」にする
    await yt.liveBroadcasts.transition({
        id: broadcastId,
        broadcastStatus: 'complete',
        part: ['id']
    });

    // 3. 新しい放送枠を作成
    console.log(`[YT] Rollover: Creating new broadcast: ${title}...`);
    const insertRes = await yt.liveBroadcasts.insert({
        part: ['snippet', 'status', 'contentDetails'],
        requestBody: {
            snippet: {
                title: title,
                description: description || activeBroadcast.snippet.description,
                scheduledStartTime: new Date(Date.now() + 10000).toISOString()
            },
            status: {
                privacyStatus: privacyStatus
            },
            contentDetails: {
                enableAutoStart: true,
                enableAutoStop: true
            }
        }
    });

    const newBroadcastId = insertRes.data.id;

    // 4. 配信キーを紐付け
    console.log(`[YT] Rollover: Binding stream ${streamId} to new broadcast ${newBroadcastId}...`);
    await yt.liveBroadcasts.bind({
        id: newBroadcastId,
        streamId: streamId,
        part: ['id']
    });

    return newBroadcastId;
}

function isConfigured() {
    return googleCalendar.isTokenSaved();
}

module.exports = { updateLiveTitle, rolloverBroadcast, isConfigured };
