/* --- データ管理 --- */
const defaultPresets = [0, 0, 0, 0, 0, 0];
const presetSteps = [300, 900, 1800, 3600, 3600, 3600]; // 5m, 15m, 30m, 1h, 1h, 1h
let presetData = JSON.parse(localStorage.getItem('neonTimerPresets')) || defaultPresets;
if (presetData.length !== 6) presetData = defaultPresets;

/* --- 変数定義 --- */
let countdownInterval;
let totalSeconds = 0;
let remainingSeconds = 0;
let isRunning = false;
const COUNTUP_CALENDAR_THRESHOLD = 900; // 15 minutes (in seconds)

const timerDisplay = document.getElementById('timer-display');
const progressBar = document.getElementById('progress-bar');
const presetList = document.getElementById('preset-list');
const modeToggleBtn = document.getElementById('mode-toggle');
const pauseDurationDisplay = document.getElementById('pause-duration');
const progressWrapper = document.getElementById('progress-wrapper');
const taskTitleInput = document.getElementById('task-title');
const countupWrapper = document.getElementById('countup-wrapper');
const countupDisplay = document.getElementById('countup-display');
const categoryInput = document.getElementById('category-input');
const categorySuggestions = document.getElementById('category-suggestions');
const saveCategoryBtn = document.getElementById('save-category-btn');
const fontBtn = document.getElementById('font-btn');
const fontDialog = document.getElementById('font-dialog');
const fontPreviewList = document.getElementById('font-preview-list');
const fontSizeInput = document.getElementById('font-size-input');
const fontCancel = document.getElementById('font-cancel');
const fontApply = document.getElementById('font-apply');

const titleRow = document.querySelector('.title-row');
const timerLetterSpacingInput = document.getElementById('timer-letter-spacing-input');
const timerFontSizeInput = document.getElementById('timer-font-size-input');
const appZoomInput = document.getElementById('app-zoom-input');

const favoriteTitlesBtn = document.getElementById('favorite-titles-btn');
const saveTitleBtn = document.getElementById('save-title-btn');
const favoriteTitlesDialog = document.getElementById('favorite-titles-dialog');
const favoriteTitlesList = document.getElementById('favorite-titles-list');
const closeTitlesDialog = document.getElementById('close-titles-dialog');

const favoriteCategoriesBtn = document.getElementById('favorite-categories-btn');
const favoriteCategoriesDialog = document.getElementById('favorite-categories-dialog');
const favoriteCategoriesList = document.getElementById('favorite-categories-list');
const closeCategoriesDialog = document.getElementById('close-categories-dialog');

// テキストエリアの自動リサイズ
taskTitleInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = this.scrollHeight + 'px';
});

const { createEvent, updateEventEndTime, authorize } = require('./google-calendar');
const twitchApi = require('./twitch');
const ytLive = require('./youtube-live');
const kickApi = require('./kick');
const { exec } = require('child_process');

// アプリ起動時にGoogleログイン状態を事前にチェック＆検証
authorize(true).catch(console.error);

// 起動時に保存されたフォント・サイズを適用
let selectedFontName = localStorage.getItem('neonTimerFont') || '';
if (selectedFontName) {
    document.documentElement.style.setProperty('--font-family', `"${selectedFontName}", Orbitron, sans-serif`);
    document.documentElement.style.setProperty('--font-mono', `"${selectedFontName}", "Courier New", Courier, monospace`);
}
const savedFontSize = localStorage.getItem('neonTimerFontSize');
if (savedFontSize) {
    taskTitleInput.style.fontSize = savedFontSize + 'px';
}
const savedLetterSpacing = localStorage.getItem('neonTimerLetterSpacing');
if (savedLetterSpacing) {
    timerDisplay.style.letterSpacing = savedLetterSpacing + 'px';
    countupDisplay.style.letterSpacing = savedLetterSpacing + 'px';
    if(timerLetterSpacingInput) timerLetterSpacingInput.value = savedLetterSpacing;
}
const savedTimerFontSize = localStorage.getItem('neonTimerTimerFontSize') || '55';
document.documentElement.style.setProperty('--timer-font-size', savedTimerFontSize + 'px');

const savedZoom = localStorage.getItem('neonTimerZoom') || '1.0';
document.documentElement.style.setProperty('--app-zoom', savedZoom);

