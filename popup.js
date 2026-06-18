// popup.js

const permissionRequestEl = document.getElementById('permission-request');
const mainControlsEl = document.getElementById('main-controls');
const grantPermissionBtn = document.getElementById('grant-permission-btn');
const toggleBtn = document.getElementById('toggle-btn');
const statusBadge = document.getElementById('status-badge');
const statusText = document.getElementById('status-text');
const visualizer = document.getElementById('visualizer');

// 読み込み時にパーミッション確認とUI初期化
document.addEventListener('DOMContentLoaded', async () => {
  localizeUI();
  await checkPermission();
  await updateUIState();
  await loadShortcut();
  await loadSettings();
});

// --- i18n の初期化 ---
function localizeUI() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const message = chrome.i18n.getMessage(el.getAttribute('data-i18n'));
    if (message) el.innerText = message;
  });
}

// マイクパーミッション状態のチェック
async function checkPermission() {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    
    if (result.state === 'granted') {
      permissionRequestEl.classList.add('hidden');
      mainControlsEl.classList.remove('hidden');
    } else {
      permissionRequestEl.classList.remove('hidden');
      mainControlsEl.classList.add('hidden');
    }
    
    result.onchange = () => {
      if (result.state === 'granted') {
        permissionRequestEl.classList.add('hidden');
        mainControlsEl.classList.remove('hidden');
      } else {
        permissionRequestEl.classList.remove('hidden');
        mainControlsEl.classList.add('hidden');
      }
    };
  } catch (err) {
    console.error('Permission check error:', err);
    permissionRequestEl.classList.remove('hidden');
    mainControlsEl.classList.add('hidden');
  }
}

// 許可ボタンの処理
grantPermissionBtn.addEventListener('click', () => {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
  } catch (e) {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  }
});

// ポップアップ内のボタンを長押ししてテスト
let isPopupRecording = false;

toggleBtn.addEventListener('mousedown', () => {
  if (toggleBtn.classList.contains('disabled')) return;
  isPopupRecording = true;
  chrome.runtime.sendMessage({ action: 'START_RECORD_HOLD' });
});

// 離した時に停止・再生
['mouseup', 'mouseleave'].forEach(evt => {
  toggleBtn.addEventListener(evt, async () => {
    if (isPopupRecording) {
      isPopupRecording = false;
      chrome.runtime.sendMessage({ action: 'STOP_RECORD_AND_PLAY' }).catch(() => {});
    }
  });
});

// UI表示の更新
async function updateUIState(state) {
  if (!state) {
    // 起動時の初期化時など、バックグラウンドが死んでいてもエラーで落ちないようにする
    const response = await chrome.runtime.sendMessage({ action: 'getState' }).catch(err => {
      console.warn('Background worker is not ready yet.', err);
      return { state: 'idle' };
    });
    state = response?.state || 'idle';
  }

  if (state === 'recording') {
    statusBadge.innerText = 'REC';
    statusBadge.className = 'badge badge-active';
    statusText.innerText = chrome.i18n.getMessage('statusRecording') || '録音中...';
    
    toggleBtn.className = 'btn btn-toggle active';
    toggleBtn.querySelector('.btn-text').innerText = chrome.i18n.getMessage('btnReleaseToPlay') || '離して再生';
    
    visualizer.classList.add('active');
  } else if (state === 'playing') {
    statusBadge.innerText = 'PLAY';
    statusBadge.className = 'badge badge-starting'; // オレンジ色のままにするか、CSSで緑色を足すか
    statusBadge.style.color = '#10b981'; // PLAYは緑
    statusText.innerText = chrome.i18n.getMessage('statusPlaying') || '再生中...';
    
    toggleBtn.className = 'btn btn-toggle disabled';
    toggleBtn.querySelector('.btn-text').innerText = chrome.i18n.getMessage('btnPlaying') || '再生中...';
    
    visualizer.classList.add('active');
  } else {
    statusBadge.innerText = 'OFF';
    statusBadge.className = 'badge badge-idle';
    statusBadge.style.color = '';
    statusText.innerText = chrome.i18n.getMessage('statusIdle') || '待機中';
    
    toggleBtn.className = 'btn btn-toggle idle';
    toggleBtn.querySelector('.btn-text').innerText = chrome.i18n.getMessage('btnHoldToRecord') || '押している間 録音';
    
    visualizer.classList.remove('active');
  }
}

// バックグラウンドからのエラーなどのメッセージ受信
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'DISPLAY_ERROR') {
    alert(message.error);
    updateUIState('idle');
  }
});

// ローカルストレージの変更を監視してUIを同期
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.echoState) {
    updateUIState(changes.echoState.newValue);
  }
});

