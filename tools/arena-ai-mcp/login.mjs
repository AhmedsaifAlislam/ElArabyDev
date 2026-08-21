import { ArenaClient } from './dist/arena-client.js';
import { SessionManager } from './dist/session-manager.js';
import { ARENA_CONFIG } from './dist/config.js';

const sm = new SessionManager(ARENA_CONFIG.session.storageDir);
const client = new ArenaClient(sm, { ...ARENA_CONFIG, session: { ...ARENA_CONFIG.session, persistCookies: true } });

// شغّل headful ليتمكن المستخدم من تسجيل الدخول يدوياً
console.log('Opening arena.ai in headed mode for login...');
console.log('  1) سجّل دخولك عبر Google/email في النافذة التي ستظهر');
console.log('  2) بعد التأكد أنك تستطيع إرسال رسالة، اضغط Enter هنا لحفظ الجلسة');
await client.initialize(false);
await client['page'].goto(ARENA_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' });
console.log('  URL:', client['page'].url());
console.log('  انتظر حتى تكتمل الصفحة ثم سجّل الدخول...');

// انتظر حتى يضغط المستخدم Enter
process.stdin.resume();
console.log('\nاضغط Enter بعد إتمام تسجيل الدخول...');
await new Promise(res => process.stdin.once('data', res));

try {
  const p = client['sessionManager'].getStorageDir() + '/browser-state.json';
  await client['context'].storageState({ path: p });
  console.log(`✅ تم حفظ الجلسة في ${p}`);
  console.log('يمكنك الآن تشغيل: ARENA_HEADLESS=true node dist/index.js أو عبر opencode');
} catch (e) {
  console.error('فشل الحفظ', e);
} finally {
  await client.close();
  process.exit(0);
}