setTimeout(() => {
    taskTitleInput.style.height = 'auto';
    taskTitleInput.style.height = taskTitleInput.scrollHeight + 'px';
}, 100);

// お気に入りカテゴリの管理
function getSavedCategories() {
    return JSON.parse(localStorage.getItem('twitchFavoriteCategories') || '[]');
}
function saveCategory(name) {
    if (!name) return;
    const cats = getSavedCategories();
    if (!cats.includes(name)) cats.unshift(name);
    if (cats.length > 50) cats.pop();
    localStorage.setItem('twitchFavoriteCategories', JSON.stringify(cats));
}
function renderCategorySuggestions() {
    const saved = getSavedCategories();
    categorySuggestions.innerHTML = saved.map(c => `<option value="${c}">`).join('');
}
function updateSaveCategoryBtnState() {
    const val = categoryInput.value.trim();
    const cats = getSavedCategories();
    if (val && cats.includes(val)) {
        saveCategoryBtn.textContent = '★';
        saveCategoryBtn.style.color = '#ffcc00';
    } else {
        saveCategoryBtn.textContent = '☆';
        saveCategoryBtn.style.color = '';
    }
}
renderCategorySuggestions();
updateSaveCategoryBtnState();

saveCategoryBtn.addEventListener('click', () => {
    const val = categoryInput.value.trim();
    if (!val) return;
    const cats = getSavedCategories();
    if (cats.includes(val)) {
        const newCats = cats.filter(c => c !== val);
        localStorage.setItem('twitchFavoriteCategories', JSON.stringify(newCats));
        renderCategorySuggestions();
        updateSaveCategoryBtnState();
    } else {
        saveCategory(val);
        renderCategorySuggestions();
        updateSaveCategoryBtnState();
    }
});

function openFavoriteCategoriesDialog() {
    const cats = getSavedCategories();
    favoriteCategoriesList.innerHTML = '';
    cats.forEach(c => {
        const btn = document.createElement('button');
        btn.textContent = c;
        btn.style.padding = '8px';
        btn.style.background = '#333';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #555';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'left';
        btn.onclick = () => {
            categoryInput.value = c;
            updateSaveCategoryBtnState();
            favoriteCategoriesDialog.close();
            
            // すぐに配信APIに反映
            const title = taskTitleInput.value.trim();
            startStreamingApis(title, c);
        };
        favoriteCategoriesList.appendChild(btn);
    });
    favoriteCategoriesDialog.showModal();
}

favoriteCategoriesBtn.addEventListener('click', openFavoriteCategoriesDialog);
closeCategoriesDialog.addEventListener('click', () => favoriteCategoriesDialog.close());

// 題名のお気に入り管理
function getSavedTitles() {
    return JSON.parse(localStorage.getItem('neonTimerFavoriteTitles') || '[]');
}
function saveTitle(title) {
    if (!title) return;
    const titles = getSavedTitles();
    if (!titles.includes(title)) titles.unshift(title);
    if (titles.length > 50) titles.pop();
    localStorage.setItem('neonTimerFavoriteTitles', JSON.stringify(titles));
}
function updateSaveTitleBtnState() {
    const val = taskTitleInput.value.trim();
    const titles = getSavedTitles();
    if (val && titles.includes(val)) {
        saveTitleBtn.textContent = '★';
        saveTitleBtn.style.color = '#ffcc00';
    } else {
        saveTitleBtn.textContent = '☆';
        saveTitleBtn.style.color = '#aaa';
    }
}
taskTitleInput.addEventListener('input', updateSaveTitleBtnState);
updateSaveTitleBtnState();

saveTitleBtn.addEventListener('click', () => {
    const val = taskTitleInput.value.trim();
    if (!val) return;
    const titles = getSavedTitles();
    if (titles.includes(val)) {
        const newTitles = titles.filter(t => t !== val);
        localStorage.setItem('neonTimerFavoriteTitles', JSON.stringify(newTitles));
        updateSaveTitleBtnState();
    } else {
        saveTitle(val);
        updateSaveTitleBtnState();
    }
});

