import http from 'node:http';
import { URL } from 'node:url';
import { ArenaClient } from './arena-client.js';
import { SessionManager } from './session-manager.js';
import { ARENA_CONFIG } from './config.js';

const PORT = Number(process.env.ARENA_HTTP_PORT || 8787);
const HOST = process.env.ARENA_HTTP_HOST || '127.0.0.1';

const sessionManager = new SessionManager(ARENA_CONFIG.session.storageDir);
const arenaClient = new ArenaClient(sessionManager, ARENA_CONFIG);

let initialized = false;
async function ensureInit() {
  if (!initialized) {
    const headless = process.env.ARENA_HEADLESS !== 'false';
    await arenaClient.initialize(headless);
    initialized = true;
  }
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(data, null, 2));
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => buf += c);
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (path === '/health' && req.method === 'GET') {
      json(res, 200, { status: 'ok', initialized, storageDir: sessionManager.getStorageDir() });
      return;
    }

    if (path === '/api/models' && req.method === 'GET') {
      await ensureInit();
      const refresh = url.searchParams.get('refresh') === 'true';
      const models = await arenaClient.listModels(refresh);
      json(res, 200, { models });
      return;
    }

    if (path === '/' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(`<!doctype html><meta charset="utf-8"><title>Arena AI MCP</title><style>body{font-family:system-ui;padding:32px;max-width:720px;margin:auto}code{background:#eee;padding:2px 6px;border-radius:4px}pre{background:#f5f5f5;padding:12px;overflow:auto}</style><h1>Arena AI MCP ✓</h1><p>الخادم يعمل. استخدم <code>POST /api/chat</code> وليس GET.</p><pre>curl -X POST http://127.0.0.1:${PORT}/api/chat -H "Content-Type: application/json" -d '{"prompt":"Hello","newSession":true}'</pre><p><a href="/health">/health</a> · <a href="/api/models">/api/models</a> · <a href="/api/sessions">/api/sessions</a></p>`);
      return;
    }

    if (path === '/api/chat' && req.method === 'GET') {
      json(res, 405, { error: 'Use POST', hint: 'POST /api/chat with JSON {prompt, model?, systemPrompt?, sessionId?, newSession?}', example: { prompt: 'Hello', newSession: true } });
      return;
    }

    if (path === '/api/chat' && req.method === 'POST') {
      await ensureInit();
      const body = await readBody(req) as { prompt: string; model?: string; systemPrompt?: string; sessionId?: string; newSession?: boolean; stream?: boolean };
      if (!body.prompt) {
        json(res, 400, { error: 'prompt required' });
        return;
      }
      // SSE if client wants stream
      if (body.stream && req.headers.accept?.includes('text/event-stream')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
        try {
          const result = await arenaClient.sendMessage({
            prompt: body.prompt,
            model: body.model,
            systemPrompt: body.systemPrompt,
            sessionId: body.sessionId,
            newSession: body.newSession ?? false,
            stream: true,
          });
          // For now send final as single event (future: chunked)
          res.write(`data: ${JSON.stringify(result)}\n\n`);
          res.write(`event: done\ndata: {}\n\n`);
        } catch (e) {
          res.write(`event: error\ndata: ${JSON.stringify({ error: String(e) })}\n\n`);
        }
        res.end();
        return;
      }
      const result = await arenaClient.sendMessage({
        prompt: body.prompt,
        model: body.model,
        systemPrompt: body.systemPrompt,
        sessionId: body.sessionId,
        newSession: body.newSession ?? false,
        stream: false,
      });
      json(res, 200, result);
      return;
    }

    if (path === '/api/sessions' && req.method === 'GET') {
      const sessions = await sessionManager.listSessions();
      json(res, 200, { sessions });
      return;
    }

    if (path.startsWith('/api/history/') && req.method === 'GET') {
      const sessionId = decodeURIComponent(path.slice('/api/history/'.length));
      const limit = Number(url.searchParams.get('limit') || '20');
      const history = await arenaClient.getHistory(sessionId, limit);
      json(res, 200, { sessionId, history });
      return;
    }

    if (path.startsWith('/api/sessions/') && req.method === 'DELETE') {
      const sessionId = decodeURIComponent(path.slice('/api/sessions/'.length));
      await sessionManager.deleteSession(sessionId);
      json(res, 200, { deleted: sessionId });
      return;
    }

    // Debug endpoints
    if (path === '/api/debug/page' && req.method === 'POST') {
      await ensureInit();
      await arenaClient.debugPage();
      json(res, 200, { ok: true });
      return;
    }
    if (path === '/api/debug/models' && req.method === 'POST') {
      await ensureInit();
      await arenaClient.debugModels();
      json(res, 200, { ok: true });
      return;
    }

    json(res, 404, { error: 'not found', path });
  } catch (e) {
    console.error('[HTTP]', e);
    json(res, 500, { error: String(e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ArenaAI HTTP] http://${HOST}:${PORT}`);
  console.log(`  POST /api/chat  {prompt, model?, systemPrompt?, sessionId?, newSession?, stream?}`);
  console.log(`  GET  /api/models?refresh=true`);
  console.log(`  GET  /api/sessions`);
  console.log(`  GET  /api/history/:sessionId?limit=20`);
  console.log(`  GET  /health`);
});

process.on('SIGINT', async () => { await arenaClient.close(); process.exit(0); });
process.on('SIGTERM', async () => { await arenaClient.close(); process.exit(0); });
