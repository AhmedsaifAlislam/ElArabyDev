// El Araby UI Components - Main Export
// All components auto-register on import

export { ElArabyButton } from './Button';
export { ElArabyInput } from './Input';
export { ElArabySelect } from './Select';
export { ElArabyTable, type TableColumn, type TableConfig } from './Table';
export { ElArabyModal } from './Modal';
export { ElArabyProgress } from './Progress';
export { ElArabyBadge } from './Badge';
export { ElArabyToastContainer, type ToastOptions } from './Toast';

// Re-export types
export type { TableColumn, TableConfig } from './Table';
export type { ToastOptions } from './Toast';

// Auto-register all (side-effect imports above already register)
// This file can be imported as: import '@elaraby/ui-components'