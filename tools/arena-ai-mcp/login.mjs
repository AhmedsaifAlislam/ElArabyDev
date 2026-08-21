import { ArenaClient } from './dist/arena-client.js';
import { SessionManager } from './dist/session-manager.js';
import { ARENA_CONFIG } from './dist/config.js';

const sm = new SessionManager(ARENA_CONFIG.session.storageDir);
const client = new ArenaClient(sm, { ...ARENA_CONFIG, session: { ...ARENA_CONFIG.session, persistCookies: true } });

// شغّل headful ليتمكن المستخدم من تسجيل الدخول يدوياً
console.log('Opening arena.ai in headed mode for login...');
console.log('  سيُحاول إرسال رسالة تجريبية لتفعيل Google OAuth تلقائياً');
console.log('  1) في النافذة التي ستظهر، اكتب أي شيء أو انتظر حتى يظهر Google Sign-in');
console.log('  2) أكمل تسجيل الدخول عبر Google ثم تأكد أنك تستطيع إرسال رسالة');
console.log('  3) بعد التأكد، ارجع هنا واضغط Enter لحفظ الجلسة');
await client.initialize(false);
await client['page'].goto(ARENA_CONFIG.baseUrl, { waitUntil: 'domcontentloaded' });
await client['page'].waitForTimeout(2500);
console.log('  URL:', client['page'].url());
// حاول إرسال رسالة لتفعيل OAuth
try {
  const ta = client['page'].locator('textarea[placeholder="Ask anything…"]').first();
  if (await ta.isVisible({ timeout: 3000 }).catch(()=>false)) {
    await ta.click();
    await ta.pressSequentially('Hello', { delay: 50 });
    await client['page'].waitForTimeout(400);
    const btn = client['page'].locator('button[type="submit"]').last();
    if (await btn.isEnabled().catch(()=>false)) {
      console.log('  -> محاولة إرسال لتفعيل تسجيل الدخول...');
      await btn.click({ force: true }).catch(()=>{});
      await client['page'].waitForTimeout(1500);
      console.log('  -> إذا ظهر Google Sign-in، أكمله الآن');
    }
  }
} catch {}
console.log('  انتظر حتى تكتمل عملية تسجيل الدخول...');

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
