/**
 * QueryPilot Schema-Driven City Generator
 * 
 * Transforms arbitrary database schema metadata into a deterministic,
 * non-overlapping isometric city grid with road connections between foreign keys.
 */

import { DatabaseSchema, TableMetadata } from '@/types/database';
import { Tile } from '@/types/game';
import { Building, BuildingType } from '@/games/isocity/types/buildings';

export const GRID_SIZE = 55;

export interface CityGenerationResult {
  grid: Tile[][];
  tableLocations: Map<string, { x: number; y: number; width: number; height: number }>;
  relationshipPaths: Array<{
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    points: Array<{ x: number; y: number }>;
  }>;
}

/**
 * Selects an architectural building type matching the database table's profile.
 */
export function selectBuildingTypeForTable(table: TableMetadata): BuildingType {
  if (table.buildingType) {
    return table.buildingType;
  }

  // Row-count and category driven selection
  if (table.category === 'fact' || table.rowCount > 2000000) {
    return 'office_high'; // Skyscraper / High transaction tower
  }
  if (table.category === 'entity') {
    if (table.name.includes('user') || table.name.includes('customer') || table.name.includes('account')) {
      return 'city_hall'; // Civic / Governance entity
    }
    return 'mall'; // Major entity center
  }
  if (table.category === 'dimension') {
    return 'shop_medium'; // Boutique dimension office
  }
  if (table.category === 'log') {
    return 'power_plant'; // High-intensity data generation plant
  }
  if (table.category === 'view') {
    return 'museum'; // Analytics observatory
  }

  return 'office_low';
}

/**
 * Generates an empty water-bordered isometric terrain grid.
 */
function createBaseGrid(size: number): Tile[][] {
  const grid: Tile[][] = [];
  
  for (let x = 0; x < size; x++) {
    grid[x] = [];
    for (let y = 0; y < size; y++) {
      // Create a water border around the island (distance to edge < 4)
      const distFromEdge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const isWater = distFromEdge <= 3;

      grid[x][y] = {
        x,
        y,
        zone: 'none',
        landValue: 50,
        pollution: 0,
        crime: 0,
        traffic: 0,
        hasSubway: false,
        building: {
          type: isWater ? 'water' : 'empty',
          level: 1,
          population: 0,
          jobs: 0,
          powered: true,
          watered: true,
          onFire: false,
          fireProgress: 0,
          age: 0,
          constructionProgress: 100,
          abandoned: false,
        },
      };
    }
  }

  return grid;
}

/**
 * Connects two coordinates with road tiles using orthogonal Manhattan routing.
 */
function drawRoadPath(grid: Tile[][], x1: number, y1: number, x2: number, y2: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  const stampRoad = (x: number, y: number) => {
    if (x >= 4 && x < GRID_SIZE - 4 && y >= 4 && y < GRID_SIZE - 4) {
      const tile = grid[x][y];
      // Don't overwrite existing table buildings with roads
      if (!tile.building || tile.building.type === 'empty' || tile.building.type === 'grass' || tile.building.type === 'tree' || tile.building.type === 'road') {
        tile.zone = 'none';
        tile.building = {
          type: 'road',
          level: 1,
          population: 0,
          jobs: 0,
          powered: true,
          watered: true,
          onFire: false,
          fireProgress: 0,
          age: 0,
          constructionProgress: 100,
          abandoned: false,
        };
        points.push({ x, y });
      }
    }
  };

  // Route horizontally then vertically
  const stepX = x2 > x1 ? 1 : -1;
  for (let x = x1; x !== x2; x += stepX) {
    stampRoad(x, y1);
  }
  stampRoad(x2, y1);

  const stepY = y2 > y1 ? 1 : -1;
  for (let y = y1; y !== y2; y += stepY) {
    stampRoad(x2, y);
  }
  stampRoad(x2, y2);

  return points;
}

/**
 * Computes deterministic placements for arbitrary schemas lacking fixed coordinates.
 */
