/**
 * Dashboard Message Bus — Communicates with background/content scripts
 */

declare const chrome: any;

export interface MessageEnvelope<TPayload = any> {
  action: string;
  payload: TPayload;
  requestId?: string;
}

export interface ResponseEnvelope<TResponse = any> {
  success: boolean;
  data?: TResponse;
  error?: string;
  requestId?: string;
}

type Handler<T> = (payload: T, sendResponse: (response: ResponseEnvelope) => void) => void | Promise<void>;

export class MessageBus {
  private static instance: MessageBus;
  private handlers = new Map<string, Handler<any>>();
  private pendingRequests = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private port: chrome.runtime.Port | null = null;
  private requestCounter = 0;

  private constructor() {
    this.#initRuntimeListener();
  }

  static getInstance(): MessageBus {
    if (!MessageBus.instance) {
      MessageBus.instance = new MessageBus();
    }
    return MessageBus.instance;
  }

  #initRuntimeListener() {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;

    chrome.runtime.onMessage.addListener((message: MessageEnvelope, _sender, sendResponse) => {
      if (!message?.action) return true;

      const handler = this.handlers.get(message.action);
      if (handler) {
        const payload = message.payload;
        const wrappedSendResponse = (response: ResponseEnvelope) => {
          sendResponse(response);
        };
        Promise.resolve(handler(message.payload, wrappedSendResponse)).catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
        return true;
      }
      return false;
    });

    chrome.runtime.onConnect.addListener((port) => {
      port.onMessage.addListener((message: MessageEnvelope) => {
        if (!message?.action) return;
        const handler = this.handlers.get(message.action);
        if (handler) {
          Promise.resolve(handler(message.payload, (response) => {
            port.postMessage({ ...response, requestId: message.requestId });
          }).catch((err) => {
            port.postMessage({ success: false, error: err.message, requestId: message.requestId });
          }));
        }
      });
    });
  }

  on<T = any>(action: string, handler: Handler<T>): () => void {
    this.handlers.set(action, handler);
    return () => this.handlers.delete(action);
  }

  async send<TRequest, TResponse>(action: string, payload: TRequest, timeout = 10000): Promise<TResponse> {
    const requestId = `req_${Date.now()}_${++this.requestCounter}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Message timeout: ${action}`));
      }, timeout);

      this.pendingRequests.set(requestId, { resolve, reject });

      const message: MessageEnvelope = { action, payload, requestId };

      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({ ...message, requestId }, (response: ResponseEnvelope) => {
          clearTimeout(timeoutId);
          this.pendingRequests.delete(requestId);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response?.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      } else {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(requestId);
        reject(new Error('chrome.runtime not available'));
      }
    });
  }

  notify(action: string, payload: any) {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action, payload }).catch(() => {});
    }
  }

  connect(portName: string): chrome.runtime.Port | null {
    if (typeof chrome !== 'undefined' && chrome.runtime?.connect) {
      const port = chrome.runtime.connect({ name: portName });
      port.onDisconnect.addListener(() => {});
      return port;
    }
    return null;
  }
}

export const messageBus = MessageBus.getInstance();

export const sendMessage = <TRequest, TResponse>(action: string, payload: TRequest, timeout?: number) =>
  messageBus.send<TRequest, TResponse>(action, payload, timeout);

export const notify = (action: string, payload: any) => messageBus.notify(action, payload);

export const onMessage = <T>(action: string, handler: Handler<T>) => messageBus.on<T>(action, handler);