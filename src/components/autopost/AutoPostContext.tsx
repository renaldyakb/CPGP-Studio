import { createContext, useContext } from 'react';
import type { AutoPostPageContext } from './pageProps';

const AutoPostContext = createContext<AutoPostPageContext | null>(null);

export const AutoPostProvider = AutoPostContext.Provider;

export function useAutoPostPageContext(): AutoPostPageContext {
  const ctx = useContext(AutoPostContext);
  if (!ctx) {
    throw new Error(
      'useAutoPostPageContext dipakai di luar AutoPostProvider.'
    );
  }
  return ctx;
}