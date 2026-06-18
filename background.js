// background.js

// より互換性の高い chrome.storage.local を使用します
const STATE_KEY = 'echoState';

let taskQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ [STATE_KEY]: 'idle' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORD_HOLD') {
    taskQueue = taskQueue.then(async () => {
      try {
        await startRecording();
      } catch (err) {
        console.error('Start error:', err);
        await chrome.action.setBadgeText({ text: 'ERR1' });
      }
    });
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'STOP_RECORD_AND_PLAY') {
    taskQueue = taskQueue.then(async () => {
      try {
        await stopRecordingAndPlay();
      } catch (err) {
        console.error('Stop error:', err);
        await chrome.action.setBadgeText({ text: 'ERR2' });
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'PLAYBACK_FINISHED') {
    taskQueue = taskQueue.then(async () => {
      await chrome.storage.local.set({ [STATE_KEY]: 'idle' });
      await chrome.action.setBadgeText({ text: '' });
      await closeOffscreenDocument();
    });
  }
  
  if (message.action === 'getState') {
    (async () => {
      try {
        const data = await chrome.storage.local.get(STATE_KEY);
        sendResponse({ state: data[STATE_KEY] || 'idle' });
      } catch(e) {
        sendResponse({ state: 'idle' });
      }
    })();
    return true;
  }

  if (message.action === 'ECHO_ERROR') {
    taskQueue = taskQueue.then(async () => {
      await chrome.storage.local.set({ [STATE_KEY]: 'idle' });
      await chrome.action.setBadgeText({ text: 'ERR3' });
      await closeOffscreenDocument();
      try {
        await chrome.runtime.sendMessage({ action: 'DISPLAY_ERROR', error: message.error });
      } catch (e) {}
    });
  }
});

async function ensureOffscreenDocument() {
  // offscreen API が利用可能かチェック
  if (!chrome.offscreen) {
    throw new Error('Offscreen API is not supported in this browser version.');
  }

  // すでに存在するかチェック
  let hasDocument = false;
  try {
    hasDocument = await chrome.offscreen.hasDocument();
  } catch (e) {
    // 古いChromeでは hasDocument が未サポートの可能性があるため、無視して進める
  }

  if (!hasDocument) {
    try {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        // reasons を配列の1要素のみにして安全に倒す
        reasons: ['USER_MEDIA'],
        justification: 'Record mic and playback to default speaker'
      });
      // 作成待機
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      if (!e.message.includes('Only a single offscreen document may be created')) {
        throw e;
      }
    }
  }
}

async function closeOffscreenDocument() {
  if (!chrome.offscreen) return;
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (hasDocument) {
      await chrome.offscreen.closeDocument();
    }
  } catch (e) {
    // 既に閉じている場合のエラーは無視
  }
}

async function startRecording() {
  const data = await chrome.storage.local.get(STATE_KEY);
  const state = data[STATE_KEY] || 'idle';
  
  if (state === 'recording') return;

  // 最初に状態とバッジを更新
  await chrome.storage.local.set({ [STATE_KEY]: 'recording' });
  await chrome.action.setBadgeText({ text: 'REC' });
  await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });

  // オフスクリーンドキュメントの作成
  await ensureOffscreenDocument();
  
  // オフスクリーンにメッセージを送信して録音を開始
  try {
    await chrome.runtime.sendMessage({ action: 'START_RECORDING_ACTION' });
  } catch (err) {
    // 初回作成時などはメッセージ送信が失敗することがあるので少し待ってリトライ
    await new Promise(resolve => setTimeout(resolve, 200));
    try {
      await chrome.runtime.sendMessage({ action: 'START_RECORDING_ACTION' });
    } catch(err2) {
      // それでもダメなら状態を戻してエラーを投げる
      await chrome.storage.local.set({ [STATE_KEY]: 'idle' });
      await chrome.action.setBadgeText({ text: '' });
      throw new Error('Failed to start recording module: ' + err2.message);
    }
  }
}

async function stopRecordingAndPlay() {
  const data = await chrome.storage.local.get(STATE_KEY);
  const state = data[STATE_KEY] || 'idle';
  
  // 状態が idle なら何もしないが、それ以外（recording や starting の途中）なら停止処理を強行する
  if (state === 'idle') return;

  await chrome.storage.local.set({ [STATE_KEY]: 'playing' });
  await chrome.action.setBadgeText({ text: 'PLAY' });
  await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
  
  try {
    await chrome.runtime.sendMessage({ action: 'STOP_RECORDING_ACTION' });
  } catch (err) {
    console.error('Failed to send stop message:', err);
    await chrome.storage.local.set({ [STATE_KEY]: 'idle' });
    await chrome.action.setBadgeText({ text: '' });
    await closeOffscreenDocument();
  }
}
