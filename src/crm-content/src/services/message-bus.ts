/**
 * CRM Message Bus — Wrapper for chrome.tabs.sendMessage / onMessage
 * Uses unified message-bus from shared
 */

import { messageBus, sendMessage, notify, onMessage } from '../../../shared/message-bus';

export interface CRMPayload {
  action: string;
  [key: string]: any;
}

export interface CRMResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Send message to background and wait for response
 */
export async function sendToBackground<T = any>(action: string, payload: any = {}, timeout = 30000): Promise<CRMResponse> {
  try {
    const data = await sendMessage(action, payload, timeout);
    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Notify background (fire and forget)
 */
export function notifyBackground(action: string, payload: any) {
  notify(action, payload);
}

/**
 * Listen for messages from background/popup
 */
export function onCRMMessage<T = any>(action: string, handler: (payload: any, sendResponse: (response: CRMResponse) => void) => void | Promise<void>) {
  return onMessage(action, async (payload, sendResponse) => {
    try {
      await handler(payload, (response) => sendResponse(response));
    } catch (err: any) {
      sendResponse({ success: false, error: err.message });
    }
  });
}

/**
 * Specific CRM actions
 */
export const CRMActions = {
  // Popup → Content
  START_EXTRACTION: 'crm:startExtraction',
  STOP_EXTRACTION: 'crm:stopExtraction',
  GET_STATUS: 'crm:getStatus',
  EXPORT_RESULTS: 'crm:exportResults',

  // Content → Popup
  EXTRACTION_PROGRESS: 'crm:extractionProgress',
  EXTRACTION_COMPLETE: 'crm:extractionComplete',
  EXTRACTION_ERROR: 'crm:extractionError',
  BATCH_COMPLETE: 'crm:batchComplete',
  LOG: 'crm:log',

  // Background ↔ Content
  GET_STORAGE: 'crm:getStorage',
  SET_STORAGE: 'crm:setStorage',
} as const;

/**
 * Type-safe message sender for content script
 */
export class CRMContentMessenger {
  private static handlers = new Map<string, (payload: any) => Promise<any>>();

  static on(action: string, handler: (payload: any) => Promise<any>) {
    this.handlers.set(action, handler);
    // Register with message bus
    onCRMMessage(action, async (payload, sendResponse) => {
      try {
        const result = await handler(payload);
        sendResponse({ success: true, data: result });
      } catch (err: any) {
        sendResponse({ success: false, error: err.message });
      }
    });
  }

  static async sendToPopup(action: string, payload: any): Promise<any> {
    return sendToBackground(action, { target: 'popup', ...payload });
  }

  static notifyPopup(action: string, payload: any) {
    notifyBackground(action, { target: 'popup', ...payload });
  }
}