// offscreen.js

let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let audioElement = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_RECORDING_ACTION') {
    startRecording();
  } else if (message.action === 'STOP_RECORDING_ACTION') {
    stopRecordingAndPlay();
  }
});

let recordingStartTime = 0;
let isStartRequested = false;

async function startRecording() {
  isStartRequested = true;
  cleanup();

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      }
    });

    if (!isStartRequested) {
      cleanup();
      return;
    }

    audioChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    recordingStartTime = Date.now();
    mediaRecorder.start();
  } catch (err) {
    console.error('Recording setup error:', err);
    chrome.runtime.sendMessage({ 
      action: 'ECHO_ERROR', 
      error: err.name === 'NotAllowedError' 
        ? 'マイクへのアクセスが許可されていません。設定から許可してください。' 
        : `録音エラー: ${err.message}`
    });
  }
}

function stopRecordingAndPlay() {
  isStartRequested = false;

  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    chrome.runtime.sendMessage({ action: 'PLAYBACK_FINISHED' });
    cleanup();
    return;
  }

  mediaRecorder.onstop = () => {
    const duration = Date.now() - recordingStartTime;

    // 録音時間が短すぎる（1000ms未満）かデータがない場合は、再生処理をスキップして即終了する
    // (短すぎるファイルはブラウザが再生エラーを起こすため＆発話として意味を成さないため)
    if (duration < 1000 || audioChunks.length === 0) {
      chrome.runtime.sendMessage({ action: 'PLAYBACK_FINISHED' });
      cleanup();
      return;
    }

    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(audioBlob);
    
    audioElement = new Audio(audioUrl);
    
    let isFinished = false;
    const finishPlayback = () => {
      if (isFinished) return;
      isFinished = true;
      chrome.runtime.sendMessage({ action: 'PLAYBACK_FINISHED' });
      cleanup();
    };
    
    audioElement.onended = finishPlayback;
    
    audioElement.onerror = () => {
      // ユーザーが再生終了直前で離した等による無害なデコードエラー
      finishPlayback();
    };
    
    audioElement.play().catch(() => {
      // 再生開始前のキャンセル等
      finishPlayback();
    });

    // フェイルセーフ: 録音時間 + 2秒 経過してもイベントが発火しなかった場合は強制終了
    setTimeout(finishPlayback, duration + 2000);
  };

  mediaRecorder.stop();
}

function cleanup() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch(e) {}
  }
  if (mediaStream) {
    try { mediaStream.getTracks().forEach(track => track.stop()); } catch(e) {}
    mediaStream = null;
  }
  if (audioElement) {
    try {
      audioElement.onerror = null;
      audioElement.onended = null; // リスナーを安全に外す
      audioElement.pause();

      // src属性を安全に削除してリロードし、メモリを確実に解放
      audioElement.removeAttribute('src');
      audioElement.load(); 
    } catch(e) {}
    audioElement = null;
  }
  audioChunks = [];
}
