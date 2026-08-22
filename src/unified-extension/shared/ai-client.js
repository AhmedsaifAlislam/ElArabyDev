/**
 * ai-client.js — عميل الذكاء الاصطناعي الموحد (OpenCode Zen)
 * Shared across all El Araby extensions
 *
 * يعمل في: content scripts، popup، dashboard
 * يوفّر:
 *   - واجهة عامة: aiChat, aiDetectModel, aiRegisterTool, aiGetTools, aiContext
 *   - SmartAI (chat, route, tools, buildContext, runTool) — واجهة OOP
 *
 * الاعتماد: رسائل AI_CHAT عبر background.js (الـ API key مخزن في chrome.storage فقط)
 */

(function(global) {
  'use strict';

  // منع التحميل المزدوج
  if (global.__elarabyAIClientLoaded) return;
  global.__elarabyAIClientLoaded = true;

  /**
   * خريطة النماذج — توجيه تلقائي حسب نوع المهمة
   * النماذج المعتمدة (ZEN Free): nemotron-3-ultra-free، deepseek-v4-flash-free، mimo-v2.5-free، longcat-2.0-free، north-mini-code-free، ling-3.0-tiny-free
   */
  const MODEL_MAP = {
    'ui-design': 'nemotron-3-ultra-free',
    'architecture': 'nemotron-3-ultra-free',
    'core-coding': 'deepseek-v4-flash-free',
    'security': 'deepseek-v4-flash-free',
    'tampermonkey': 'mimo-v2.5-free',
    'sync-jobs': 'longcat-2.0-free',
    'extraction': 'north-mini-code-free',
    'qa': 'ling-3.0-tiny-free',
    'general': 'deepseek-v4-flash-free'
  };

  /**
   * سجل الأدوات (Tool Registry) — أدوات يمكن للـ AI تنفيذها
   * كل أداة: { name, description, run: (args) => Promise<any> }
   */
  const tools = new Map();

  // ── Cache LRU + منع التكرار المتزامن (Dedupe) ──
  const AI_CACHE = new Map();    // key -> { ts, res }
  const AI_PENDING = new Map();  // key -> Promise
  const AI_CACHE_TTL = 30000;    // 30 ثانية

  function cacheLookup(key) {
    const hit = AI_CACHE.get(key);
    if (!hit) return null;
    if (Date.now() - hit.ts > AI_CACHE_TTL) { AI_CACHE.delete(key); return null; }
    if (AI_CACHE.size > 40) AI_CACHE.delete(AI_CACHE.keys().next().value);
    return hit.res;
  }

  // ── ذاكرة الجلسات (Session Memory) — لكل محادثة/تبويب ──
  const sessions = new Map();
  const SESSION_MAX = 40;

  function aiRemember(sessionId, role, content) {
    if (!sessionId || !content) return;
    const arr = sessions.get(sessionId) || [];
    arr.push({ role: role === 'user' || role === 'assistant' ? role : 'user', content: String(content).slice(0, 6000) });
    if (arr.length > SESSION_MAX) arr.splice(0, arr.length - SESSION_MAX);
    sessions.set(sessionId, arr);
  }

  function aiRecall(sessionId, n = 10) {
    const arr = sessions.get(sessionId) || [];
    return arr.slice(-n);
  }

  /**
   * بناء سياق الصفحة الحالية (Context Injection)
   * @returns {Object}
   */
  function buildContext() {
    const ctx = {};
    if (typeof global.getPageInfo === 'function') ctx.page = global.getPageInfo();
    if (typeof global.PORTAL_CONFIG === 'object') ctx.portal = { pages: global.PORTAL_CONFIG.PAGES };
    if (typeof global.getSapKeywords === 'function') ctx.sapKeywords = global.getSapKeywords().slice(0, 20);
    if (typeof global.scrapeTable === 'function') {
      try {
        const table = global.scrapeTable(document, { includeFrames: true });
        if (table) ctx.table = { headers: table.headers.slice(0, 20), rowCount: table.rowCount };
      } catch (_) {}
    }
    if (typeof global.storageGet === 'function') {
      try {
        ctx.smartLog = 'متاح عبر storageGet';
      } catch (_) {}
    }
    return ctx;
  }

  /**
   * توجيه النموذج المناسب
   * @param {string} [model] - نموذج محدد أو مفتاح مهمة (taskKey)
   * @returns {string}
   */
  function detectModel(model) {
    if (!model) return MODEL_MAP.general;
    if (MODEL_MAP[model]) return MODEL_MAP[model];
    return model;
  }

  /**
   * تنفيذ أداة مسجلة
   * @param {string} name - اسم الأداة
   * @param {Object} args - وسائط
   * @returns {Promise<any>}
   */
  async function runTool(name, args = {}) {
    const tool = tools.get(name);
    if (!tool) return { ok: false, error: `أداة غير معروفة: ${name}` };
    try {
      const result = await tool.run(args);
      return { ok: true, result };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * إرسال محادثة للـ AI عبر background
   * @param {string} prompt - النص
   * @param {Object} opts - { system, model, maxTokens, context, history, tools, tool_choice, temperature, profile, cacheKey }
   * @returns {Promise<{ok:boolean,text?:string,toolCalls?:Array,error?:string}>}
   */
  async function aiChat(prompt, opts = {}) {
    try {
      const payload = buildPayload(prompt, opts);
      const hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;
      // التخزين المؤقت (cache) — اختياري عبر cacheKey ولا يُفعّل مع أدوات
      const cacheKey = (!hasTools && opts.cacheKey)
        ? String(opts.cacheKey) + '|' + detectModel(opts.model)
        : null;
      if (cacheKey) {
        const cached = cacheLookup(cacheKey);
        if (cached) return cached;
        if (AI_PENDING.has(cacheKey)) return AI_PENDING.get(cacheKey);
      }

      const call = (async () => {
        let resp = null;
        if (typeof global.storageGet === 'function') {
          // في content script — نجلب الإعدادات عبر proxy ثم نرسل
          const { aiConfig = {} } = await global.storageGet({ aiConfig: {} });
          resp = await chrome.runtime.sendMessage({
            type: 'AI_CHAT',
            payload: { ...payload, apiKey: aiConfig.apiKey ? aiConfig.apiKey : '' }
          });
        } else {
          // popup / dashboard — وصول مباشر لـ chrome.storage
          resp = await chrome.runtime.sendMessage({ type: 'AI_CHAT', payload });
        }
        if (resp && resp.ok && (resp.text || (Array.isArray(resp.toolCalls) && resp.toolCalls.length))) {
          return { ok: true, text: resp.text, toolCalls: resp.toolCalls || null, model: resp.model || null };
        }
        // رد فارغ بدون toolCalls = فشل ذكي مع رسالة واضحة
        if (resp && resp.ok && !resp.error) {
          return { ok: false, error: 'AI_EMPTY_RESPONSE', message: 'النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج' };
        }
        return { ok: false, error: resp?.message || resp?.error || 'استجابة فارغة' };
      })();

      if (cacheKey) {
        AI_PENDING.set(cacheKey, call);
        const result = await call;
        AI_PENDING.delete(cacheKey);
        if (result.ok && !result.toolCalls) AI_CACHE.set(cacheKey, { ts: Date.now(), res: result });
        return result;
      }
      return await call;
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  /**
   * محادثة مع بث مباشر (Streaming) — استقبال الرد قطعة قطعة
   * يستخدم Port يحمل اسم elaraby-ai-stream (يبقي الـ service worker حياً)
   * @param {string} prompt - النص
   * @param {Object} opts - نفس خيارات aiChat
   * @param {Function} onChunk - (fullText) => void — يُستدعى بعد كل جزء
   * @returns {Promise<{ok:boolean,text?:string,error?:string,message?:string}>}
   */
  async function aiChatStream(prompt, opts = {}, onChunk = null) {
    const simplePayload = buildPayload(prompt, opts);
    return await new Promise((resolve) => {
      let port = null;
      let settled = false;
      let fullText = '';
      const settle = (res) => {
        if (settled) return;
        settled = true;
        try { if (port) port.disconnect(); } catch (_) {}
        resolve(res);
      };
      const timeout = setTimeout(() => settle({ ok: false, error: 'AI_TIMEOUT', message: 'انتهت مهلة الاستجابة — حاول مرة أخرى' }), 95000);
      try {
        port = chrome.runtime.connect({ name: 'elaraby-ai-stream' });
        port.onMessage.addListener((msg) => {
          if (!msg) return;
          if (msg.type === 'chunk') {
            fullText += msg.text || '';
            try { if (onChunk) onChunk(fullText); } catch (_) {}
          } else if (msg.type === 'done') {
            clearTimeout(timeout);
            const text = fullText || msg.text || '';
            if (!text.trim() && (!msg.toolCalls || !msg.toolCalls.length)) {
              settle({ ok: false, error: 'AI_EMPTY_RESPONSE', message: 'النموذج أرسل رداً فارغاً — حاول مرة أخرى أو غيّر النموذج' });
              return;
            }
            settle({ ok: true, text, toolCalls: msg.toolCalls || null, model: msg.model || null });
          } else if (msg.type === 'error') {
            clearTimeout(timeout);
            settle({ ok: false, error: msg.error || 'AI_FAILED', message: msg.message });
          }
        });
        port.onDisconnect.addListener(() => {
          clearTimeout(timeout);
          if (!settled) settle({ ok: false, error: 'AI_STREAM_CLOSED', message: 'انقطع اتصال البث — حاول مرة أخرى' });
        });
        port.postMessage({ type: 'START', payload: simplePayload });
      } catch (e) {
        // الـ Port غير متاح (بيئة قديمة) — ارجع للاستدعاء العادي
        clearTimeout(timeout);
        aiChat(prompt, opts).then((res) => {
          if (res.ok && onChunk) { try { onChunk(res.text); } catch (_) {} }
          settle(res);
        });
      }
    });
  }

  // بناء الـ payload الموحد (يُستخدم في aiChat و aiChatStream)
  function buildPayload(prompt, opts = {}) {
    let system = opts.system || 'أنت مساعد ذكي محترف يساعد في أتمتة العمل على بورتال العربي (PowerApps).';
    let finalPrompt = prompt;
    if (opts.context !== false) {
      try {
        const ctx = buildContext();
        if (ctx.page && ctx.page.name) system += `\nالسياق الحالي: ${JSON.stringify(ctx.page)}`;
        if (ctx.table) finalPrompt += `\n\nلدينا جدول على الصفحة: رؤوسه ${JSON.stringify(ctx.table.headers)} (${ctx.table.rowCount} صف).`;
      } catch (_) {}
    }
    const hasTools = Array.isArray(opts.tools) && opts.tools.length > 0;
    return {
      prompt: finalPrompt,
      system,
      model: detectModel(opts.model),
      maxTokens: opts.maxTokens || 512,
      profile: opts.profile || null,
      history: Array.isArray(opts.history) ? opts.history.slice(-20) : undefined,
      tools: hasTools ? opts.tools : undefined,
      tool_choice: opts.tool_choice,
      temperature: opts.temperature
    };
  }

  /**
   * تسجيل أداة
   * @param {string} name - اسم الأداة
   * @param {string} description - وصف (يُستخدم في بناء الـ system prompt)
   * @param {Function} run - دالة التنفيذ
   */
  function registerTool(name, description, run) {
    tools.set(name, { name, description, run });
  }

  /**
   * قائمة الأدوات المسجلة (للواجهات والـ prompts)
   * @returns {Array<{name:string,description:string}>}
   */
  function listTools() {
    return [...tools.values()].map(({ name, description }) => ({ name, description }));
  }

  /**
   * بناء مقطع system prompt يعلن الأدوات المتاحة للـ AI
   * @returns {string}
   */
  function toolsSystemPrompt() {
    const list = listTools();
    if (!list.length) return '';
    const lines = list.map(t => `- ${t.name}: ${t.description}`);
    return [
      '',
      'يمكنك استدعاء الأدوات التالية لتنفيذ إجراءات حقيقية على البورتال:',
      lines.join('\n'),
      'إذا تطلب طلب المستخدم تنفيذ إحدى هذه الأدوات، أجب حصراً بصيغة JSON واحدة:',
      '{"tool":"<name>","args":{...}}',
      'وإن لم يلزم تنفيذ أداة، أجب بالعربية بشكل عادي.'
    ].join('\n');
  }

  /**
   * محادثة مع تنفيذ الأدوات (Tool Calling) — Agentic Loop
   * يحاول Native Tool Calling أولاً (tools عبر الـ API)، ويتراجع لـ JSON نصي عند غيابه
   * الدور: محادثة → (إن لزم) تنفيذ أدوات → إرجاع النتائج للـ AI → الرد النهائي
   * @param {string} prompt - نص المستخدم
   * @param {Object} opts - { system, model, maxTokens, context, history }
   * @returns {Promise<{ok:boolean,text?:string,tool?:string,toolResult?:any,error?:string}>}
   */
   async function chatWithTools(prompt, opts = {}) {
    const MAX_LOOPS = 3;
    const onChunk = typeof opts.onChunk === 'function' ? opts.onChunk : null;
    try {
      let system = opts.system || 'أنت مساعد ذكي محترف يساعد في أتمتة العمل على بورتال العربي (PowerApps).';
      system += toolsSystemPrompt();

      const list = listTools();
      const toolsSpec = list.length
        ? list.map(({ name, description }) => ({ name, description }))
        : null;

      let res;

      if (toolsSpec) {
        // ── Native Tool Calling ──
        res = await aiChat(prompt, {
          ...opts, system,
          tools: toolsSpec, tool_choice: 'auto',
          context: opts.context !== false
        });
        if (!res.ok) return res;

        const history = Array.isArray(opts.history) ? opts.history : [];
        let messages = [...history, { role: 'user', content: prompt }];

        for (let loop = 0; loop < MAX_LOOPS && res.toolCalls && res.toolCalls.length; loop++) {
          const toolMsgs = [];
          for (const tc of res.toolCalls.slice(0, 5)) {
            const r = await runTool(tc.name, tc.args || {});
            toolMsgs.push({
              role: 'assistant', content: null,
              tool_calls: [{ id: tc.id || 'call_' + loop + '_' + toolMsgs.length, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) } }]
            });
            toolMsgs.push({ role: 'tool', tool_call_id: tc.id || 'call_' + loop + '_' + toolMsgs.length, content: JSON.stringify(r) });
          }
          messages = messages.concat(toolMsgs);
          const followPrompt = toolsSystemPrompt() + '\nنفّذت الأدوات أعلاه. لخّص النتيجة للمستخدم بالعربية بشكل واضح وموجز، أو تابع الطلب.';
          const followOpts = { ...opts, system, history: messages, context: false };
          if (onChunk) {
            res = await aiChatStream(followPrompt, { ...followOpts, tools: toolsSpec, tool_choice: 'auto' }, onChunk);
          } else {
            res = await aiChat(followPrompt, { ...followOpts, tools: toolsSpec, tool_choice: 'auto' });
          }
          if (!res.ok) return res;
        }

        if (res && typeof res === 'object' && 'toolCalls' in res) {
          const text = (res.text || '').trim();
          if (!res.toolCalls || !res.toolCalls.length) return { ok: true, text };
        }
        if (res && res.ok) return { ok: true, text: res.text };
        return res;
      }

      // ── بدون أدوات مسجلة: بث مباشر إن طُلب ──
      if (onChunk) {
        res = await aiChatStream(prompt, { ...opts, system }, onChunk);
      } else {
        res = await aiChat(prompt, { ...opts, system });
      }
      if (!res.ok) return res;
      const text = (res.text || '').trim();
      if (text.startsWith('{')) {
        try {
          const parsed = JSON.parse(text);
          if (parsed && parsed.tool && tools.has(parsed.tool)) {
            const toolResult = await runTool(parsed.tool, parsed.args || {});
            const secondPrompt =
              `نفّذت أداة "${parsed.tool}" بالوسائط: ${JSON.stringify(parsed.args || {})}\n` +
              `النتيجة: ${JSON.stringify(toolResult)}\n\n` +
              `لخّص النتيجة للمستخدم بالعربية بشكل واضح وموجز.`;
            const second = onChunk
              ? await aiChatStream(secondPrompt, { ...opts, system, context: false }, onChunk)
              : await aiChat(secondPrompt, { ...opts, system, context: false });
            return { ok: second.ok, text: second.text, tool: parsed.tool, toolResult, error: second.error };
          }
        } catch (_) {}
      }
      return { ok: true, text };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  // واجهة عامة
  global.aiChat = aiChat;
  global.aiChatStream = aiChatStream;
  global.aiDetectModel = detectModel;
  global.aiRegisterTool = registerTool;
  global.aiListTools = listTools;
  global.aiRunTool = runTool;
  global.aiBuildContext = buildContext;
  global.aiChatWithTools = chatWithTools;
  global.aiRemember = aiRemember;
  global.aiRecall = aiRecall;

  global.SmartAI = {
    chat: aiChat,
    route: detectModel,
    tools,
    registerTool,
    listTools,
    runTool,
    buildContext,
    remember: aiRemember,
    recall: aiRecall,
    MODELS: MODEL_MAP
  };

  console.log('[AIClient] ✅ تم تحميل عميل الذكاء الاصطناعي الموحد بنجاح');

})(typeof globalThis !== 'undefined' ? globalThis : window);