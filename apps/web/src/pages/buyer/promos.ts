/**
 * Local mirror of the shared PROMOS contract (server revalidates on checkout):
 * - KAON20: 20% off, capped at 100, min subtotal 150
 * - FREESHIP: delivery fee waived, min subtotal 200
 */
export interface PromoEval {
  code: string;
  discount: number;
  freeDelivery: boolean;
  ok: boolean;
  message: string;
}

export const KNOWN_PROMOS = ['KAON20', 'FREESHIP'] as const;

export function evaluatePromo(rawCode: string, subtotal: number): PromoEval {
  const code = rawCode.trim().toUpperCase();
  if (code === '') {
    return { code: '', discount: 0, freeDelivery: false, ok: true, message: '' };
  }
  if (code === 'KAON20') {
    if (subtotal < 150) {
      return {
        code,
        discount: 0,
        freeDelivery: false,
        ok: false,
        message: 'KAON20 needs a minimum subtotal of \u20B1150.',
      };
    }
    return {
      code,
      discount: Math.min(100, Math.round(subtotal * 0.2)),
      freeDelivery: false,
      ok: true,
      message: 'KAON20 applied: 20% off (capped at \u20B1100).',
    };
  }
  if (code === 'FREESHIP') {
    if (subtotal < 200) {
      return {
        code,
        discount: 0,
        freeDelivery: false,
        ok: false,
        message: 'FREESHIP needs a minimum subtotal of \u20B1200.',
      };
    }
    return {
      code,
      discount: 0,
      freeDelivery: true,
      ok: true,
      message: 'FREESHIP applied: delivery fee waived.',
    };
  }
  return {
    code,
    discount: 0,
    freeDelivery: false,
    ok: false,
    message: `Unknown promo code "${code}". Try KAON20 or FREESHIP.`,
  };
}
