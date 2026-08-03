// ==================== العربية CRM - Service Worker ====================
// خدمة خلفية للإضافة - بدون API خارجي

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveAnalysis') {
    saveAnalysis(request.data)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'getHistory') {
    getAnalysisHistory()
      .then(history => sendResponse({ success: true, history }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'clearHistory') {
    chrome.storage.local.remove('analysisHistory', () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function saveAnalysis(data) {
  const result = await chrome.storage.local.get('analysisHistory');
  const history = result.analysisHistory || [];

  history.unshift({
    id: Date.now(),
    timestamp: new Date().toISOString(),
    pageType: data.pageType,
    pageName: data.pageName,
    url: data.url,
    accountNumber: data.accountNumber,
    summary: data.summary,
    aiResult: data.aiResult
  });

  if (history.length > 10) {
    history.splice(10);
  }

  await chrome.storage.local.set({ analysisHistory: history });
}

async function getAnalysisHistory() {
  const result = await chrome.storage.local.get('analysisHistory');
  return result.analysisHistory || [];
}
