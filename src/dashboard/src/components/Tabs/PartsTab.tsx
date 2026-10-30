import { useEffect, useState } from 'preact/hooks';
import { Card, StatCard } from '../ui/Card';
import { useLogs } from '../../hooks/useStorage';

interface PartsData {
  activeOrders: number;
  completedToday: number;
  processingTime: string;
  recentOrders: Array<{ id: string; name: string; status: string; time: string }>;
}

export function PartsTab() {
  const { logs, loading } = useLogs();
  const [data, setData] = useState<PartsData>({
    activeOrders: 0,
    completedToday: 0,
    processingTime: '—',
    recentOrders: [],
  });

  // Derive stats from logs (records tagged 'parts:*')
  useEffect(() => {
    if (loading) return;
    const partsLogs = logs.filter((l) => String(l.actionType || '').startsWith('parts'));
    const completed = partsLogs.filter((l) =>
      String(l.actionType || '').includes('complete')
    ).length;
    const active = partsLogs.filter((l) =>
      String(l.actionType || '').includes('start') && !String(l.actionType || '').includes('complete')
    ).length;

    setData({
      activeOrders: active,
      completedToday: completed,
      processingTime: 'أسرع من ذي قبل',
      recentOrders: partsLogs.slice(0, 5).map((l) => ({
        id: String(l.timestamp || ''),
        name: String(l.details?.orderId || l.details?.partNo || '—'),
        status: String(l.actionType || ''),
        time: new Date(l.timestamp).toLocaleTimeString('ar-EG'),
      })),
    });
  }, [logs, loading]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="طلبات نشطة" value={data.activeOrders} icon="⚙️" color="primary" />
        <StatCard label="تمت اليوم" value={data.completedToday} icon="✅" color="success" />
        <StatCard label="متوسط المعالجة" value={data.processingTime} icon="⏱️" color="warning" />
      </div>

      <Card title="آخر العمليات" icon="📋" action={<span className="badge badge-info">{data.recentOrders.length} سجل</span>}>
        {data.recentOrders.length === 0 ? (
          <p className="text-slate-400 text-sm py-8 text-center">
            لا توجد عمليات مسجلة بعد. افتح صفحة قطع الغيار لبدء العمل.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-right">
                  <th className="py-2 pr-4 font-semibold">الوقت</th>
                  <th className="py-2 pr-4 font-semibold">البيان</th>
                  <th className="py-2 font-semibold">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {data.recentOrders.map((o, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-500">{o.time}</td>
                    <td className="py-2 pr-4">{o.name}</td>
                    <td className="py-2">
                      <span className="badge badge-muted" dir="ltr">{o.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
