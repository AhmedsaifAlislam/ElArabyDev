// ai-panel-tab.js — تبويب "المساعد الذكي" في الـ popup
// محادثة عامة عبر aiChat (من shared/ai-client.js) + فتح محادثة الصفحة (بأدواتها).

(function(global) {
  'use strict';

  let aiPanelInited = false;

  function initAIAssistantTab() {
    if (aiPanelInited) { checkAIConfig(); return; }
    aiPanelInited = true;

    document.getElementById('ai-panel-send').addEventListener('click', sendAIMessage);
    document.getElementById('ai-panel-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') sendAIMessage();
    });
    document.getElementById('btn-ai-open-on-page').addEventListener('click', openChatOnPage);
    document.getElementById('ai-model-select')?.addEventListener('change', onModelChange);

    checkAIConfig();
  }

  async function checkAIConfig() {
    const dot = document.getElementById('ai-config-dot');
    const text = document.getElementById('ai-config-text');
    try {
      const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
      const hasKey = !!(aiConfig.apiKey && String(aiConfig.apiKey).trim());
      const hasModel = !!(aiConfig.model && String(aiConfig.model).trim());
      if (hasKey) {
        dot.style.background = '#2ecc71';
        text.textContent = '✅ مفعّل — المفتاح مضبوط' + (hasModel ? ' (' + aiConfig.model + ')' : '');
        const sel = document.getElementById('ai-model-select');
        if (sel && hasModel) sel.value = aiConfig.model;
        try {
          const { aiUsageStats } = await chrome.storage.local.get({ aiUsageStats: null });
          if (aiUsageStats && aiUsageStats.calls) {
            text.textContent += ' | ' + aiUsageStats.calls + ' طلب • ' + aiUsageStats.tokens + ' token' +
              (aiUsageStats.fail ? ' • فشل ' + aiUsageStats.fail : '');
            const last = aiUsageStats.last;
            if (last && last.error) text.textContent += ' • آخر خطأ: ' + last.error;
          }
        } catch (_) {}
      } else {
        dot.style.background = '#f5a623';
        text.textContent = '⚠️ لا يوجد مفتاح API — اذهب إلى الإعدادات وأدخل OpenCode API Key';
      }
    } catch (e) {
      dot.style.background = '#e74c3c';
      text.textContent = '❌ تعذر قراءة الإعدادات';
    }
  }

  async function onModelChange() {
    const sel = document.getElementById('ai-model-select');
    if (!sel) return;
    const model = sel.value;
    try {
      const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
      aiConfig.model = model;
      await chrome.storage.local.set({ aiConfig });
      checkAIConfig();
    } catch (e) {
      console.error('Model save error:', e);
    }
  }

  function addMsg(kind, text) {
    const box = document.getElementById('ai-panel-messages');
    const m = document.createElement('div');
    m.style.cssText = 'max-width:92%;padding:7px 10px;border-radius:8px;white-space:pre-wrap;word-break:break-word;' +
      (kind === 'user'
        ? 'align-self:flex-start;background:var(--accent,#2a5298);color:#fff;'
        : kind === 'err'
          ? 'align-self:flex-end;background:#f8d7da;color:#721c24;'
          : 'align-self:flex-end;background:#e9edf5;color:#222;');
    m.textContent = text;
    box.appendChild(m);
    box.scrollTop = box.scrollHeight;
    return m;
  }

  async function sendAIMessage() {
    const input = document.getElementById('ai-panel-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg('user', text);

    if (typeof global.aiChat !== 'function') {
      addMsg('err', '❌ عميل الذكاء الاصطناعي غير محمّل');
      return;
    }

    const sendBtn = document.getElementById('ai-panel-send');
    sendBtn.disabled = true;

    // إظهار مؤشر التحميل فوراً قبل أي عملية غير متزامنة
    let busy = addBusy();
    let streamEl = null;

    const onChunk = (fullText) => {
      if (!streamEl) {
        busy.remove();
        streamEl = addMsg('ai', fullText);
      } else {
        streamEl.textContent = fullText;
      }
    };

    // قراءة النموذج المحفوظ
    let model = 'general';
    try {
      const { aiConfig = {} } = await chrome.storage.local.get({ aiConfig: {} });
      if (aiConfig.model) model = aiConfig.model;
    } catch (_) {}

    try {
      const streamable = typeof global.aiChatStream === 'function';
      const res = streamable
        ? await global.aiChatStream(text, {
            system: 'أنت المساعد الذكي لموظف خدمة مركز العربي. أجب بالعربية، بشكل موجز وعملي.',
            model,
            maxTokens: 700
          }, onChunk)
        : await global.aiChat(text, {
            system: 'أنت المساعد الذكي لموظف خدمة مركز العربي. أجب بالعربية، بشكل موجز وعملي.',
            model,
            maxTokens: 700
          });

      if (res.ok) {
        const finalText = res.text || '';
        if (streamEl) {
          streamEl.textContent = finalText || '⚠️ رد فارغ — حاول مرة أخرى أو غيّر النموذج';
        } else {
          busy.remove();
          addMsg('ai', finalText || '⚠️ رد فارغ — حاول مرة أخرى أو غيّر النموذج');
        }
      } else {
        if (streamEl) {
          streamEl.className = '';
          streamEl.style.cssText = 'max-width:92%;padding:7px 10px;border-radius:8px;white-space:pre-wrap;word-break:break-word;align-self:flex-end;background:#f8d7da;color:#721c24;';
          streamEl.textContent = '❌ ' + (res.message || res.error || 'فشل');
        } else {
          busy.remove();
          addMsg('err', '❌ ' + (res.message || res.error || 'فشل'));
        }
      }
    } catch (e) {
      if (streamEl) streamEl.remove();
      busy.remove();
      addMsg('err', 'خطأ: ' + (e?.message || e));
    } finally {
      sendBtn.disabled = false;
    }
  }

  function addBusy() {
    const box = document.getElementById('ai-panel-messages');
    const m = document.createElement('div');
    m.style.cssText = 'align-self:flex-end;background:#e9edf5;color:#666;padding:7px 10px;border-radius:8px;font-size:11px;';
    m.textContent = '⏳ جاري التفكير...';
    box.appendChild(m);
    box.scrollTop = box.scrollHeight;
    return m;
  }

  async function openChatOnPage() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return;
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'SHOW_AI_CHAT' });
      if (res && res.ok) {
        window.close();
      } else {
        addMsg('err', '❌ افتح صفحة بورتال العربي أولاً ثم أعد المحاولة');
      }
    } catch (e) {
      addMsg('err', '❌ افتح صفحة بورتال العربي أولاً ثم أعد المحاولة');
    }
  }

  global.initAIAssistantTab = initAIAssistantTab;

})(typeof globalThis !== 'undefined' ? globalThis : window);