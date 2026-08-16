import { storageGet, storageSet } from './storage';

/**
 * Service for fetching portal configs and extension metadata
 */

export interface PortalInfo {
  name: string;
  url: string;
  active: boolean;
}

export async function getPortalConfig(): Promise<Record<string, any> | null> {
  // Config injected at build time via manifest web_accessible_resources
  try {
    const res = await fetch(chrome.runtime.getURL('portal-config/portal-config.js'));
    if (!res.ok) return null;
    const text = await res.text();
    // Extract the PORTAL assignment via regex (config is a plain JS file)
    const match = text.match(/const\s+PORTAL\s*=\s*(\{[\s\S]*?\});/);
    if (!match) return null;
    return JSON.parse(match[1].replace(/'/g, '"'));
  } catch {
    return null;
  }
}

export async function getPortals(): Promise<PortalInfo[]> {
  const config = await getPortalConfig();
  if (!config) return [];

  const portals: PortalInfo[] = [];
  for (const [key, portal] of Object.entries(config)) {
    if (portal && typeof portal === 'object' && portal.url) {
      portals.push({
        name: key,
        url: portal.url,
        active: false,
      });
    }
  }
  return portals;
}

/**
 * Get all registered tab IDs from storage (used by AutoFiller)
 */
export async function getStoredSelectors(): Promise<Record<string, string[]>> {
  const result = await storageGet<Record<string, string[]>>('PORTAL_SELECTORS');
  return result.PORTAL_SELECTORS ?? {};
}

export async function saveStoredSelectors(selectors: Record<string, string[]>): Promise<void> {
  await storageSet({ PORTAL_SELECTORS: selectors });
}
