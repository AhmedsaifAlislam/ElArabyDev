// n8n-tab.js — تبويب "🔗 n8n" في الـ popup
// إعدادات Webhook + إرسال الأحداث (اختبار / سجل الجلسات / تحليل السلوك)

(function(global) {
  'use strict';

  let n8nTabInited = false;

  function initN8NTab() {
    if (n8nTabInited) { loadN8nConfig(); return; }
    n8nTabInited = true;

    document.getElementById('btn-n8n-save').addEventListener('click', saveN8nConfig);
    document.getElementById('btn-n8n-test').addEventListener('click', () => sendN8n('test', { message: 'اختبار اتصال من الإضافة الموحدة' }));
    document.getElementById('btn-n8n-send-logs').addEventListener('click', sendN8nLogs);
    document.getElementById('btn-n8n-send-telemetry').addEventListener('click', sendN8nTelemetry);

    loadN8nConfig();
  }

  async function loadN8nConfig() {
    const { n8n = {} } = await chrome.storage.local.get({ n8n: {} });
    document.getElementById('n8n-webhook-url').value = n8n.webhookUrl || '';
    document.getElementById('n8n-token').value = n8n.token || '';
    document.getElementById('n8n-auto-export').checked = !!n8n.autoExport;
    updateN8nStatus(n8n.webhookUrl ? 'ready' : 'unconfigured');
  }

  function updateN8nStatus(state, extra) {
    const dot = document.getElementById('n8n-status-dot');
    const text = document.getElementById('n8n-status-text');
    if (state === 'ready') {
      dot.style.background = '#2ecc71';
      text.textContent = '✅ n8n مُعدّ — جاهز للإرسال' + (extra ? ' · ' + extra : '');
    } else if (state === 'sending') {
      dot.style.background = '#f5a623';
      text.textContent = '⏳ جاري الإرسال...';
    } else {
      dot.style.background = '#888';
      text.textContent = 'لم يُعدّ n8n بعد — ضع Webhook URL واحفظ';
    }
  }

  async function saveN8nConfig() {
    const n8n = {
      webhookUrl: document.getElementById('n8n-webhook-url').value.trim(),
      token: document.getElementById('n8n-token').value.trim(),
      autoExport: document.getElementById('n8n-auto-export').checked
    };
    await chrome.storage.local.set({ n8n });
    updateN8nStatus(n8n.webhookUrl ? 'ready' : 'unconfigured');
    showN8nResult(n8n.webhookUrl ? '✅ تم حفظ الإعدادات.' : '⚠️ حُفظت الإعدادات — Webhook فارغ، الإرسال سيفشل.');
  }

  function showN8nResult(msg) {
    const box = document.getElementById('n8n-result');
    box.style.display = 'block';
    box.textContent = msg;
  }

  async function sendN8n(eventName, data) {
    if (typeof global.n8nSend !== 'function') {
      showN8nResult('❌ عميل n8n غير محمّل — أعد فتح الإضافة.');
      return;
    }
    updateN8nStatus('sending');
    const res = await global.n8nSend(eventName, data);
    if (res.ok) {
      updateN8nStatus('ready', 'آخر إرسال: HTTP ' + res.status);
      showN8nResult('✅ أُرسل الحدث "' + eventName + '" بنجاح (HTTP ' + res.status + ')');
    } else {
      updateN8nStatus('ready');
      showN8nResult('❌ فشل الإرسال: ' + (res.error || res.message || 'خطأ غير معروف'));
    }
    return res && res.ok;
  }

  async function sendN8nLogs() {
    try {
      const { smartLog = [] } = await chrome.storage.local.get({ smartLog: [] });
      const logs = Array.isArray(smartLog) ? smartLog.slice(-200) : [];
      if (!logs.length) {
        showN8nResult('⚠️ لا توجد سجلات جلسات بعد.');
        return;
      }
      const ok = await sendN8n('session_log', { count: logs.length, logs });
      if (ok) showN8nResult('✅ أُرسلت ' + logs.length + ' سجل جلسة إلى n8n.');
    } catch (e) {
      showN8nResult('خطأ: ' + (e?.message || e));
    }
  }

  async function sendN8nTelemetry() {
    try {
      const data = await chrome.storage.local.get({ telemetryEvents: [], telemetrySessions: [] });
      const events = data.telemetryEvents || [];
      const sessions = data.telemetrySessions || [];
      if (!events.length && !sessions.length) {
        showN8nResult('⚠️ لا توجد بيانات تحليل سلوك بعد.');
        return;
      }
      const ok = await sendN8n('telemetry_summary', {
        events: events.length,
        sessions: sessions.length,
        recentEvents: events.slice(-50),
        recentSessions: sessions.slice(-10)
      });
      if (ok) showN8nResult('✅ أُرسلت بيانات التحليل (' + events.length + ' حدث / ' + sessions.length + ' جلسة).');
    } catch (e) {
      showN8nResult('خطأ: ' + (e?.message || e));
    }
  }

  global.initN8NTab = initN8NTab;

})(typeof globalThis !== 'undefined' ? globalThis : window);