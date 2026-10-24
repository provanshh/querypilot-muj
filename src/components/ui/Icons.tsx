'use client';

import React from 'react';
import { Tool } from '@/types/game';

type IconProps = { size?: number; className?: string };

const baseStroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function FireIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...baseStroke} d="M12 3s2 3 2 5-2 4-2 4-2-2-2-4 2-5 2-5z" />
      <path {...baseStroke} d="M12 12c-2 1-3 3-3 4.5a3 3 0 0 0 6 0C15 15 14 13 12 12z" />
    </svg>
  );
}

export function SafetyIcon({ size = 18, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className}>
      <path {...baseStroke} d="M12 3l8 4v5c0 4.5-3.5 7.8-8 9-4.5-1.2-8-4.5-8-9V7z" />
      <path {...baseStroke} d="M9 12l2 2 4-4" />
    </svg>
  );
}