function openFavoriteTitlesDialog() {
    const titles = getSavedTitles();
    favoriteTitlesList.innerHTML = '';
    titles.forEach(t => {
        const btn = document.createElement('button');
        btn.textContent = t;
        btn.style.padding = '8px';
        btn.style.background = '#333';
        btn.style.color = '#fff';
        btn.style.border = '1px solid #555';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.textAlign = 'left';
        btn.onclick = () => {
            taskTitleInput.value = t;
            taskTitleInput.style.height = 'auto';
            taskTitleInput.style.height = taskTitleInput.scrollHeight + 'px';
            updateSaveTitleBtnState();
            favoriteTitlesDialog.close();
            
            // すぐに配信APIに反映
            const cat = categoryInput.value.trim();
            startStreamingApis(t, cat);
        };
        favoriteTitlesList.appendChild(btn);
    });
    favoriteTitlesDialog.showModal();
}

favoriteTitlesBtn.addEventListener('click', openFavoriteTitlesDialog);
closeTitlesDialog.addEventListener('click', () => favoriteTitlesDialog.close());

// Twitchサジェスト機能とお気に入り表示
let suggestTimeout;
categoryInput.addEventListener('focus', () => {
    const query = categoryInput.value.trim();
    if (query.length < 2) {
        renderCategorySuggestions();
    }
    updateSaveCategoryBtnState();
});

categoryInput.addEventListener('input', () => {
    updateSaveCategoryBtnState();
    const query = categoryInput.value.trim();
    if (query.length < 2) {
        clearTimeout(suggestTimeout);
        renderCategorySuggestions();
        return;
    }
    
    clearTimeout(suggestTimeout);
    suggestTimeout = setTimeout(() => {
        if (twitchApi && twitchApi.isConfigured()) {
            twitchApi.getSuggestions(query)
                .then(categories => {
                    categorySuggestions.innerHTML = categories.map(c => `<option value="${c}">`).join('');
                })
                .catch(console.error);
        }
    }, 500);
});

let timerMode = 'countdown'; 
let countupSeconds = 0;
let countupInterval;

// Custom Window Dragging Logic
let isDraggingWindow = false;
let startMousePos = { x: 0, y: 0 };
let startWindowPos = { x: 0, y: 0 };
let startWindowSize = { width: 0, height: 0 };
const { ipcRenderer } = require('electron');

document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    const isInteractive = e.target.tagName === 'INPUT' || 
                          e.target.tagName === 'TEXTAREA' || 
                          e.target.tagName === 'BUTTON' || 
                          e.target.closest('button') ||
                          e.target.closest('.adjust-btns') || 
                          e.target.closest('dialog') ||
                          e.target.closest('.no-drag');
                          
    if (!isInteractive) {
        isDraggingWindow = true;
        startMousePos = { x: e.screenX, y: e.screenY };
        startWindowPos = { x: window.screenX, y: window.screenY };
        ipcRenderer.send('drag-start');
    }
});

document.addEventListener('mousemove', (e) => {
    if (isDraggingWindow) {
        const dx = e.screenX - startMousePos.x;
        const dy = e.screenY - startMousePos.y;
        ipcRenderer.send('move-window', { 
            x: startWindowPos.x + dx, 
            y: startWindowPos.y + dy
        });
    }
});

document.addEventListener('mouseup', () => {
    if (isDraggingWindow) {
        isDraggingWindow = false;
        ipcRenderer.send('drag-end');
    }
});

function formatTime(s) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map(v => v.toString().padStart(2, '0')).join(':');
}

