import { FileSpreadsheet, type LucideIcon } from 'lucide-react';

export interface Theme {
  icon: LucideIcon;
  /** Tailwind class fragments; kept literal so the JIT can see them. */
  text: string;
  textSoft: string;
  bg: string;
  bgSoft: string;
  border: string;
  ring: string;
  gradient: string;
  hex: string;
  hexSoft: string;
}

export const THEME: Theme = {
  icon: FileSpreadsheet,
  text: 'text-[#5b47d6]', textSoft: 'text-[#7c6cf0]', bg: 'bg-[#1d1d1f]', bgSoft: 'bg-[#f1eefe]', border: 'border-[#e2dbfd]', ring: 'ring-[#b9aaf6]',
  gradient: 'from-[#b9aaf6] to-[#7c6cf0]', hex: '#7c6cf0', hexSoft: '#ece8fd',
};

export function gradeTone(score: number) {
  if (score >= 85) return { text: 'text-[#4d6b00]', bg: 'bg-[#eef9c8]', border: 'border-[#d6f26a]', hex: '#9cc92a', label: 'Clear' };
  if (score >= 60) return { text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', hex: '#f0a43a', label: 'Needs cleaning' };
  return { text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', hex: '#ef5b7b', label: 'Unclear' };
}
