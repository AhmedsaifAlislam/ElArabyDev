import { useState } from 'preact/hooks';
import { PartsTab } from './components/Tabs/PartsTab';
import { AutoFillerTab } from './components/Tabs/AutoFillerTab';
import { LogsTab } from './components/Tabs/LogsTab';
import { SettingsTab } from './components/Tabs/SettingsTab';

type TabId = 'parts' | 'autofiller' | 'logs' | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: 'parts', label: 'قطع الغيار', icon: '🔧' },
  { id: 'autofiller', label: 'التقفيلات', icon: '⚙️' },
  { id: 'logs', label: 'السجل', icon: '📋' },
  { id: 'settings', label: 'الإعدادات', icon: '⚙️' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('parts');

  return (
    <div className="min-h-screen">
      <header className="bg-primary text-white shadow-md sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚗</span>
            <div>
              <h1 className="text-xl font-bold">لوحة المساعد الذكي</h1>
              <p className="text-xs text-white/70">نظام العربي — El Araby System</p>
            </div>
          </div>
          <span className="badge bg-white/20 text-white">الإصدار 2.2.0</span>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200 sticky top-[73px] z-10">
        <div className="max-w-7xl mx-auto px-6 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px flex items-center gap-2',
                activeTab === tab.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50',
              ].join(' ')}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {activeTab === 'parts' && <PartsTab />}
        {activeTab === 'autofiller' && <AutoFillerTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-4 text-center text-xs text-slate-400">
        نظام العربي سيستم — أدوات تلقائية لتحسين العمل اليومي
      </footer>
    </div>
  );
}
