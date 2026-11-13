import type { ReactNode } from "react";
export function AppHeader({
  search,
  actions,
}: {
  search?: ReactNode;
  actions?: ReactNode;
  current?: string;
  brand?: string;
  departments?: string[][];
  navigation?: string;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      {search}
      {actions}
    </div>
  );
}
export function Sidebar({
  items,
  active,
  onNavigate,
  label,
}: {
  id: string;
  label: string;
  items: { id: string; label: string; group: string }[];
  active: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav aria-label={label} className="workflow-nav">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={active === item.id ? "page" : undefined}
          onClick={() => onNavigate(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
export function Skeleton({ label }: { inline?: boolean; label: string }) {
  return (
    <p role="status" className="p-6 text-slate-500">
      {label}
    </p>
  );
}
