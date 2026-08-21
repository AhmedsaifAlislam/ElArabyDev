import { chromium, Browser, BrowserContext, Page, ElementHandle } from 'playwright';
import { join } from 'path';
import { ARENA_CONFIG, type ArenaConfig } from './config.js';
import { SessionManager } from './session-manager.js';
import { type ArenaChatParams, type ArenaChatResult, type ArenaModel as ArenaModelType, type ArenaSession, type ArenaMessage, type ArenaModel } from './types.js';

export class ArenaClient {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessionManager: SessionManager;
  private config: ArenaConfig;
  private currentSessionId: string | null = null;
  private initialized = false;

  constructor(sessionManager: SessionManager, config: ArenaConfig = ARENA_CONFIG) {
    this.sessionManager = sessionManager;
    this.config = config;
  }

  async initialize(headless: boolean = true): Promise<void> {
    if (this.initialized) return;

    this.browser = await chromium.launch({
      headless,
      args: [...this.config.browser.args],
    });

    // حاول تحميل storageState المحفوظ
    let storageState: string | undefined;
    if (this.config.session.persistCookies) {
      const p = join(this.sessionManager.getStorageDir(), 'browser-state.json');
      try {
        const { promises: fs } = await import('fs');
        await fs.access(p);
        storageState = p;
        console.error(`[ArenaClient] loading storageState from ${p}`);
      } catch {}
    }

    this.context = await this.browser.newContext({
      userAgent: this.config.browser.userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'UTC',
      permissions: ['clipboard-read', 'clipboard-write'],
      ...(storageState ? { storageState } : {}),
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeouts.element);
    this.page.setDefaultNavigationTimeout(this.config.timeouts.navigation);

    // لا نمنع أي مورد الآن - arena.ai يحتاج كل شيء للـ hydration
    // await this.page.route('**/*', ... ) معطل مؤقتاً للتشخيص
    void 0;

    this.initialized = true;
    console.error('[ArenaClient] Initialized');
  }

  async navigateToArena(): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.waitForChatReady();
  }