function assignDeterministicCoordinates(tables: TableMetadata[]): TableMetadata[] {
  const placed = [...tables];
  const centerX = Math.floor(GRID_SIZE / 2);
  const centerY = Math.floor(GRID_SIZE / 2);
  
  // Arrange tables in concentric rings / clusters around center
  const spacing = 7;
  const cols = Math.ceil(Math.sqrt(tables.length));
  
  placed.forEach((table, index) => {
    if (table.gridX && table.gridY) return; // Keep predefined coordinates

    const col = index % cols;
    const row = Math.floor(index / cols);
    const startX = centerX - Math.floor((cols * spacing) / 2);
    const startY = centerY - Math.floor((cols * spacing) / 2);

    table.gridX = Math.max(6, Math.min(GRID_SIZE - 8, startX + col * spacing));
    table.gridY = Math.max(6, Math.min(GRID_SIZE - 8, startY + row * spacing));
    table.width = table.width || (table.rowCount > 1000000 ? 2 : 1);
    table.height = table.height || (table.rowCount > 1000000 ? 2 : 1);
  });

  return placed;
}

/**
 * Main Schema City Generator.
 * Creates an interactive isometric city layout from a real database schema.
 */
export function generateCityFromSchema(schema: DatabaseSchema): CityGenerationResult {
  const grid = createBaseGrid(GRID_SIZE);
  const tableLocations = new Map<string, { x: number; y: number; width: number; height: number }>();
  const relationshipPaths: CityGenerationResult['relationshipPaths'] = [];

  const tables = assignDeterministicCoordinates(schema.tables);

  // 1. Place table buildings onto grid
  tables.forEach((table) => {
    const bType = selectBuildingTypeForTable(table);
    const w = table.width || 2;
    const h = table.height || 2;
    const gx = table.gridX;
    const gy = table.gridY;

    tableLocations.set(table.id, { x: gx, y: gy, width: w, height: h });
    tableLocations.set(table.name, { x: gx, y: gy, width: w, height: h });

    // Place building tiles across footprint
    for (let dx = 0; dx < w; dx++) {
      for (let dy = 0; dy < h; dy++) {
        const tx = gx + dx;
        const ty = gy + dy;

        if (tx < GRID_SIZE && ty < GRID_SIZE) {
          const tile = grid[tx][ty];
          tile.zone = 'commercial';
          tile.building = {
            type: bType,
            level: 3,
            population: Math.min(500, Math.floor(table.rowCount / 10000)),
            jobs: Math.min(300, Math.floor(table.rowCount / 15000)),
            powered: true,
            watered: true,
            onFire: false,
            fireProgress: 0,
            age: 10,
            constructionProgress: 100,
            abandoned: false,
            // Attach table metadata to building
            cityId: table.id,
          };
          // Attach table reference to tile
          (tile as any).tableMetadata = table;
          (tile as any).isTableRoot = (dx === 0 && dy === 0);
        }
      }
    }

    // Surround table building with perimeter sidewalk/road for clean access
    for (let px = gx - 1; px <= gx + w; px++) {
      for (let py = gy - 1; py <= gy + h; py++) {
        if (
          px >= 4 && px < GRID_SIZE - 4 &&
          py >= 4 && py < GRID_SIZE - 4 &&
          (px === gx - 1 || px === gx + w || py === gy - 1 || py === gy + h)
        ) {
          const t = grid[px][py];
          if (!t.building || t.building.type === 'empty' || t.building.type === 'grass') {
            t.zone = 'none';
            t.building = {
              type: 'road',
              level: 1,
              population: 0,
              jobs: 0,
              powered: true,
              watered: true,
              onFire: false,
              fireProgress: 0,
              age: 0,
              constructionProgress: 100,
              abandoned: false,
            };
          }
        }
      }
    }
  });

  // 2. Connect related tables via foreign-key relationship roads
  schema.relationships.forEach((rel) => {
    const fromLoc = tableLocations.get(rel.fromTable);
    const toLoc = tableLocations.get(rel.toTable);

    if (fromLoc && toLoc) {
      // Connect perimeter entry points
      const p1 = { x: fromLoc.x + fromLoc.width, y: fromLoc.y + Math.floor(fromLoc.height / 2) };
      const p2 = { x: toLoc.x, y: toLoc.y + Math.floor(toLoc.height / 2) };

      const points = drawRoadPath(grid, p1.x, p1.y, p2.x, p2.y);
      relationshipPaths.push({
        id: rel.id,
        from: p1,
        to: p2,
        points,
      });
    }
  });

  return {
    grid,
    tableLocations,
    relationshipPaths,
  };
}
