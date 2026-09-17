import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine { key: string; storeId: string; storeName: string; itemId: string; name: string; image: string | null; basePrice: number; choiceIds: string[]; choiceLabels: string[]; unitPrice: number; qty: number; }
export interface AddLineInput { storeId: string; storeName: string; deliveryFee: number | null; itemId: string; name: string; image: string | null; basePrice: number; choiceIds: string[]; choiceLabels: string[]; unitPrice: number; }

interface BuyerCartState { storeId: string | null; storeName: string | null; deliveryFee: number | null; lines: CartLine[]; addLine: (input: AddLineInput, qty: number) => 'added' | 'replaced'; setQty: (key: string, qty: number) => void; removeLine: (key: string) => void; clear: () => void; }

const key = (itemId: string, choiceIds: string[]) => `${itemId}::${[...choiceIds].sort().join(',')}`;
const clamp = (q: number) => Math.max(1, Math.min(10, Math.floor(q) || 1));
const empty = { storeId: null as string | null, storeName: null as string | null, deliveryFee: null as number | null, lines: [] as CartLine[] };

export const useBuyerCart = create<BuyerCartState>()(
  persist(
    (set) => ({
      ...empty,
      addLine: (input, qty) => {
        const k = key(input.itemId, input.choiceIds);
        const q = clamp(qty);
        let result: 'added' | 'replaced' = 'added';
        set((s) => {
          const meta = { storeId: input.storeId, storeName: input.storeName, deliveryFee: input.deliveryFee ?? s.deliveryFee };
          if (s.storeId !== null && s.storeId !== input.storeId) {
            result = 'replaced';
            return { ...meta, deliveryFee: input.deliveryFee, lines: [{ ...input, key: k, qty: q }] };
          }
          const ex = s.lines.find((l) => l.key === k);
          return ex
            ? { ...meta, lines: s.lines.map((l) => (l.key === k ? { ...l, qty: Math.min(10, l.qty + q) } : l)) }
            : { ...meta, lines: [...s.lines, { ...input, key: k, qty: q }] };
        });
        return result;
      },
      setQty: (k, qty) => set((s) => ({ lines: qty <= 0 ? s.lines.filter((l) => l.key !== k) : s.lines.map((l) => (l.key === k ? { ...l, qty: clamp(qty) } : l)) })),
      removeLine: (k) => set((s) => ({ lines: s.lines.filter((l) => l.key !== k) })),
      clear: () => set({ ...empty }),
    }),
    { name: 'kaoncdo:buyer-cart', partialize: (s) => ({ storeId: s.storeId, storeName: s.storeName, deliveryFee: s.deliveryFee, lines: s.lines }) },
  ),
);

export const cartCount = (lines: CartLine[]): number => lines.reduce((n, l) => n + l.qty, 0);
export const cartSubtotal = (lines: CartLine[]): number => lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
