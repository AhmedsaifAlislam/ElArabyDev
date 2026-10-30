import { useEffect, useState } from 'preact/hooks';
import { Card } from '../ui/Card';
import { getStoredSelectors, saveStoredSelectors } from '../../services/api';

interface PortalConfig {
  powerapps: { url: string; active: boolean };
  crm: { url: string; active: boolean };
  asc: { url: string; active: boolean };
}

export function AutoFillerTab() {
  const [config, setConfig] = useState<PortalConfig | null>(null);
  const [selectors, setSelectors] = useState<Record<string, string[]>>({});
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const result = await getStoredSelectors();
      setSelectors(result);
      const firstKey = Object.keys(result)[0];
      if (firstKey) setSelectedKey(firstKey);
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveStoredSelectors(selectors);
      alert('تم حفظ الإعدادات بنجاح ✓');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6">
        <Card title="إعدادات التقفيلات" icon="⚙️">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                الصفحة النشطة (Active Page)
              </label>
              <div className="space-y-2">
                {(Object.entries(config || {}) as Array<[string, { url: string }]>).map(([key, portal]) => (
                  <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-primary/40 transition-colors">
                    <div>
                      <div className="font-semibold">{key}</div>
                      <div className="text-xs text-slate-400" dir="ltr">{portal.url}</div>
                    </div>
                    <button
                      className={[
                        'px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                        selectors[key]
                          ? 'bg-success text-white'
                          : 'border border-slate-300 text-slate-500 hover:bg-slate-50',
                      ].join(' ')}
                      onClick={() => setSelectedKey(key)}
                    >
                      {selectors[key] ? '✓ مفعل' : 'تفعيل'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {selectedKey && (
              <div>
                <label className="block text-sm font-semibold text-slate-600 mb-1.5">
                  الحقول المستخرجة — {selectedKey}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(selectors[selectedKey] || []).map((field, i) => (
                    <span key={i} className="badge badge-info" dir="ltr">{field}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
