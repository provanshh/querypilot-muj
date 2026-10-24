/**
 * Overlay mode utilities and configuration.
 * Handles visualization overlays for power, water, services, etc.
 */

import { Tile } from '@/types/game';
import { OverlayMode } from './types';

// ============================================================================
// Types
// ============================================================================

/** Service coverage data for a tile */
type ServiceCoverage = {
  fire: number;
  police: number;
  health: number;
  education: number;
};

// ============================================================================
// Overlay Fill Style Calculation
// ============================================================================

/** Tiles that don't need service coverage (natural/infrastructure) */
const NON_BUILDING_TYPES = new Set([
  'empty', 'grass', 'water', 'road', 'rail', 'tree'
]);

/** Check if a tile has a building that needs service coverage */
function tileNeedsCoverage(tile: Tile): boolean {
  return !NON_BUILDING_TYPES.has(tile.building.type);
}

/** Warning color for uncovered buildings */
const UNCOVERED_WARNING = 'rgba(239, 68, 68, 0.45)'; // Red tint

/** No overlay needed (transparent) */
const NO_OVERLAY = 'rgba(0, 0, 0, 0)';

/**
 * Calculate the fill style color for an overlay tile.
 * 
 * New simplified logic:
 * - Buildings without coverage get a red warning tint
 * - Covered buildings and non-building tiles get no tint
 * - Radius circles are drawn separately to show coverage areas
 * 
 * @param mode - The current overlay mode
 * @param tile - The tile being rendered
 * @param coverage - Service coverage values for the tile
 * @returns CSS color string for the overlay fill
 */
export function getOverlayFillStyle(
  mode: OverlayMode,
  tile: Tile,
  coverage: ServiceCoverage
): string {
  // Only show warning on tiles that have buildings needing coverage
  const needsCoverage = tileNeedsCoverage(tile);
  
  switch (mode) {
    case 'power':
      // Red warning only on unpowered buildings
      if (!needsCoverage) return NO_OVERLAY;
      return tile.building.powered ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'water':
      // Red warning only on buildings without water
      if (!needsCoverage) return NO_OVERLAY;
      return tile.building.watered ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'fire':
      // Red warning only on buildings outside fire coverage
      if (!needsCoverage) return NO_OVERLAY;
      return coverage.fire > 0 ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'police':
      // Red warning only on buildings outside police coverage
      if (!needsCoverage) return NO_OVERLAY;
      return coverage.police > 0 ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'health':
      // Red warning only on buildings outside health coverage
      if (!needsCoverage) return NO_OVERLAY;
      return coverage.health > 0 ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'education':
      // Red warning only on buildings outside education coverage
      if (!needsCoverage) return NO_OVERLAY;
      return coverage.education > 0 ? NO_OVERLAY : UNCOVERED_WARNING;

    case 'subway':
      // Underground view overlay - keep existing behavior
      return tile.hasSubway
        ? 'rgba(245, 158, 11, 0.7)'  // Bright amber for existing subway
        : 'rgba(40, 30, 20, 0.4)';   // Dark brown tint for "underground" view

    case 'none':
    default:
      return NO_OVERLAY;
  }
}

// ============================================================================
// Service Radius Overlay Helpers
// ============================================================================

/** Map overlay modes to their corresponding service building types */
export const OVERLAY_TO_BUILDING_TYPES: Record<OverlayMode, string[]> = {
  none: [],
  power: ['power_plant'],
  water: ['water_tower'],
  fire: ['fire_station'],
  police: ['police_station'],
  health: ['hospital'],
  education: ['school', 'university'],
  subway: ['subway_station'],
};

/** Overlay circle stroke colors (light/visible colors) */
export const OVERLAY_CIRCLE_COLORS: Record<OverlayMode, string> = {
  none: 'transparent',
  power: 'rgba(251, 191, 36, 0.8)',    // Amber
  water: 'rgba(96, 165, 250, 0.8)',    // Blue
  fire: 'rgba(248, 113, 113, 0.8)',    // Light red
  police: 'rgba(147, 197, 253, 0.8)',  // Light blue
  health: 'rgba(134, 239, 172, 0.8)',  // Light green
  education: 'rgba(196, 181, 253, 0.8)', // Light purple
  subway: 'rgba(253, 224, 71, 0.8)',   // Yellow
};

/** Building highlight glow colors */
export const OVERLAY_HIGHLIGHT_COLORS: Record<OverlayMode, string> = {
  none: 'transparent',
  power: 'rgba(251, 191, 36, 1)',      // Amber
  water: 'rgba(96, 165, 250, 1)',      // Blue  
  fire: 'rgba(239, 68, 68, 1)',        // Red
  police: 'rgba(59, 130, 246, 1)',     // Blue
  health: 'rgba(34, 197, 94, 1)',      // Green
  education: 'rgba(168, 85, 247, 1)',  // Purple
  subway: 'rgba(234, 179, 8, 1)',      // Yellow
};

/** Overlay circle fill colors (subtle, for area visibility) */
export const OVERLAY_CIRCLE_FILL_COLORS: Record<OverlayMode, string> = {
  none: 'transparent',
  power: 'rgba(251, 191, 36, 0.12)',
  water: 'rgba(96, 165, 250, 0.12)',
  fire: 'rgba(248, 113, 113, 0.12)',
  police: 'rgba(147, 197, 253, 0.12)',
  health: 'rgba(134, 239, 172, 0.12)',
  education: 'rgba(196, 181, 253, 0.12)',
  subway: 'rgba(253, 224, 71, 0.12)',
};
