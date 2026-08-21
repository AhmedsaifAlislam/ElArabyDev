import { ArenaClient } from './dist/arena-client.js';
import { SessionManager } from './dist/session-manager.js';
import { ARENA_CONFIG } from './dist/config.js';
const sm = new SessionManager(ARENA_CONFIG.session.storageDir);
const client = new ArenaClient(sm, ARENA_CONFIG);
await client.initialize(true);
try {
  console.log('sending');
  const r = await client.sendMessage({ prompt: 'Hello, reply OK', newSession: true, stream: false });
  console.log('RESULT', JSON.stringify(r,null,2).slice(0,2000));
} catch(e){
  console.error('ERR', e.message);
}
await client.close();
