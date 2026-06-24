const OBSWebSocket = require('obs-websocket-js').default;
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'obs-config.json');

class OBSService {
    constructor() {
        this.obs = new OBSWebSocket();
        this.isConnected = false;
        this.config = this.loadConfig();
    }

    loadConfig() {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
        return {
            host: 'localhost',
            port: 4455,
            password: '',
            hotkeyId: 'OBS_KEY_F24'
        };
    }

    saveConfig(config) {
        this.config = { ...this.config, ...config };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
    }

    async connect() {
        try {
            const { host, port, password } = this.config;
            await this.obs.connect(`ws://${host}:${port}`, password);
            this.isConnected = true;
            console.log('[OBS] Connected');
            return true;
        } catch (error) {
            console.error('[OBS] Connection failed:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async disconnect() {
        if (this.isConnected) {
            await this.obs.disconnect();
            this.isConnected = false;
        }
    }

    async getStreamStatus() {
        if (!this.isConnected) {
            const success = await this.connect();
            if (!success) return null;
        }
        try {
            const status = await this.obs.call('GetStreamStatus');
            return status;
        } catch (error) {
            console.error('[OBS] Failed to get stream status:', error.message);
            this.isConnected = false; // Assume disconnected on error
            return null;
        }
    }

    async stopStream() {
        if (!this.isConnected) await this.connect();
        try {
            await this.obs.call('StopStream');
            console.log('[OBS] Stream stopped');
        } catch (error) {
            console.error('[OBS] Failed to stop stream:', error.message);
        }
    }

    async startStream() {
        if (!this.isConnected) await this.connect();
        try {
            await this.obs.call('StartStream');
            console.log('[OBS] Stream started');
        } catch (error) {
            console.error('[OBS] Failed to start stream:', error.message);
        }
    }

    async triggerHotkey(keyId) {
        if (!this.isConnected) await this.connect();
        try {
            await this.obs.call('TriggerHotkeyBySequence', {
                keyId: keyId || this.config.hotkeyId
            });
            console.log(`[OBS] Hotkey triggered: ${keyId || this.config.hotkeyId}`);
        } catch (error) {
            console.error('[OBS] Failed to trigger hotkey:', error.message);
        }
    }
}

module.exports = new OBSService();
