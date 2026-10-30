// ==================== تحليلات AI محلية ====================
// محلية 100% — تتصل بـ Ollama المحلي (http://localhost:11434) فقط.
// لا بيانات تغادر الجهاز. فشل الاتصال يُعاد كمعلومة بدون كسر الواجهة.

async function requestLocalAIInsights(pageData, analysisResult) {
  const summary = analysisResult?.summary?.cards || [];
  const context = {
    page: pageData.pageName || 'غير معروف',
    pageType: pageData.pageType || 'unknown',
    account: pageData.accountName || pageData.accountNumber || 'غير محدد',
    cards: summary.map(c => `${c.label}: ${c.value}${c.sub ? ' (' + c.sub + ')' : ''}`)
  };

  let plainText = '';
  if (analysisResult && analysisResult.plainText) {
    plainText = analysisResult.plainText.slice(0, 4000);
  }

  const prompt = [
    'أنت محلل مالي لمركز خدمة صيانة تابع لشركة العربي.',
    'حلّل البيانات التالية وأعطني 3-5 ملاحظات عملية قصيرة بالعربية.',
    'ركز على: الرصيد، التحويلات البنكية، القطع التالفة، تكرار القطع، تغير الأسعار.',
    '',
    '=== السياق ===',
    JSON.stringify(context, null, 2),
    '',
    '=== التقرير ===',
    plainText || '(لا يوجد تقرير نصي)'
  ].join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);

  try {
    const res = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'llama3.2',
        prompt: prompt,
        stream: false
      })
    });

    if (!res.ok) throw new Error('Ollama HTTP ' + res.status);

    const data = await res.json();
    const text = (data.response || '').trim();
    if (!text) throw new Error('لا يوجد رد من Ollama');

    return text.split('\n').filter(Boolean).join('\n');
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('انتهت مهلة Ollama (25 ثانية)');
    }
    throw new Error('تعذر الاتصال بـ Ollama المحلي: ' + error.message);
  } finally {
    clearTimeout(timer);
  }
}