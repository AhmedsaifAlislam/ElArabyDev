import { useEffect, useState } from 'preact/hooks';
import { Card } from '../ui/Card';
import { useLogs } from '../../hooks/useStorage';

export function LogsTab() {
  const { logs, loading, refresh } = useLogs();
  const [filter, setFilter] = useState('all');

  const filtered = logs.filter((l) => {
    if (filter === 'all') return true;
    return String(l.actionType || '').includes(filter);
  });

  const LEVEL_STYLE: Record<string, string> = {
    info: 'badge-info',
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-danger',
    ok: 'badge-success',
    warn: 'badge-warning',
  };

  return (
    <Card
      title="سجل العمليات"
      icon="📋"
      action={
        <div className="flex items-center gap-2">
          <select className="input !w-auto text-sm" value={filter} onChange={(e) => setFilter((e.target as HTMLSelectElement).value)}>
            <option value="all">الكل</option>
            <option value="parts">قطع الغيار</option>
            <option value="crm">البلاغات</option>
            <option value="fill">التقفيلات</option>
          </select>
          <button className="btn btn-outline btn-sm" onClick={refresh}>↻ تحديث</button>
        </div>
      }
    >
      {loading ? (
        <p className="text-slate-400 text-sm py-8 text-center">جاري التحميل...</p>
      ) : filtered.length === 0 ? (
        <p className="text-slate-400 text-sm py-8 text-center">لا توجد سجلات.</p>
      ) : (
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-slate-500 text-right">
                <th className="py-2 pr-4 font-semibold">الوقت</th>
                <th className="py-2 pr-4 font-semibold">النوع</th>
                <th className="py-2 font-semibold">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice().reverse().map((l, i) => {
                const level = String(l.level || l.type || 'info');
                return (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">
                      {new Date(l.timestamp).toLocaleString('ar-EG')}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`badge ${LEVEL_STYLE[level] || 'badge-muted'}`} dir="ltr">
                        {String(l.actionType || 'unknown')}
                      </span>
                    </td>
                    <td className="py-2 text-slate-700" dir="rtl">
                      {JSON.stringify(l.details ?? {})}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