function updateDisplay() {
    const h = Math.floor(remainingSeconds / 3600);
    const m = Math.floor((remainingSeconds % 3600) / 60);
    const s = remainingSeconds % 60;
    
    if (h > 0) {
        timerDisplay.textContent = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    } else {
        timerDisplay.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    
    const progress = totalSeconds > 0 ? (remainingSeconds / totalSeconds) * 100 : 0;
    progressBar.style.width = `${Math.min(100, progress)}%`;
    
    if (remainingSeconds <= 0) {
        progressBar.classList.add('time-up-bar');
    } else {
        progressBar.classList.remove('time-up-bar');
        timerDisplay.style.color = '';
        timerDisplay.style.textShadow = '';
    }
}

function renderPresets() {
    presetList.innerHTML = '';
    presetData.forEach((seconds, i) => {
        const item = document.createElement('div');
        item.className = `preset-item p${i + 1} no-drag`;
        
        const label = document.createElement('div');
        label.className = 'label';
        if (seconds === 0) {
            label.textContent = 'SET';
        } else {
            if (i < 3) {
                // 左側3つ: 分表示
                label.textContent = Math.floor(seconds / 60);
            } else {
                // 右側3つ: 時間表示 (1桁)
                label.textContent = Math.floor(seconds / 3600);
            }
        }
        
        const btns = document.createElement('div');
        btns.className = 'adjust-btns';
        
        const up = document.createElement('button');
        up.textContent = '▲';
        up.onclick = (e) => { e.stopPropagation(); adjustPreset(i, presetSteps[i]); };
        
        const down = document.createElement('button');
        down.textContent = '▼';
        down.onclick = (e) => { e.stopPropagation(); adjustPreset(i, -presetSteps[i]); };
        
        btns.appendChild(up);
        btns.appendChild(down);
        
        item.appendChild(label);
        item.appendChild(btns);
        
        item.onclick = () => {
            if (seconds > 0) {
                // 1. カウントアップまたは実行中のタイマーがあれば安全に停止・終了
                if (isRunning) {
                    if (timerMode === 'countdown') stopTimer();
                    else stopCountup();
                }
                finalizeEvent();

                // 2. カウントアップ状態の完全リセットと非表示化
                countupSeconds = 0;
                countupDisplay.textContent = "00:00:00";
                countupDisplay.classList.add('hidden');

                // 3. カウントダウンモード表示への差し替えと進捗バーの初期化
                timerMode = 'countdown';
                progressWrapper.classList.remove('hidden');
                progressBar.classList.remove('time-up-bar');
                modeToggleBtn.innerHTML = '<span class="material-icons">timer</span>';

                // 4. 数字の暗さ（paused）、透過（dimmed-background）を完全にクリア
                timerDisplay.classList.remove('paused', 'dimmed-background');
                timerDisplay.style.color = '';
                timerDisplay.style.textShadow = '';

                // 5. 新しい秒数をセットして開始
                totalSeconds = seconds;
                remainingSeconds = seconds;
                updateDisplay();
                startTimer();
            }
        };
        
        presetList.appendChild(item);
    });
}

function adjustPreset(index, delta) {
    presetData[index] = Math.max(0, presetData[index] + delta);
    localStorage.setItem('neonTimerPresets', JSON.stringify(presetData));
    renderPresets();
}

let pauseInterval;
let pauseSeconds = 0;

function startTimer() {
    if (isRunning) return;
    if (remainingSeconds <= 0) return;
    isRunning = true;
    timerDisplay.classList.remove('paused', 'dimmed-background'); // 動作中は「停止中」および「背景透過」の見た目を解除する
    stopPauseTimer();
    pauseDurationDisplay.classList.add('hidden');

    const title = taskTitleInput.value.trim();
    const category = categoryInput.value.trim();
    
    const duration = remainingSeconds;
    currentEventTitle = title;
    
    startStreamingApis(title, category);
    
    if (lastEventId && lastEventTitle === title && (Date.now() - lastEventEndTime) <= MAX_MERGE_GAP_MS) {
        currentEventId = lastEventId;
        if (!isRunning || remainingSeconds <= 0) finalizeEvent();
    } else {
        createEvent(title, duration).then(id => {
            currentEventId = id;
            if (!isRunning || remainingSeconds <= 0) finalizeEvent();
        }).catch(console.error);
    }

    countdownInterval = setInterval(() => {
        if (remainingSeconds <= 0) {
            timeUp();
            return;
        }

        remainingSeconds--;
        updateDisplay();
        
        if (remainingSeconds <= 0) {
            timeUp();
        }
    }, 1000);
}

let currentEventId = null;
let currentEventTitle = '';
let lastEventId = null;
let lastEventTitle = '';
let lastEventEndTime = 0;
const MAX_MERGE_GAP_MS = 10 * 60 * 1000; // 10 minutes

async function finalizeEvent() {
    const id = currentEventId;
    const title = currentEventTitle;
    if (id) {
        lastEventId = id;
        lastEventTitle = title;
        lastEventEndTime = Date.now();
        currentEventId = null;
        currentEventTitle = '';
        await updateEventEndTime(id, title);
    }
}

function timeUp() {
    stopTimer();
    stopPauseTimer();
    finalizeEvent();
    
    progressBar.classList.add('time-up-bar');

    // 自動でカウントアップを開始
    if (timerMode === 'countdown') {
        timerMode = 'countup';
        timerDisplay.classList.add('dimmed-background');
        progressWrapper.classList.add('hidden');
        countupDisplay.classList.remove('hidden');
        modeToggleBtn.innerHTML = '<span class="material-icons">hourglass_empty</span>';
        startCountup();
    }
    
    timerDisplay.style.color = '#ff4500';
    timerDisplay.style.textShadow = '0 0 10px #ff4500';
    progressBar.classList.add('time-up-bar');
    progressBar.style.width = '100%';
    // timerDisplay.classList.remove('paused'); // 終了時も停止中の見た目を維持
}

function stopTimer() {
    isRunning = false;
    clearInterval(countdownInterval);
    timerDisplay.classList.add('paused');
    startPauseTimer();
    finalizeEvent();
}

timerDisplay.onclick = () => {
    if (timerMode === 'countdown') {
        if (isRunning) stopTimer();
        else if (totalSeconds > 0) startTimer();
    } else {
        if (isRunning) stopCountup();
        else startCountup();
    }
};

modeToggleBtn.onclick = () => {
    if (timerMode === 'countdown') {
        timerMode = 'countup';
        timerDisplay.classList.add('dimmed-background');
        progressWrapper.classList.add('hidden');
        countupDisplay.classList.remove('hidden');
        modeToggleBtn.innerHTML = '<span class="material-icons">hourglass_empty</span>';
    } else {
        timerMode = 'countdown';
        timerDisplay.classList.remove('dimmed-background');
        progressWrapper.classList.remove('hidden');
        countupDisplay.classList.add('hidden');
        modeToggleBtn.innerHTML = '<span class="material-icons">timer</span>';
    }
};

function startCountup() {
    if (isRunning) return;
    isRunning = true;
    countupDisplay.classList.remove('paused');
    
    const title = taskTitleInput.value.trim();
    const category = categoryInput.value.trim();
    currentEventTitle = title;
    startStreamingApis(title, category);

    countupInterval = setInterval(() => {
        countupSeconds++;
        countupDisplay.textContent = formatTime(countupSeconds);
        
        if (countupSeconds === COUNTUP_CALENDAR_THRESHOLD && !currentEventId) {
            const startTime = new Date(Date.now() - COUNTUP_CALENDAR_THRESHOLD * 1000);
            const gap = startTime.getTime() - lastEventEndTime;
            if (lastEventId && lastEventTitle === currentEventTitle && gap <= MAX_MERGE_GAP_MS) {
                currentEventId = lastEventId;
            } else {
                createEvent(currentEventTitle, null, startTime).then(id => {
                    currentEventId = id;
                }).catch(console.error);
            }
        }
    }, 1000);
}

function stopCountup() {
    isRunning = false;
    clearInterval(countupInterval);
    countupDisplay.classList.add('paused');
    finalizeEvent();
}


renderPresets();
updateDisplay();

let fontsLoaded = false;
fontBtn.addEventListener('click', () => {
    fontDialog.showModal();
    const currentTitleSize = localStorage.getItem('neonTimerFontSize') || '24';
    if (fontSizeInput) fontSizeInput.value = currentTitleSize;
    const currentTimerSize = localStorage.getItem('neonTimerTimerFontSize') || '55';
    if (timerFontSizeInput) timerFontSizeInput.value = currentTimerSize;
    const currentZoom = localStorage.getItem('neonTimerZoom') || '1.0';
    if (appZoomInput) appZoomInput.value = currentZoom;
    const currentLetterSpacing = localStorage.getItem('neonTimerLetterSpacing') || '-2';
    if (timerLetterSpacingInput) timerLetterSpacingInput.value = currentLetterSpacing;
    
    if (!fontsLoaded) {
        fontPreviewList.innerHTML = '<div style="padding: 10px; text-align: center; color: #888;">読込中...</div>';
        exec('chcp 65001 >nul & REG QUERY "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts"', { encoding: 'utf8' }, (err, stdout) => {
            if (!err) {
                const fonts = [];
                const lines = stdout.split('\n');
                lines.forEach(line => {
                    const match = line.match(/^\s+(.+)\s+\(TrueType\)/);
                    if (match && match[1]) {
                        let name = match[1].trim();
                        if (name.includes(' Bold') || name.includes(' Italic') || name.includes(' Light') || name.includes(' Black')) return;
                        if (!fonts.includes(name)) fonts.push(name);
                    }
                });
                
                const jpFonts = ['Meiryo', 'Yu Gothic', 'MS Gothic', 'MS Mincho', 'BIZ UDGothic', 'BIZ UDMincho', 'UD Digi Kyokasho', 'メイリオ', '游ゴシック'];
                fonts.sort((a, b) => {
                    const aJp = jpFonts.some(j => a.includes(j)) || a.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);
                    const bJp = jpFonts.some(j => b.includes(j)) || b.match(/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/);
                    if (aJp && !bJp) return -1;
                    if (!aJp && bJp) return 1;
                    return a.localeCompare(b);
                });
                
                fontPreviewList.innerHTML = '';
                fonts.forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'font-item';
                    if (f === selectedFontName) div.classList.add('selected');
                    div.style.fontFamily = `"${f}", sans-serif`;
                    div.textContent = f;
                    div.onclick = () => {
                        document.querySelectorAll('.font-item').forEach(el => el.classList.remove('selected'));
                        div.classList.add('selected');
                        selectedFontName = f;
                    };
                    fontPreviewList.appendChild(div);
                });
                fontsLoaded = true;
            }
        });
    }
});

