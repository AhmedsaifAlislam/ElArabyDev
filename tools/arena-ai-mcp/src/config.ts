export const ARENA_CONFIG = {
  baseUrl: 'https://arena.ai/text/direct',
  selectors: {
    // Actual selectors from arena.ai DOM (from debug)
    newChatButton: 'button:has-text("New Chat"), a:has-text("New Chat"), [data-testid*="new-chat"]',
    modelSelector: 'button[aria-label*="Model" i], button:has-text("Model"), select:has(option), [data-testid*="model"], [data-radix-select-trigger]',
    modelOptions: '[role="option"], [data-value], [cmdk-item]',
    chatInput: 'textarea[placeholder="Ask anything…"], textarea[placeholder*="Ask" i], textarea.body-base',
    sendButton: 'button[type="submit"].text-interactive-active, button[type="submit"]:has(svg), footer button[type="submit"]',
    responseContainer: '#chat-area [data-message-id], #chat-area .prose, #chat-area [role="article"], #chat-area .message, #chat-area div[class*="prose"], #chat-area div[class*="markdown"]',
    responseText: '.prose, .markdown, [data-testid*="content"], .message-content',
    streamingIndicator: '.streaming, .typing, [data-testid*="stream"], .animate-pulse',
    chatHistory: '.chat-history, .conversation-list, [data-testid*="history"], nav, aside',
    conversationItem: '[data-testid*="conversation"], .conversation, [role="button"]',
    userMessage: '[data-role="user"], .user-message, .human-message',
    assistantMessage: '[data-role="assistant"], .assistant-message, .ai-message, .bot-message',
    errorMessage: '.error, .toast-error, [role="alert"], [data-testid*="error"]',
    loginPrompt: 'button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Login"), a:has-text("Sign in")',
    addFilesButton: 'button:has-text("Add files")',
  },
  timeouts: {
    navigation: 60000,
    element: 30000,
    response: 180000,
    streamingChunk: 10000,
  },
  browser: {
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1280,800',
    ],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    // استخدم بروفايل Chrome الحقيقي للمستخدم لتجاوز تسجيل الدخول
    useChromeProfile: true,
    chromeUserDataDir: 'C:\\Users\\Zain\\AppData\\Local\\Google\\Chrome\\User Data',
    chromeChannel: 'chrome' as const,
  },
  session: {
    storageDir: '.arena-session',
    maxHistory: 50,
    persistCookies: true,
  },
} as const;

export type ArenaConfig = typeof ARENA_CONFIG;