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

    this.context = await this.browser.newContext({
      userAgent: this.config.browser.userAgent,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US',
      timezoneId: 'UTC',
      permissions: ['clipboard-read', 'clipboard-write'],
    });

    // Persistent session storage for cookies/localStorage
    if (this.config.session.persistCookies) {
      await this.context.storageState({ path: join(this.sessionManager.getStorageDir(), 'browser-state.json') }).catch(() => {});
    }

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeouts.element);
    this.page.setDefaultNavigationTimeout(this.config.timeouts.navigation);

    // Block unnecessary resources for speed
    await this.page.route('**/*', (route) => {
      const resourceType = route.request().resourceType();
      if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });

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
    
    // Wait for chat input to be visible
    await this.page.waitForSelector(this.config.selectors.chatInput, { 
      state: 'visible', 
      timeout: this.config.timeouts.navigation 
    });

    // Check if logged in
    const loginPrompt = await this.page.$(this.config.selectors.loginPrompt);
    if (loginPrompt) {
      console.error('[ArenaClient] ⚠️ Login required — please authenticate in the browser');
      // In headless mode, this will fail. User must pre-authenticate or we handle it.
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

    const input = await this.page.waitForSelector(this.config.selectors.chatInput, { state: 'visible' });
    await input.fill(params.prompt);

    const sendBtn = await this.page.$(this.config.selectors.sendButton);
    if (sendBtn) {
      await sendBtn.click();
    } else {
      await this.page.keyboard.press('Enter');
    }

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

    while (stableCount < maxStableChecks) {
      await this.page.waitForTimeout(stream ? 500 : 1000);
      
      const responses = await this.page.$$(this.config.selectors.responseContainer);
      if (responses.length === 0) continue;

      // Get the last assistant message
      const lastResponse = responses[responses.length - 1];
      const textEl = await lastResponse.$(this.config.selectors.responseText);
      if (!textEl) continue;

      const currentText = await textEl.textContent() || '';
      if (currentText === lastText) {
        stableCount++;
      } else {
        stableCount = 0;
        lastText = currentText;
        fullText = currentText;
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

    return {
      text: fullText.trim(),
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
    
    console.error('\n=== END MODEL DEBUG ===\n');
  }
}