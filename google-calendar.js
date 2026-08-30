const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const { google } = require('googleapis');
const { exec } = require('child_process');

const SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/youtube'
];
// __dirname を使うことで、開発時もexe起動時も同じ場所にトークンを保存
const TOKEN_PATH = path.join(__dirname, 'token.json');
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

let authClient = null;
let authPromise = null; // 同時に複数の認証フローが走らないようにする

async function authorize(forceCheck = false) {
    // すでにクライアントがあり、forceCheckでなければ返す。forceCheck時はトークン検証を行う。
    if (authClient && fs.existsSync(TOKEN_PATH) && !forceCheck) return true;
    
    // すでにクライアントがあるがforceCheckの場合、トークンの有効性を検証
    if (authClient && fs.existsSync(TOKEN_PATH) && forceCheck) {
        try {
            await authClient.getAccessToken();
            return true;
        } catch (err) {
            console.warn('保存されたトークンが無効または期限切れです。再認証を行います。', err.message);
            authClient = null;
        }
    }

    // 認証フローが進行中なら、それを待つ
    if (authPromise) return authPromise;

    authPromise = (async () => {
        if (!fs.existsSync(CREDENTIALS_PATH)) {
            console.warn('credentials.json not found.');
            return false;
        }
        try {
            const content = fs.readFileSync(CREDENTIALS_PATH);
            const keys = JSON.parse(content);
            const key = keys.installed || keys.web;
            const redirectUri = key.redirect_uris.find(uri => uri.includes('localhost')) || 'http://localhost:3000/oauth2callback';

            authClient = new google.auth.OAuth2(
                key.client_id,
                key.client_secret,
                redirectUri
            );

            if (fs.existsSync(TOKEN_PATH)) {
                const token = fs.readFileSync(TOKEN_PATH);
                authClient.setCredentials(JSON.parse(token));
                try {
                    // トークンの有効性を確認（必要に応じて自動更新も実行）
                    await authClient.getAccessToken();
                    return true;
                } catch (err) {
                    console.warn('保存されたトークンが無効または期限切れです。再認証を行います。', err.message);
                    try {
                        fs.unlinkSync(TOKEN_PATH);
                    } catch (e) {}
                    return await getNewToken(redirectUri);
                }
            } else {
                return await getNewToken(redirectUri);
            }
        } catch (error) {
            console.error('Error in authorize:', error);
            return false;
        } finally {
            authPromise = null;
        }
    })();

    return authPromise;
}

async function getNewToken(redirectUri) {
    return new Promise((resolve, reject) => {
        const authUrl = authClient.generateAuthUrl({
            access_type: 'offline',
            prompt: 'consent', // 常にリフレッシュトークンを取得するように強制
            scope: SCOPES,
        });

        const port = new URL(redirectUri).port || 3000;

        const server = http.createServer(async (req, res) => {
            try {
                if (req.url.indexOf('/oauth2callback') > -1) {
                    const qs = new url.URL(req.url, `http://localhost:${port}`).searchParams;
                    const code = qs.get('code');
                    res.end('Authentication successful! You can close this tab and return to the app.');
                    server.close();
                    
                    const { tokens } = await authClient.getToken(code);
                    authClient.setCredentials(tokens);
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                    console.log('Token stored to', TOKEN_PATH);
                    resolve(true);
                }
            } catch (e) {
                console.error(e);
                server.close();
                resolve(false);
            }
        });

        server.listen(port, () => {
            if (process.platform === 'win32') {
                exec(`powershell -NoProfile -Command "Start-Process '${authUrl}'"`);
            } else if (process.platform === 'darwin') {
                exec(`open "${authUrl}"`);
            } else {
                exec(`xdg-open "${authUrl}"`);
            }
        });
        
        // Timeout after 2 minutes
        setTimeout(() => {
            server.close();
            resolve(false);
        }, 120000);
    });
}

// 予定を作成し、イベントIDを返す
async function createEvent(title, durationSeconds, customStartTime) {
    const authSuccess = await authorize(true);
    if (!authSuccess) return null;
    
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    
    const startTime = customStartTime || new Date();
    // 設定された秒数を加算（指定がなければデフォルト1時間）
    const secondsToAdd = durationSeconds || 3600;
    const endTime = new Date(startTime.getTime() + secondsToAdd * 1000);

    const event = {
        summary: title || 'NeonTimer Task',
        start: { dateTime: startTime.toISOString() },
        end: { dateTime: endTime.toISOString() },
    };

    try {
        const res = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
        });
        console.log('Event created:', res.data.htmlLink);
        return res.data.id;
    } catch (error) {
        console.error('Error creating event:', error);
        return null;
    }
}

// イベントの終了時間を現在時刻で更新する
async function updateEventEndTime(eventId, title) {
    if (!authClient || !eventId) return false;
    
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    
    try {
        // 現在のイベントを取得
        const eventData = await calendar.events.get({
            calendarId: 'primary',
            eventId: eventId,
        });
        
        let event = eventData.data;
        event.end.dateTime = new Date().toISOString(); // 終了時間を現在時刻に
        if (title) event.summary = title; // 題名も更新可能ならする
        
        await calendar.events.update({
            calendarId: 'primary',
            eventId: eventId,
            resource: event,
        });
        console.log('Event updated to end now.');
        return true;
    } catch (error) {
        console.error('Error updating event:', error);
        return false;
    }
}

function getAuthClient() {
    return authClient;
}

function isTokenSaved() {
    const fs = require('fs');
    return fs.existsSync(TOKEN_PATH);
}

module.exports = {
    authorize,
    createEvent,
    updateEventEndTime,
    getAuthClient,
    isTokenSaved
};
