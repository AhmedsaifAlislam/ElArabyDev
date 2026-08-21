import { promises as fs } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { ArenaSession, ArenaMessage, ArenaModel } from './types.js';
import { ARENA_CONFIG } from './config.js';

export class SessionManager {
  private storageDir: string;
  private sessions: Map<string, ArenaSession> = new Map();
  private modelsCache: ArenaModel[] | null = null;
  private modelsCacheTime = 0;
  private readonly MODELS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(storageDir?: string) {
    this.storageDir = storageDir || resolve(homedir(), '.arena-ai-mcp', 'sessions');
    this.ensureStorageDir();
  }

  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (e) {
      console.error('[SessionManager] Failed to create storage dir:', e);
    }
  }

  private sessionFilePath(sessionId: string): string {
    return join(this.storageDir, `${sessionId}.json`);
  }

  private modelsFilePath(): string {
    return join(this.storageDir, 'models-cache.json');
  }

  async loadSession(sessionId: string): Promise<ArenaSession | null> {
    if (this.sessions.has(sessionId)) {
      return this.sessions.get(sessionId)!;
    }

    try {
      const data = await fs.readFile(this.sessionFilePath(sessionId), 'utf-8');
      const session = JSON.parse(data) as ArenaSession;
      this.sessions.set(sessionId, session);
      return session;
    } catch {
      return null;
    }
  }

  async saveSession(session: ArenaSession): Promise<void> {
    this.sessions.set(session.id, session);
    try {
      await fs.writeFile(this.sessionFilePath(session.id), JSON.stringify(session, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SessionManager] Failed to save session:', e);
    }
  }

  async createSession(sessionId?: string): Promise<ArenaSession> {
    const id = sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();
    const session: ArenaSession = {
      id,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.saveSession(session);
    return session;
  }

  async addMessage(sessionId: string, message: ArenaMessage): Promise<ArenaSession> {
    let session = await this.loadSession(sessionId);
    if (!session) {
      session = await this.createSession(sessionId);
    }
    session.messages.push(message);
    session.updatedAt = Date.now();
    if (session.messages.length > ARENA_CONFIG.session.maxHistory) {
      session.messages = session.messages.slice(-ARENA_CONFIG.session.maxHistory);
    }
    await this.saveSession(session);
    return session;
  }

  async getHistory(sessionId: string, limit: number): Promise<ArenaMessage[]> {
    const session = await this.loadSession(sessionId);
    if (!session) return [];
    return session.messages.slice(-limit);
  }

  async listSessions(): Promise<ArenaSession[]> {
    try {
      const files = await fs.readdir(this.storageDir);
      const sessions: ArenaSession[] = [];
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'models-cache.json') {
          const session = await this.loadSession(file.slice(0, -5));
          if (session) sessions.push(session);
        }
      }
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
    try {
      await fs.unlink(this.sessionFilePath(sessionId));
    } catch {}
  }

  async getModelsCache(): Promise<ArenaModel[] | null> {
    if (this.modelsCache && Date.now() - this.modelsCacheTime < this.MODELS_CACHE_TTL) {
      return this.modelsCache;
    }
    try {
      const data = await fs.readFile(this.modelsFilePath(), 'utf-8');
      const cached = JSON.parse(data) as { models: ArenaModel[]; timestamp: number };
      if (Date.now() - cached.timestamp < this.MODELS_CACHE_TTL) {
        this.modelsCache = cached.models;
        this.modelsCacheTime = cached.timestamp;
        return this.modelsCache;
      }
    } catch {}
    return null;
  }

  async setModelsCache(models: ArenaModel[]): Promise<void> {
    this.modelsCache = models;
    this.modelsCacheTime = Date.now();
    try {
      await fs.writeFile(this.modelsFilePath(), JSON.stringify({ models, timestamp: this.modelsCacheTime }, null, 2), 'utf-8');
    } catch (e) {
      console.error('[SessionManager] Failed to cache models:', e);
    }
  }

  getStorageDir(): string {
    return this.storageDir;
  }
}