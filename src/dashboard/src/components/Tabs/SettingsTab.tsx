import { useState } from 'preact/hooks';
import { Card } from '../ui/Card';
import { smartLog } from '../../services/storage';

export function SettingsTab() {
  const [autoFillEnabled, setAutoFillEnabled] = useState(true);
  const [crmEnabled, setCrmEnabled] = useState(true);
  const [notifications, setNotifications] = useState(true);

  const handleClearLogs = async () => {
    if (!confirm('سيتم مسح جميع السجلات. هل أنت متأكد؟')) return;
    await smartLog.clearAll();
    alert('تم مسح السجلات ✓');
  };

  const Toggle = ({
    checked,
    onChange,
    label,
    desc,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
    label: string;
    desc: string;
  }) => (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="font-semibold text-sm">{label}</div>
        <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={[
          'w-11 h-6 rounded-full relative transition-colors',
          checked ? 'bg-success' : 'bg-slate-300',
        ].join(' ')}
        aria-pressed={checked}
      >
        <span
          className={[
            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all',
            checked ? 'right-0.5' : 'right-[22px]',
          ].join(' ')}
        />
      </button>
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      <Card title="الإعدادات العامة" icon="⚙️">
        <div className="divide-y divide-slate-100">
          <Toggle
            label="التقفيل التلقائي"
            desc="تعبئة حقول النماذج تلقائيًا عند فتح الصفحات"
            checked={autoFillEnabled}
            onChange={setAutoFillEnabled}
          />
          <Toggle
            label="استخراج البلاغات (CRM)"
            desc="تمكين البحث عن بلاغ من ملفات Excel"
            checked={crmEnabled}
            onChange={setCrmEnabled}
          />
          <Toggle
            label="الإشعارات"
            desc="إشعارات عند اكتمال العمليات"
            checked={notifications}
            onChange={setNotifications}
          />
        </div>
      </Card>

      <Card title="إدارة البيانات" icon="🗑️">
        <div className="flex flex-col gap-3">
          <button className="btn btn-danger btn-sm w-fit" onClick={handleClearLogs}>
            🗑️ مسح السجلات
          </button>
        </div>
      </Card>

      <Card title="عن النظام" icon="ℹ️">
        <div className="text-sm text-slate-600 space-y-1">
          <div className="flex justify-between">
            <span>الإصدار</span>
            <span dir="ltr">2.2.0</span>
          </div>
          <div className="flex justify-between">
            <span>التخزين</span>
            <span>chrome.storage.local</span>
          </div>
          <div className="flex justify-between">
            <span>المصدر</span>
            <span>master-portal/dashboard</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