fontCancel.addEventListener('click', () => fontDialog.close());
fontApply.addEventListener('click', () => {
    if (selectedFontName) {
        document.documentElement.style.setProperty('--font-family', `"${selectedFontName}", Orbitron, sans-serif`);
        document.documentElement.style.setProperty('--font-mono', `"${selectedFontName}", "Courier New", Courier, monospace`);
        localStorage.setItem('neonTimerFont', selectedFontName);
    }
    const size = fontSizeInput.value;
    if (size) {
        taskTitleInput.style.fontSize = size + 'px';
        localStorage.setItem('neonTimerFontSize', size);
    }
    const timerSize = timerFontSizeInput.value;
    if (timerSize) {
        document.documentElement.style.setProperty('--timer-font-size', timerSize + 'px');
        localStorage.setItem('neonTimerTimerFontSize', timerSize);
    }
    const zoomVal = appZoomInput.value;
    if (zoomVal) {
        document.documentElement.style.setProperty('--app-zoom', zoomVal);
        localStorage.setItem('neonTimerZoom', zoomVal);
    }
    const spacing = timerLetterSpacingInput.value;
    if (spacing) {
        timerDisplay.style.letterSpacing = spacing + 'px';
        countupDisplay.style.letterSpacing = spacing + 'px';
        localStorage.setItem('neonTimerLetterSpacing', spacing);
    }
    taskTitleInput.style.height = 'auto';
    taskTitleInput.style.height = taskTitleInput.scrollHeight + 'px';
    fontDialog.close();
});

async function startStreamingApis(title, category) {
    if (ytLive.isConfigured() && title) {
        ytLive.updateLiveTitle(title).catch(console.error);
    }
    if (twitchApi.isConfigured() && title) {
        twitchApi.updateStream(title, category || '').catch(console.error);
    }
    if (kickApi.isConfigured && kickApi.isConfigured() && title) {
        kickApi.updateStream(title, category || '').catch(console.error);
    }
}

function startPauseTimer() {
    if (pauseInterval) return;
    pauseSeconds = 0;
    pauseDurationDisplay.textContent = `Paused: 00:00`;
    pauseDurationDisplay.classList.remove('hidden');
    pauseInterval = setInterval(() => {
        pauseSeconds++;
        pauseDurationDisplay.textContent = `Paused: ${formatTime(pauseSeconds)}`;
    }, 1000);
}
function stopPauseTimer() {
    if (pauseInterval) {
        clearInterval(pauseInterval);
        pauseInterval = null;
    }
    pauseDurationDisplay.classList.add('hidden');
}