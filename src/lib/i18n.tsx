'use client';
import React from 'react';

export const msg = (s: string) => s;

export const useMessages = () => {
  const handler = (s: any) => (typeof s === 'string' ? s : (s?.toString?.() || ''));
  return handler as any;
};

export const useGT = () => {
  const handler = (s: any) => (typeof s === 'string' ? s : (s?.toString?.() || ''));
  return handler as any;
};

export function T({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function Var({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function GTProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function LocaleSelector() {
  return null;
}

export function LanguageSelector() {
  return null;
}