  private async waitForChatReady(): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    console.error('[ArenaClient] waitForChatReady start url=', this.page.url());
    // 1) حاجز الموافقة Agree - ظهر في body snippet - نحاول بكل الطرق
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const allBtns = await this.page.$$eval('button', els => els.map(b => ({ txt: (b.textContent||'').trim().slice(0,80), html: b.outerHTML.slice(0,350) })));
        console.error(`[ArenaClient] All buttons (${allBtns.length}): ${JSON.stringify(allBtns.slice(0,12))}`);
        const btns = await this.page.$$eval('button', els => els.filter(b => (b.textContent||'').includes('Agree')).map(b => ({ txt: b.textContent, html: b.outerHTML.slice(0,400), visible: !!(b as HTMLElement).offsetParent })));
        console.error(`[ArenaClient] Agree candidates: ${JSON.stringify(btns)}`);
        // أيضاً افحص dialog
        const hasDialog = await this.page.locator('[role="dialog"], [data-state="open"]').count();
        console.error(`[ArenaClient] dialog count ${hasDialog}`);
        const agreeVisible = await this.page.locator('button:has-text("Agree")').first().isVisible({ timeout: 1500 }).catch(() => false);
        console.error(`[ArenaClient] agreeVisible ${agreeVisible} attempt ${attempt}`);
        if (agreeVisible) {
          console.error(`[ArenaClient] Clicking Agree attempt ${attempt}...`);
          await this.page.evaluate(() => {
            const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('Agree')) as HTMLElement;
            console.log('found agree', b?.outerHTML);
            if (b) b.click();
          });
          await this.page.waitForTimeout(1000);
          await this.page.locator('button:has-text("Agree")').first().click({ force: true }).catch(()=>{});
          await this.page.waitForTimeout(1000);
          const still = await this.page.locator('button:has-text("Agree")').first().isVisible({ timeout: 800 }).catch(()=> false);
          console.error(`[ArenaClient] Agree still visible after attempt ${attempt}: ${still}`);
          if (!still) break;
          // جرب Escape
          await this.page.keyboard.press('Escape').catch(()=>{});
          await this.page.waitForTimeout(500);
        } else {
          if (attempt===0) {
            // حتى لو غير مرئي، جرب evaluate click
            await this.page.evaluate(() => {
              const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').includes('Agree')) as HTMLElement;
              if (b) b.click();
            }).catch(()=>{});
            await this.page.waitForTimeout(800);
          } else break;
        }
      } catch (e) { console.error('[ArenaClient] Agree error', String(e)); }
      await this.page.waitForTimeout(600);
    }

    // Wait for chat input to be visible
    await this.page.waitForSelector(this.config.selectors.chatInput, { 
      state: 'visible', 
      timeout: this.config.timeouts.navigation 
    });

    // Check if logged in
    const loginPrompt = await this.page.$(this.config.selectors.loginPrompt);
    if (loginPrompt) {
      console.error('[ArenaClient] ⚠️ Login required — please authenticate in the browser');
    }
  }

  async ensureSession(sessionId?: string, newSession: boolean = false): Promise<string> {
    if (newSession || !sessionId) {
      const session = await this.sessionManager.createSession(sessionId);
      this.currentSessionId = session.id;
      await this.newChat();
      return this.currentSessionId;
    }

    // Load existing session
    const session = await this.sessionManager.loadSession(sessionId);
    if (!session) {
      const newSess = await this.sessionManager.createSession(sessionId);
      this.currentSessionId = newSess.id;
      await this.newChat();
      return this.currentSessionId;
    }

    this.currentSessionId = session.id;
    
    // If we have messages, we need to restore the chat
    if (session.messages.length > 0) {
      await this.navigateToArena();
      // Click on the conversation in history if available
      await this.restoreSession(session);
    } else {
      await this.navigateToArena();
    }

    return this.currentSessionId;
  }

  private async newChat(): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    await this.navigateToArena();
    
    const newChatBtn = await this.page.$(this.config.selectors.newChatButton);
    if (newChatBtn) {
      await newChatBtn.click();
      await this.page.waitForTimeout(500);
    }
  }

  private async restoreSession(session: ArenaSession): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    
    // Try to find and click the conversation in history
    const historyItems = await this.page.$$(this.config.selectors.conversationItem);
    for (const item of historyItems) {
      const text = await item.textContent();
      if (text && session.messages[0]?.content && text.includes(session.messages[0].content.slice(0, 30))) {
        await item.click();
        await this.page.waitForTimeout(500);
        break;
      }
    }
  }

  async selectModel(modelName: string): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    
    const modelSelector = await this.page.$(this.config.selectors.modelSelector);
    if (!modelSelector) return;

    await modelSelector.click();
    await this.page.waitForTimeout(300);

    const options = await this.page.$$(this.config.selectors.modelOptions);
    for (const option of options) {
      const text = await option.textContent();
      if (text && text.toLowerCase().includes(modelName.toLowerCase())) {
        await option.click();
        await this.page.waitForTimeout(300);
        return;
      }
    }
    
    console.error(`[ArenaClient] Model "${modelName}" not found in options`);
  }

  async sendMessage(params: ArenaChatParams): Promise<ArenaChatResult> {
    if (!this.page) throw new Error('Not initialized');

    const sessionId = await this.ensureSession(params.sessionId, params.newSession);
    
    if (params.model) {
      await this.selectModel(params.model);
    }

    // Add system prompt if provided
    if (params.systemPrompt && params.systemPrompt.trim()) {
      await this.addSystemPrompt(params.systemPrompt);
    }

    // استخدم locator لضمان الحقل المرئي الوحيد
    const inputLocator = this.page.locator('textarea[placeholder="Ask anything…"]').first();
    await inputLocator.waitFor({ state: 'visible', timeout: this.config.timeouts.element });
    await inputLocator.click();
    await this.page.waitForTimeout(150);
    // امسح ثم اكتب حرف بحرف ليُفعّل React state
    await inputLocator.fill('');
    await inputLocator.pressSequentially(params.prompt, { delay: 18 });
    await this.page.waitForTimeout(500);
    const val = await inputLocator.inputValue().catch(() => '');
    console.error(`[ArenaClient] input value len=${val.length} preview="${val.slice(0,60)}"`);
    // زر الإرسال - نفحص disabled + جرب كل طرق الإرسال
    const sendBtn = this.page.locator('button[type="submit"]').last();
    let disabled = true;
    try { disabled = await sendBtn.isDisabled(); } catch {}
    const sendBtnHtml = await sendBtn.evaluate(el => el.outerHTML).catch(() => 'no btn');
    console.error(`[ArenaClient] sendBtn disabled=${disabled} html=${sendBtnHtml.slice(0,300)}`);
    // جرب الضغط على الزر
    if (!disabled) {
      try {
        await sendBtn.click({ force: true });
        console.error('[ArenaClient] clicked sendBtn');
      } catch (e) { console.error('[ArenaClient] click failed', String(e)); }
      await this.page.waitForTimeout(500);
    }
    // مهم: اضغط Enter أيضاً لضمان الإرسال (بعض الواجهات تتطلب Enter)
    console.error('[ArenaClient] pressing Enter');
    await this.page.keyboard.press('Enter');
    await this.page.waitForTimeout(800);
    let stillVal = await inputLocator.inputValue().catch(() => '');
    console.error(`[ArenaClient] after Enter stillVal len=${stillVal.length} val="${stillVal.slice(0,50)}"`);
    if (stillVal && stillVal.trim().length > 0) {
      console.error('[ArenaClient] trying Control+Enter + form submit fallback');
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('Enter');
      await this.page.keyboard.up('Control');
      await this.page.waitForTimeout(400);
      // محاولة submit عبر evaluate
      await this.page.evaluate(() => {
        const ta = document.querySelector('textarea[placeholder="Ask anything…"]') as HTMLTextAreaElement;
        if (ta) {
          ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
          const form = ta.closest('form');
          if (form) form.requestSubmit();
        }
      }).catch(()=>{});
      await this.page.waitForTimeout(600);
      stillVal = await inputLocator.inputValue().catch(() => '');
      console.error(`[ArenaClient] after fallback stillVal len=${stillVal.length}`);
    }
    // اطبع URL بعد الإرسال لمعرفة إن انتقل ل thread
    console.error(`[ArenaClient] after send url=${this.page.url()} stillVal len=${stillVal.length}`);
    // انتظر قليل واطبع snapshot
    await this.page.waitForTimeout(1500);
    const afterBody = await this.page.evaluate(() => document.body.innerText.slice(0, 1500)).catch(()=> '');
    console.error(`[ArenaClient] after send body snippet: ${afterBody.slice(0,900).replace(/\n/g,' | ')}`);
    // كشف مودال تسجيل الدخول
    const needsLogin = afterBody.includes('Log In or Create Account') || afterBody.includes('Continue with Google');
    if (needsLogin) {
      console.error('[ArenaClient] ⚠️ arena.ai يتطلب تسجيل دخول - سيُحفظ الـ storageState بعد تسجيلك اليدوي');
      // احفظ state الحالي
      try {
        const p = join(this.sessionManager.getStorageDir(), 'browser-state.json');
        await this.context!.storageState({ path: p });
        console.error(`[ArenaClient] saved storageState to ${p}`);
      } catch {}
      // حاول إغلاق المودال للسماح برؤية المشكلة
      const closeBtn = this.page.locator('button:has-text("Close")').first();
      if (await closeBtn.isVisible({ timeout: 1000 }).catch(()=>false)) {
        await closeBtn.click().catch(()=>{});
        await this.page.waitForTimeout(500);
      }
      throw new Error('arena.ai requires login: افتح ARENA_HEADLESS=false وسجّل دخولك مرة واحدة (Google/email) ثم أعد التشغيل مع ARENA_HEADLESS=true وسيُستخدم الـ storageState المحفوظ');
    }
    // احفظ storageState بعد إرسال ناجح
    try {
      if (this.config.session.persistCookies && this.context) {
        const p = join(this.sessionManager.getStorageDir(), 'browser-state.json');
        await this.context.storageState({ path: p }).catch(()=>{});
      }
    } catch {}

    // Wait for response
    const response = await this.waitForResponse(params.stream);
    
    // Save to session
    const userMsg: ArenaMessage = {
      role: 'user',
      content: params.prompt,
      timestamp: Date.now(),
    };
    const assistantMsg: ArenaMessage = {
      role: 'assistant',
      content: response.text,
      timestamp: Date.now(),
      model: response.model,
    };
    await this.sessionManager.addMessage(sessionId, userMsg);
    await this.sessionManager.addMessage(sessionId, assistantMsg);

    return { ...response, sessionId };
  }

  private async addSystemPrompt(prompt: string): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    // Check if there's a system prompt field
    const sysInput = await this.page.$('[data-testid="system-prompt"], textarea[placeholder*="system" i]');
    if (sysInput) {
      await sysInput.fill(prompt);
    }
  }

  private async waitForResponse(stream: boolean): Promise<ArenaChatResult> {
    if (!this.page) throw new Error('Not initialized');

    let fullText = '';
    let lastText = '';
    let model = 'unknown';
    let stableCount = 0;
    const maxStableChecks = stream ? 10 : 3;
    const start = Date.now();
    const overallTimeout = this.config.timeouts.response;

    console.error('[ArenaClient] Waiting for response...');

    while (stableCount < maxStableChecks) {
      if (Date.now() - start > overallTimeout) {
        console.error(`[ArenaClient] Response timeout after ${overallTimeout}ms, returning partial: "${fullText.slice(0,200)}"`);
        break;
      }
      await this.page.waitForTimeout(stream ? 500 : 1000);
      
      // Debug: dump page html snapshot every 5s if no response
      const responses = await this.page.$$(this.config.selectors.responseContainer);
      if (responses.length === 0) {
        if ((Date.now() - start) % 5000 < 1100) {
          const url = this.page.url();
          const chatAreaHtml = await this.page.$eval('#chat-area', el => el.innerHTML.slice(0, 1800)).catch(() => 'no #chat-area');
          // ابحث عن نص البرومبت في الصفحة
          const bodyText = await this.page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => '');
          const promptFound = bodyText.includes('Hello, what model');
          const allDivs = await this.page.$$eval('div', els => els.slice(0,5).map(e => e.className.slice(0,80))).catch(() => []);
          console.error(`[ArenaClient] No response yet (${Math.round((Date.now()-start)/1000)}s) url=${url} promptFound=${promptFound} divs=${JSON.stringify(allDivs)} chatAreaHead=${chatAreaHtml.slice(0,250)}`);
          // أيضاً اطبع جزء من body
          console.error(`[ArenaClient] body snippet: ${bodyText.slice(0, 900).replace(/\n/g, ' | ')}`);
        }
        continue;
      }

      // Get the last assistant message
      const lastResponse = responses[responses.length - 1];
      const textEl = await lastResponse.$(this.config.selectors.responseText);
      if (!textEl) {
        // fallback: take textContent of container itself
        const fallbackText = await lastResponse.textContent() || '';
        if (fallbackText.trim().length > 0) {
          if (fallbackText !== lastText) {
            stableCount = 0;
            lastText = fallbackText;
            fullText = fallbackText;
            console.error(`[ArenaClient] Streaming (fallback): ${fallbackText.slice(0,120)}...`);
          } else {
            stableCount++;
          }
        }
        continue;
      }

      const currentText = await textEl.textContent() || '';
      if (currentText === lastText) {
        stableCount++;
      } else {
        stableCount = 0;
        lastText = currentText;
        fullText = currentText;
        console.error(`[ArenaClient] Streaming: ${currentText.slice(0,120)}...`);
      }

      // Check for streaming indicator
      const streaming = await lastResponse.$(this.config.selectors.streamingIndicator);
      if (!streaming && !stream) break;
    }

    // Try to extract model name from UI
    const modelEl = await this.page.$(this.config.selectors.modelSelector);
    if (modelEl) {
      model = await modelEl.textContent() || 'unknown';
    }

    console.error(`[ArenaClient] Final response ${fullText.length} chars`);

    return {
      text: fullText.trim() || '[No text extracted - check selectors]',
      model: model.trim(),
      sessionId: this.currentSessionId || '',
    };
  }

  async listModels(refresh: boolean = false): Promise<ArenaModelType[]> {
    const cached = await this.sessionManager.getModelsCache();
    if (cached && !refresh) return cached;

    if (!this.page) await this.initialize();
    if (!this.page) throw new Error('Failed to initialize page');
    await this.navigateToArena();

    const modelSelector = await this.page.$(this.config.selectors.modelSelector);
    if (!modelSelector) return [];

    await modelSelector.click();
    await this.page.waitForTimeout(500);

    const options = await this.page.$$(this.config.selectors.modelOptions);
    const models: ArenaModelType[] = [];

    for (const option of options) {
      const text = await option.textContent();
      if (!text) continue;
      // Parse model info from text (format varies)
      const parts = text.split(/\s*-\s*|\s*\(\s*|\s*\)\s*/).filter(Boolean);
      models.push({
        id: text.toLowerCase().replace(/\s+/g, '-'),
        name: parts[0] || text,
        provider: parts[1] || 'arena',
        description: parts.slice(2).join(' '),
      });
    }

    await this.sessionManager.setModelsCache(models);
    return models;
  }

  async getHistory(sessionId: string, limit: number = 20): Promise<ArenaMessage[]> {
    return this.sessionManager.getHistory(sessionId, limit);
  }

  async debugPage(): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    
    // Navigate to arena.ai first
    await this.page.goto(this.config.baseUrl, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(3000); // Wait for page to fully load
    
    console.error('\n=== ARENA.AI PAGE DEBUG ===');
    console.error('URL:', this.page.url());
    
// Get all interactive elements
    const elements = await this.page.$$eval('*', (els: Element[]) => 
      els
        .filter((el: Element) => {
          const tag = el.tagName.toLowerCase();
          const inputEl = el as Element & { type?: string };
          const type = inputEl.type;
          const role = el.getAttribute('role');
          const contentEditable = el.getAttribute('contenteditable');
          const placeholder = el.getAttribute('placeholder');
          const testId = el.getAttribute('data-testid');
          const className = el.className;
          
          return tag === 'textarea' || 
                 tag === 'button' || 
                 tag === 'select' || 
                 tag === 'input' ||
                 role === 'textbox' ||
                 role === 'combobox' ||
                 role === 'button' ||
                 contentEditable === 'true' ||
                 placeholder ||
                 testId ||
                 (typeof className === 'string' && (className.includes('input') || className.includes('chat') || className.includes('model')));
         })
        .map((el: Element) => {
          const inputEl = el as Element & { type?: string };
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id,
            class: el.className,
            role: el.getAttribute('role'),
            placeholder: el.getAttribute('placeholder'),
            'data-testid': el.getAttribute('data-testid'),
            type: inputEl.type,
            contenteditable: el.getAttribute('contenteditable'),
            text: el.textContent?.slice(0, 100),
            html: el.outerHTML?.slice(0, 200),
          };
        })
    );
    
    console.error('\n--- Interactive Elements ---');
    elements.forEach((el, i) => {
      console.error(`${i}:`, JSON.stringify(el, null, 2));
    });
    
    // Get page title and main content
    const title = await this.page.title();
    console.error('\n--- Page Title ---', title);
    
    // Look for common chat UI patterns
    const chatContainers = await this.page.$$eval('[class*="chat"], [class*="conversation"], [class*="message"], [id*="chat"], [id*="conversation"]', 
      els => els.map(el => ({ class: el.className, id: el.id, tag: el.tagName.toLowerCase() }))
    );
    console.error('\n--- Chat Containers ---', chatContainers);
    
    console.error('\n=== END DEBUG ===\n');
  }

  async close(): Promise<void> {
    if (this.context && this.config.session.persistCookies) {
      await this.context.storageState({ path: join(this.sessionManager.getStorageDir(), 'browser-state.json') }).catch(() => {});
    }
    await this.context?.close();
    await this.browser?.close();
    this.initialized = false;
    console.error('[ArenaClient] Closed');
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async debugModels(): Promise<void> {
    if (!this.page) throw new Error('Not initialized');
    
    await this.navigateToArena();
    await this.page.waitForTimeout(2000);
    
    console.error('\n=== ARENA.AI MODEL SELECTOR DEBUG ===');
    
    // Find model selector buttons
    const modelSelectors = await this.page.$$('button[role="combobox"]');
    console.error(`Found ${modelSelectors.length} combobox buttons`);
    
    for (let i = 0; i < modelSelectors.length; i++) {
      const btn = modelSelectors[i];
      const text = await btn.textContent();
      console.error(`\n--- Combobox ${i}: "${text}" ---`);
      
      // Click to open
      await btn.click();
      await this.page.waitForTimeout(1000);
      
      // Look for dropdown content - Radix portal often renders at end of body
      const dropdowns = await this.page.$$('[role="listbox"], [data-radix-collection], [cmdk-list], .radix-select-content, [data-state="open"]');
      console.error(`Found ${dropdowns.length} potential dropdowns`);
      
      for (let j = 0; j < dropdowns.length; j++) {
        const dd = dropdowns[j];
        const ddHtml = await dd.evaluate(el => el.outerHTML);
        console.error(`Dropdown ${j}:`, ddHtml.slice(0, 500));
        
        // Find options inside
        const options = await dd.$$('[role="option"], [cmdk-item], [data-value]');
        console.error(`  Options in dropdown ${j}: ${options.length}`);
        for (const opt of options) {
          const optText = await opt.textContent();
          console.error(`    - "${optText}"`);
        }
      }
      
      // Also check body for portals
      const bodyContent = await this.page.$eval('body', (b) => b.innerHTML);
      const portalMatches = bodyContent.match(/radix-select-content|cmdk|\[role="listbox"\]/gi);
      if (portalMatches) {
        console.error('Portals found in body:', portalMatches.length);
      }
      
      // Close by clicking again or pressing Escape
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
    
    // Also try to find ALL comboboxes and click each
    console.error('\n--- Trying ALL comboboxes ---');
    const allComboboxes = await this.page.$$('button[role="combobox"]');
    for (let i = 0; i < allComboboxes.length; i++) {
      const btn = allComboboxes[i];
      const text = await btn.textContent();
      console.error(`\nClicking combobox ${i}: "${text}"`);
      await btn.click();
      await this.page.waitForTimeout(1500);
      
      // Look for any new elements that appeared
      const newDropdowns = await this.page.$$('[role="listbox"][data-state="open"], [cmdk-list], .radix-select-content[data-state="open"]');
      for (let j = 0; j < newDropdowns.length; j++) {
        const dd = newDropdowns[j];
        const options = await dd.$$('[role="option"], [cmdk-item]');
        console.error(`  Dropdown ${j} has ${options.length} options`);
        for (const opt of options) {
          const optText = await opt.textContent();
          console.error(`    - "${optText}"`);
        }
      }
      
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
    
    // Now try clicking "Direct" mode to see if model selector appears
    console.error('\n--- Clicking "Direct" mode to see if model selector appears ---');
    const directBtn = await this.page.$('button[role="combobox"]:has-text("Direct")');
    if (directBtn) {
      await directBtn.click();
      await this.page.waitForTimeout(500);
      
      // Select "Direct" mode
      const directOption = await this.page.$('[role="option"]:has-text("Direct")');
      if (directOption) {
        await directOption.click();
        await this.page.waitForTimeout(2000);
        
        // Now look for model selector
        console.error('After selecting Direct mode, looking for model selector...');
        const newComboboxes = await this.page.$$('button[role="combobox"]');
        console.error(`Now found ${newComboboxes.length} combobox buttons`);
        for (let k = 0; k < newComboboxes.length; k++) {
          const btn = newComboboxes[k];
          const btnText = await btn.textContent();
          console.error(`  Combobox ${k}: "${btnText}"`);
        }
        
        // Click each new combobox
        for (let k = 0; k < newComboboxes.length; k++) {
          const btn = newComboboxes[k];
          await btn.click();
          await this.page.waitForTimeout(1000);
          
          const dropdowns = await this.page.$$('[role="listbox"][data-state="open"]');
          for (let j = 0; j < dropdowns.length; j++) {
            const dd = dropdowns[j];
            const options = await dd.$$('[role="option"], [cmdk-item]');
            console.error(`  Dropdown ${j} has ${options.length} options`);
            for (const opt of options) {
              const optText = await opt.textContent();
              console.error(`    - "${optText}"`);
            }
          }
          
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(500);
        }
      }
    }
    
    // Try clicking sidebar toggle to see if model settings are there
    console.error('\n--- Trying sidebar toggle ---');
    const sidebarToggle = await this.page.$('button[aria-label="Toggle Sidebar"], button:has-text("Menu"), [data-testid*="sidebar"]');
    if (sidebarToggle) {
      console.error('Found sidebar toggle, clicking...');
      await sidebarToggle.click();
      await this.page.waitForTimeout(2000);
      
      // Look for model-related content in sidebar
      const sidebarContent = await this.page.$eval('body', (b) => b.innerText);
      const modelLines = sidebarContent.split('\n').filter(l => l.toLowerCase().includes('model'));
      console.error('Model-related lines in sidebar:', modelLines);
      
      // Look for any new comboboxes or selects
      const newSelects = await this.page.$$('select, button[role="combobox"], [role="listbox"]');
      console.error(`After sidebar open, found ${newSelects.length} select/combobox elements`);
      for (let k = 0; k < newSelects.length; k++) {
        const el = newSelects[k];
        const text = await el.textContent();
        const html = await el.evaluate(e => e.outerHTML);
        console.error(`  Element ${k}: "${text?.slice(0, 100)}"`);
        console.error(`    HTML: ${html.slice(0, 200)}`);
      }
      
      // Close sidebar
      await this.page.keyboard.press('Escape');
      await this.page.waitForTimeout(500);
    }
    
    console.error('\n=== END MODEL DEBUG ===\n');
  }
}