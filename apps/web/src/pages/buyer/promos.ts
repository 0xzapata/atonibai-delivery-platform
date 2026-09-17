export interface PromoEval { code: string; discount: number; freeDelivery: boolean; ok: boolean; message: string; }

export const KNOWN_PROMOS = ['KAON20', 'FREESHIP'] as const;

const fail = (code: string, message: string): PromoEval => ({ code, discount: 0, freeDelivery: false, ok: false, message });

const PROMOS: Record<string, { min: number; discount: (sub: number) => number; freeDelivery: boolean; message: string }> = {
  KAON20: { min: 150, discount: (sub) => Math.min(100, Math.round(sub * 0.2)), freeDelivery: false, message: 'KAON20 applied: 20% off (capped at ₱100).' },
  FREESHIP: { min: 200, discount: () => 0, freeDelivery: true, message: 'FREESHIP applied: delivery fee waived.' },
};

export function evaluatePromo(rawCode: string, subtotal: number): PromoEval {
  const code = rawCode.trim().toUpperCase();
  if (code === '') return { code: '', discount: 0, freeDelivery: false, ok: true, message: '' };
  const spec = PROMOS[code];
  if (!spec) return fail(code, `Unknown promo code "${code}". Try KAON20 or FREESHIP.`);
  if (subtotal < spec.min) return fail(code, `${code} needs a minimum subtotal of ₱${spec.min}.`);
  return { code, discount: spec.discount(subtotal), freeDelivery: spec.freeDelivery, ok: true, message: spec.message };
}
