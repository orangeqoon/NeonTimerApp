// 1. 必要な機能を読み込む（一番ミスの少ない書き方に変更）
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// ウィンドウ状態を保存するファイルのパス
function getWindowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

// 保存されたウィンドウ状態を読み込む
function loadWindowState() {
  try {
    const data = fs.readFileSync(getWindowStateFile(), 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return null; // ファイルが無い場合などは null を返す
  }
}

let saveStateTimeout = null;

// ウィンドウ状態を保存する
function saveWindowState(win, immediate = false) {
  if (saveStateTimeout) clearTimeout(saveStateTimeout);
  
  const writeState = () => {
    try {
      if (win && !win.isDestroyed()) {
        const bounds = win.getBounds();
        fs.writeFileSync(getWindowStateFile(), JSON.stringify(bounds));
      }
    } catch (e) {
      console.error('Failed to save window state:', e);
    }
  };

  if (immediate) {
    writeState();
  } else {
    saveStateTimeout = setTimeout(writeState, 500);
  }
}

// 2. ウィンドウを作る関数
function createWindow () {
  const savedState = loadWindowState();
  
  const winOptions = {
    width: savedState?.width || 196,     // 横幅 (280 * 0.7)
    height: savedState?.height || 126,    // 高さ (180 * 0.7)
    frame: false,   // 枠を消す
    transparent: true, // 背景を透明に
    resizable: true,  // サイズ可変
    alwaysOnTop: true, // 常に最前面
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false // 裏に行っても止まらないように
    }
  };

  if (savedState?.x !== undefined && savedState?.y !== undefined) {
    winOptions.x = savedState.x;
    winOptions.y = savedState.y;
  }

  const win = new BrowserWindow(winOptions);

  // ウィンドウが閉じられる前、および移動・リサイズ時に状態を保存する
  win.on('close', () => {
    saveWindowState(win, true);
  });
  win.on('resize', () => saveWindowState(win, false));
  win.on('move', () => saveWindowState(win, false));

  let isDragging = false;
  let dragSize = { width: winOptions.width, height: winOptions.height };

  ipcMain.on('drag-start', () => {
    if (win && !win.isDestroyed()) {
      isDragging = true;
      const size = win.getSize();
      dragSize = { width: size[0], height: size[1] };
    }
  });

  ipcMain.on('drag-end', () => {
    isDragging = false;
  });

  ipcMain.on('move-window', (event, pos) => {
    if (win && !win.isDestroyed()) {
      if (!isDragging) {
        const size = win.getSize();
        dragSize = { width: size[0], height: size[1] };
      }
      win.setBounds({
        x: pos.x,
        y: pos.y,
        width: dragSize.width,
        height: dragSize.height
      });
    }
  });

  // index.html を読み込む
  win.loadFile('index.html');
}

// 3. アプリの準備ができたらウィンドウを作る
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 4. 全てのウィンドウが閉じられたら終了する（Windows用）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});