// --- ショートカット設定機能 ---
const editShortcutBtn = document.getElementById('edit-shortcut-btn');
const shortcutDisplayArea = document.getElementById('shortcut-display-area');
const shortcutEditArea = document.getElementById('shortcut-edit-area');
const shortcutKeysContainer = document.getElementById('shortcut-keys');

let isEditingShortcut = false;

async function loadShortcut() {
  const data = await chrome.storage.local.get('shortcutConfig');
  const config = data.shortcutConfig || { 
    ctrlKey: false, altKey: false, shiftKey: true, metaKey: false, 
    code: 'Space', display: 'Shift + Space' 
  };
  renderShortcut(config.display);
}

function renderShortcut(displayText) {
  shortcutKeysContainer.innerHTML = '';
  const parts = displayText.split(' + ');
  parts.forEach((part, index) => {
    const kbd = document.createElement('kbd');
    kbd.textContent = part;
    shortcutKeysContainer.appendChild(kbd);
    if (index < parts.length - 1) {
      shortcutKeysContainer.appendChild(document.createTextNode(' + '));
    }
  });
}

editShortcutBtn.addEventListener('click', () => {
  isEditingShortcut = true;
  shortcutDisplayArea.classList.add('hidden');
  shortcutEditArea.classList.remove('hidden');
});

document.addEventListener('keydown', async (e) => {
  if (!isEditingShortcut) return;
  e.preventDefault();

  if (e.key === 'Escape') {
    cancelShortcutEdit();
    return;
  }

  // 修飾キー単体の場合は入力を待つ
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
    return;
  }

  const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey;
  if (!hasModifier) {
    const msg = chrome.i18n.getMessage('editRequireModifier');
    const cancelMsg = chrome.i18n.getMessage('editCancel');
    shortcutEditArea.querySelector('.edit-instruction').innerHTML = `<span id="edit-instruction-text">${msg}</span><br><small id="edit-instruction-cancel">${cancelMsg}</small>`;
    return;
  }

  let displayParts = [];
  if (e.ctrlKey) displayParts.push('Ctrl');
  if (e.metaKey) displayParts.push('Cmd/Win');
  if (e.altKey) displayParts.push('Alt/Opt');
  if (e.shiftKey) displayParts.push('Shift');
  
  let mainKey = e.key.toUpperCase();
  if (e.code.startsWith('Key')) mainKey = e.code.replace('Key', '');
  else if (e.code.startsWith('Digit')) mainKey = e.code.replace('Digit', '');
  else mainKey = e.code;
  
  displayParts.push(mainKey);
  const display = displayParts.join(' + ');

  const config = {
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    altKey: e.altKey,
    shiftKey: e.shiftKey,
    code: e.code,
    display: display
  };

  await chrome.storage.local.set({ shortcutConfig: config });
  
  renderShortcut(display);
  isEditingShortcut = false;
  shortcutDisplayArea.classList.remove('hidden');
  shortcutEditArea.classList.add('hidden');
  
  const msg = chrome.i18n.getMessage('editInstruction');
  const cancelMsg = chrome.i18n.getMessage('editCancel');
  shortcutEditArea.querySelector('.edit-instruction').innerHTML = `<span id="edit-instruction-text">${msg}</span><br><small id="edit-instruction-cancel">${cancelMsg}</small>`;
});

function cancelShortcutEdit() {
  isEditingShortcut = false;
  shortcutDisplayArea.classList.remove('hidden');
  shortcutEditArea.classList.add('hidden');
  const msg = chrome.i18n.getMessage('editInstruction');
  const cancelMsg = chrome.i18n.getMessage('editCancel');
  shortcutEditArea.querySelector('.edit-instruction').innerHTML = `<span id="edit-instruction-text">${msg}</span><br><small id="edit-instruction-cancel">${cancelMsg}</small>`;
}

// --- 動画制御設定機能 ---
const autoPauseCheckbox = document.getElementById('setting-auto-pause');
const autoResumeCheckbox = document.getElementById('setting-auto-resume');

async function loadSettings() {
  const data = await chrome.storage.local.get('videoSettings');
  const settings = data.videoSettings || { autoPause: false, autoResume: false };
  
  autoPauseCheckbox.checked = settings.autoPause;
  autoResumeCheckbox.checked = settings.autoResume;
  autoResumeCheckbox.disabled = !settings.autoPause;
}

function saveSettings() {
  const settings = {
    autoPause: autoPauseCheckbox.checked,
    autoResume: autoResumeCheckbox.checked
  };
  chrome.storage.local.set({ videoSettings: settings });
}

autoPauseCheckbox.addEventListener('change', () => {
  autoResumeCheckbox.disabled = !autoPauseCheckbox.checked;
  if (!autoPauseCheckbox.checked) {
    autoResumeCheckbox.checked = false;
  }
  saveSettings();
});

autoResumeCheckbox.addEventListener('change', saveSettings);
