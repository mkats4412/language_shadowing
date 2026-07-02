// content.js
let isRecording = false;

// デフォルトのショートカット設定
let currentShortcut = {
  ctrlKey: false,
  altKey: false,
  shiftKey: true,
  metaKey: false,
  code: 'Space'
};

// 初期設定の読み込み
try {
  chrome.storage.local.get('shortcutConfig', (data) => {
    if (data.shortcutConfig) {
      currentShortcut = data.shortcutConfig;
    }
    console.log('🎙️ Language Shadowing for YouTube Shortcut Loaded:', currentShortcut.display || currentShortcut.code);
  });

  // 設定変更の監視（動的反映）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.shortcutConfig) {
      currentShortcut = changes.shortcutConfig.newValue;
      console.log('🎙️ Language Shadowing for YouTube Shortcut Updated:', currentShortcut.display || currentShortcut.code);
    }
  });
} catch (e) {
  // context invalidated 時の処理
}

// 押されたキーが設定されたショートカットと一致するかチェックする関数
function isShortcutMatch(e) {
  // 修飾キーがすべて一致し、かつメインのキーコードが一致するか (厳密なboolean比較)
  return (
    !!e.ctrlKey === !!currentShortcut.ctrlKey &&
    !!e.altKey === !!currentShortcut.altKey &&
    !!e.shiftKey === !!currentShortcut.shiftKey &&
    !!e.metaKey === !!currentShortcut.metaKey &&
    e.code === currentShortcut.code
  );
}

document.addEventListener('keydown', (e) => {
  if (isRecording) return;
  
  if (isShortcutMatch(e)) {
    isRecording = true;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try {
      chrome.runtime.sendMessage({ action: 'START_RECORD_HOLD' }).catch((err) => {
        console.error('sendMessage ERROR:', err.message);
        isRecording = false;
      });
    } catch (err) {
      if (err.message.includes('Extension context invalidated')) {
        alert(chrome.i18n.getMessage('errorReload') || 'Language Shadowing for YouTube has been updated.\nPlease refresh this page (F5/Cmd+R).');
      } else {
        console.error('Extension error:', err);
      }
      isRecording = false;
    }
  }
}, { capture: true });

document.addEventListener('keyup', (e) => {
  if (isRecording && e.code === currentShortcut.code) {
    isRecording = false;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    try {
      chrome.runtime.sendMessage({ action: 'STOP_RECORD_AND_PLAY' }).catch((err) => {
        console.error('sendMessage ERROR:', err.message);
      });
    } catch (err) {
      // 無視する
    }
  }
}, { capture: true });

// --- 動画制御機能 ---
let videoSettings = { autoPause: true, autoResume: true };
let pausedVideos = [];

try {
  chrome.storage.local.get('videoSettings', (data) => {
    if (data.videoSettings) {
      videoSettings = data.videoSettings;
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.videoSettings) {
      videoSettings = changes.videoSettings.newValue;
    }
    
    if (area === 'local' && changes.echoState) {
      const state = changes.echoState.newValue;
      
      if (state === 'recording') {
        if (videoSettings.autoPause) {
          pausedVideos = [];
          document.querySelectorAll('video').forEach(video => {
            if (!video.paused) {
              video.pause();
              pausedVideos.push(video);
            }
          });
        }
      } else if (state === 'idle') {
        if (videoSettings.autoResume && pausedVideos.length > 0) {
          pausedVideos.forEach(video => {
            video.play().catch(err => console.error('Video resume error:', err));
          });
          pausedVideos = [];
        }
      }
    }
  });
} catch (e) {
  // context invalidated
}
