import { ArenaClient } from './dist/arena-client.js';
import { SessionManager } from './dist/session-manager.js';
import { ARENA_CONFIG } from './dist/config.js';
const sm = new SessionManager(ARENA_CONFIG.session.storageDir);
const client = new ArenaClient(sm, ARENA_CONFIG);
await client.initialize(true);
console.log('init ok');
try {
  const r = await client.sendMessage({ prompt: 'Hello arena, reply with OK', newSession: true, stream: false });
  console.log('SUCCESS', JSON.stringify(r,null,2).slice(0,3000));
} catch(e){ console.error('FAIL', e.message); }
await client.close();
