import { useCallback, useState } from 'react';

export type Persona =
  | 'buyer'
  | 'store_owner'
  | 'rider'
  | 'operator'
  | 'support';

export const PERSONA_STORAGE_KEY = 'kaoncdo:persona';

/** Shared stub-JWT shape: the mock auth token only carries { persona }. */
export interface StubJwt {
  persona: Persona;
}

export function makeStubJwt(persona: Persona): StubJwt {
  return { persona };
}

export interface PersonaMeta {
  id: Persona;
  label: string;
  blurb: string;
  to: string;
}

export const PERSONAS: PersonaMeta[] = [
  { id: 'buyer', label: 'Buyer', blurb: 'Browse stores, checkout, live tracking', to: '/buyer' },
  { id: 'store_owner', label: 'Store Owner', blurb: 'Orders, menu, sales dashboard', to: '/store' },
  { id: 'rider', label: 'Rider', blurb: 'Offers, deliveries, earnings', to: '/rider' },
  { id: 'operator', label: 'Fleet Operator', blurb: 'Live city map, dispatch, promos', to: '/ops' },
  { id: 'support', label: 'Support Agent', blurb: 'Tickets, refunds, reassign', to: '/support' },
];

const DEFAULT_PERSONA: Persona = 'buyer';

function isPersona(value: string | null): value is Persona {
  return (
    value === 'buyer' ||
    value === 'store_owner' ||
    value === 'rider' ||
    value === 'operator' ||
    value === 'support'
  );
}

export function getStoredPersona(): Persona {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_PERSONA;
  }
  try {
    const raw = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    return isPersona(raw) ? raw : DEFAULT_PERSONA;
  } catch {
    return DEFAULT_PERSONA;
  }
}

/** Persona switcher backed by localStorage (mock auth for the POC). */
export function usePersona(): [Persona, (persona: Persona) => void] {
  const [persona, setPersonaState] = useState<Persona>(() => getStoredPersona());

  const setPersona = useCallback((next: Persona) => {
    try {
      window.localStorage.setItem(PERSONA_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private mode, SSR) — keep in-memory state only.
    }
    setPersonaState(next);
  }, []);

  return [persona, setPersona];
}
