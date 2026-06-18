// options.js

// UIのローカライズ適用
function localizeUI() {
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const message = chrome.i18n.getMessage(element.getAttribute('data-i18n'));
    if (message) {
      if (element.tagName === 'INPUT' && element.type === 'button') {
        element.value = message;
      } else {
        element.innerHTML = message;
      }
    }
  });
}

const requestBtn = document.getElementById('request-btn');
const successMessage = document.getElementById('success-message');
const instructionText = document.getElementById('instruction-text');

async function requestPermission() {
  try {
    // ユーザーのマイク入力を要求
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 許可が得られたらストリームを即クローズ
    stream.getTracks().forEach(track => track.stop());
    
    // UIを成功表示に切り替え
    requestBtn.style.display = 'none';
    instructionText.style.display = 'none';
    successMessage.classList.remove('hidden');
    
    // 1.5秒後に自動的にタブを閉じる
    setTimeout(() => {
      window.close();
    }, 1500);
  } catch (err) {
    // ユーザー操作なしの自動リクエストがブロックされるのはChromeの正常な仕様（想定内）のため、エラーではなくログとして出力
    console.log('自動マイク許可リクエストがブロックされました（通常動作）:', err.name || err);
    // 自動リクエストが弾かれた場合は、ボタンを表示してユーザーのアクションを促す
    requestBtn.style.display = 'block';
    
    // テキストを手動リクエスト用に切り替えて再度ローカライズ
    const desc2Element = document.getElementById('desc2');
    if (desc2Element) {
      desc2Element.setAttribute('data-i18n', 'optionsDesc2Manual');
      localizeUI();
    }
  }
}

requestBtn.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    requestBtn.style.display = 'none';
    instructionText.style.display = 'none';
    successMessage.classList.remove('hidden');
    setTimeout(() => { window.close(); }, 1500);
  } catch (err) {
    alert(chrome.i18n.getMessage('optionsAlert') || 'マイクのアクセス許可が得られませんでした。ブラウザの設定（アドレスバー左の鍵マークなど）からマイクの使用を許可してください。');
  }
});

// ページが開かれた瞬間に自動で許可ダイアログを出す
document.addEventListener('DOMContentLoaded', () => {
  localizeUI();
  requestPermission();
});
