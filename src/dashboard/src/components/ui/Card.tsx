import { ComponentChildren } from 'preact';

interface CardProps {
  title?: string;
  icon?: string;
  action?: ComponentChildren;
  children: ComponentChildren;
  className?: string;
}

export function Card({ title, icon, action, children, className = '' }: CardProps) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="card-header">
          <h2 className="card-title">
            {icon && <span className="mr-2">{icon}</span>}
            {title}
          </h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger';
}

const COLORS: Record<string, string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function StatCard({ label, value, icon, color = 'primary' }: StatCardProps) {
  return (
    <div className="bg-white rounded-card border border-slate-200 p-4 flex items-center gap-4 shadow-sm">
      {icon && (
        <div className={`w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-xl ${COLORS[color]}`}>
          {icon}
        </div>
      )}
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-slate-500 mt-0.5">{label}</div>
      </div>
    </div>
  );
}
