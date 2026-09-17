import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartLine {
  key: string;
  storeId: string;
  storeName: string;
  itemId: string;
  name: string;
  image: string | null;
  basePrice: number;
  choiceIds: string[];
  choiceLabels: string[];
  unitPrice: number;
  qty: number;
}

export interface AddLineInput {
  storeId: string;
  storeName: string;
  deliveryFee: number | null;
  itemId: string;
  name: string;
  image: string | null;
  basePrice: number;
  choiceIds: string[];
  choiceLabels: string[];
  unitPrice: number;
}

interface BuyerCartState {
  storeId: string | null;
  storeName: string | null;
  deliveryFee: number | null;
  lines: CartLine[];
  /** 'replaced' when the incoming line belonged to a different store. */
  addLine: (input: AddLineInput, qty: number) => 'added' | 'replaced';
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  clear: () => void;
}

function lineKey(itemId: string, choiceIds: string[]): string {
  return `${itemId}::${[...choiceIds].sort().join(',')}`;
}

export const useBuyerCart = create<BuyerCartState>()(
  persist(
    (set) => ({
      storeId: null,
      storeName: null,
      deliveryFee: null,
      lines: [],
      addLine: (input, qty) => {
        const key = lineKey(input.itemId, input.choiceIds);
        const safeQty = Math.max(1, Math.min(10, Math.floor(qty) || 1));
        let result: 'added' | 'replaced' = 'added';
        set((s) => {
          if (s.storeId !== null && s.storeId !== input.storeId) {
            result = 'replaced';
            return {
              storeId: input.storeId,
              storeName: input.storeName,
              deliveryFee: input.deliveryFee,
              lines: [{ ...input, key, qty: safeQty }],
            };
          }
          const existing = s.lines.find((l) => l.key === key);
          if (existing) {
            return {
              storeId: input.storeId,
              storeName: input.storeName,
              deliveryFee: input.deliveryFee ?? s.deliveryFee,
              lines: s.lines.map((l) =>
                l.key === key ? { ...l, qty: Math.min(10, l.qty + safeQty) } : l,
              ),
            };
          }
          return {
            storeId: input.storeId,
            storeName: input.storeName,
            deliveryFee: input.deliveryFee ?? s.deliveryFee,
            lines: [...s.lines, { ...input, key, qty: safeQty }],
          };
        });
        return result;
      },
      setQty: (key, qty) =>
        set((s) => ({
          lines:
            qty <= 0
              ? s.lines.filter((l) => l.key !== key)
              : s.lines.map((l) =>
                  l.key === key ? { ...l, qty: Math.max(1, Math.min(10, Math.floor(qty))) } : l,
                ),
        })),
      removeLine: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ storeId: null, storeName: null, deliveryFee: null, lines: [] }),
    }),
    {
      name: 'kaoncdo:buyer-cart',
      partialize: (s) => ({
        storeId: s.storeId,
        storeName: s.storeName,
        deliveryFee: s.deliveryFee,
        lines: s.lines,
      }),
    },
  ),
);

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty, 0);
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.qty * l.unitPrice, 0);
}
