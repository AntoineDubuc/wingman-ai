/**
 * Mic Permission Page
 *
 * Opened as a popup window by the service worker when the offscreen document
 * can't show a getUserMedia prompt (hidden page). Requests mic permission,
 * sends result back, and auto-closes.
 *
 * Only opens on first use — once granted, permission persists for the
 * chrome-extension:// origin and the offscreen document succeeds directly.
 */
navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then(function (stream) {
    stream.getTracks().forEach(function (t) {
      t.stop();
    });
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: true });
    window.close();
  })
  .catch(function () {
    document.getElementById('denied').style.display = 'block';
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_RESULT', granted: false });
    // Keep window open briefly so user can see the denial message
    setTimeout(function () {
      window.close();
    }, 3000);
  });
