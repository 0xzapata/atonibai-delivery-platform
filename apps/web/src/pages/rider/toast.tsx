import { create } from 'zustand';

export type ToastKind = 'ok' | 'err' | 'info';
export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const KIND_STYLES: Record<ToastKind, string> = {
  ok: 'bg-emerald-600 text-white',
  err: 'bg-red-600 text-white',
  info: 'bg-stone-900 text-white',
};

let nextId = 1;

export const useToasts = create<{
  items: ToastItem[];
  push: (message: string, kind?: ToastKind) => void;
  dismiss: (id: number) => void;
}>()((set) => ({
  items: [],
  push: (message, kind = 'info') => {
    const id = nextId++;
    set((s) => ({ items: [...s.items.slice(-2), { id, message, kind }] }));
    window.setTimeout(() => set((s) => ({ items: s.items.filter((t) => t.id !== id) })), 2800);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

export function toast(message: string, kind: ToastKind = 'info'): void {
  useToasts.getState().push(message, kind);
}

export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 space-y-2">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold shadow-lg ${KIND_STYLES[t.kind]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
