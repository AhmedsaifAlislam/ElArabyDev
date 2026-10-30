// Global type declarations for the dashboard
// Re-export preact types to make them available for jsxImportSource

/// <reference types="preact" />

declare module 'preact/hooks' {
  import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, useReducer, useId, useDebugValue } from 'preact';
  export { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback, useContext, useReducer, useId, useDebugValue };
}

declare module 'preact/jsx-runtime' {
  import { JSX } from 'preact';
  export namespace JSX {
    interface IntrinsicElements extends JSX.IntrinsicElements {}
  }
  export const jsx: (type: any, props: any, key?: string | number) => JSX.Element;
  export const jsxs: (type: any, props: any, key?: string | number) => JSX.Element;
  export const jsxDEV: (type: any, props: any, key?: string | number) => JSX.Element;
}

// Augment Window for shared modules (storage-proxy, smart-log)
interface Window {
  storageGet: <T = any>(keys: string | string[]) => Promise<Record<string, T>>;
  storageSet: (data: Record<string, any>) => Promise<void>;
  storageRemove: (keys: string | string[]) => Promise<void>;
  bg: <T = any>(action: string, extra?: Record<string, any>) => Promise<T>;
  SmartLog: {
    addEntry: (actionType: string, details: Record<string, any>) => Promise<void>;
    getEntries: (limit?: number) => Promise<any[]>;
    clearAll: () => Promise<void>;
  };
  logEvent: (actionType: string, details: Record<string, any>) => Promise<void>;
  getLog: (options?: { filter?: string; limit?: number }) => Promise<any[]>;
  clearLog: () => Promise<void>;
}