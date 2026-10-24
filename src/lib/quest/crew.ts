import type { AgentId } from './types';

export interface CrewMember {
  id: AgentId;
  name: string;
  role: string;
  blurb: string;
  color: string;
  palette: {
    skin: string;
    hair: string;
    hat: string;
    hatAccent: string;
    shirt: string;
    shirtShade: string;
    pants: string;
    boots: string;
    prop: string;
  };
  hat: 'tophat' | 'ranger' | 'deerstalker' | 'hardhat' | 'cap' | 'none';
  prop: 'sash' | 'binoculars' | 'magnifier' | 'wrench' | 'clipboard' | 'tie';
}

export const CREW: CrewMember[] = [
  {
    id: 'mayor', name: 'Mayor Ada', role: 'Orchestrator', color: '#f59e0b',
    blurb: 'Plans the mission, routes work, holds the execution permit.',
    palette: { skin: '#f1c27d', hair: '#3b2a1a', hat: '#1f2937', hatAccent: '#b91c1c', shirt: '#334155', shirtShade: '#1e293b', pants: '#111827', boots: '#000000', prop: '#dc2626' },
    hat: 'tophat', prop: 'sash',
  },
  {
    id: 'scout', name: 'Scout Rio', role: 'Schema Scout', color: '#22d3ee',
    blurb: 'Maps tables, columns and relationships. Flags undocumented meaning.',
    palette: { skin: '#c68642', hair: '#1c1917', hat: '#4d7c0f', hatAccent: '#a3e635', shirt: '#a16207', shirtShade: '#854d0e', pants: '#3f3f46', boots: '#292524', prop: '#0f172a' },
    hat: 'ranger', prop: 'binoculars',
  },
  {
    id: 'inspector', name: 'Inspector Moss', role: 'Data Inspector', color: '#a78bfa',
    blurb: 'Profiles dirty values, mixed formats and duplicate loads.',
    palette: { skin: '#e0ac69', hair: '#78350f', hat: '#92400e', hatAccent: '#d97706', shirt: '#78716c', shirtShade: '#57534e', pants: '#44403c', boots: '#1c1917', prop: '#fde68a' },
    hat: 'deerstalker', prop: 'magnifier',
  },
  {
    id: 'engineer', name: 'Engineer Kip', role: 'SQL Engineer', color: '#fb923c',
    blurb: 'Drafts and executes read-only SQL, repairs it when checks fail.',
    palette: { skin: '#8d5524', hair: '#111827', hat: '#facc15', hatAccent: '#ca8a04', shirt: '#f97316', shirtShade: '#c2410c', pants: '#1e3a8a', boots: '#3f2a14', prop: '#94a3b8' },
    hat: 'hardhat', prop: 'wrench',
  },
  {
    id: 'verifier', name: 'Verifier Juno', role: 'Verification Agent', color: '#34d399',
    blurb: 'Challenges every result: duplicates, fan-out, recomputation.',
    palette: { skin: '#f1c27d', hair: '#7c2d12', hat: '#1d4ed8', hatAccent: '#fbbf24', shirt: '#2563eb', shirtShade: '#1e40af', pants: '#1e293b', boots: '#0f172a', prop: '#f8fafc' },
    hat: 'cap', prop: 'clipboard',
  },
  {
    id: 'analyst', name: 'Analyst Wren', role: 'Insight Analyst', color: '#f472b6',
    blurb: 'Writes the verdict from verified rows — or refuses to.',
    palette: { skin: '#ffdbac', hair: '#be185d', hat: '#be185d', hatAccent: '#be185d', shirt: '#7c3aed', shirtShade: '#5b21b6', pants: '#27272a', boots: '#18181b', prop: '#f472b6' },
    hat: 'none', prop: 'tie',
  },
];

export const CREW_BY_ID = Object.fromEntries(CREW.map((c) => [c.id, c])) as Record<AgentId, CrewMember>;
