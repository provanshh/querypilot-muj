/**
 * IsoCity Game State Types
 */

import { Building } from './buildings';
import { ZoneType } from './zones';
import { Stats, Budget, CityEconomy, HistoryPoint } from './economy';
import { ServiceCoverage } from './services';

export type Tool =
  | 'select' | 'bulldoze' | 'road' | 'rail' | 'subway'
  | 'expand_city' | 'shrink_city' | 'tree'
  | 'zone_residential' | 'zone_commercial' | 'zone_industrial' | 'zone_dezone'
  | 'zone_water' | 'zone_land'
  | 'police_station' | 'fire_station' | 'hospital' | 'school' | 'university'
  | 'park' | 'park_large' | 'tennis' | 'power_plant' | 'water_tower'
  | 'subway_station' | 'rail_station' | 'stadium' | 'museum' | 'airport'
  | 'space_program' | 'city_hall' | 'amusement_park'
  | 'basketball_courts' | 'playground_small' | 'playground_large'
  | 'baseball_field_small' | 'soccer_field_small' | 'football_field' | 'baseball_stadium'
  | 'community_center' | 'office_building_small' | 'swimming_pool' | 'skate_park'
  | 'mini_golf_course' | 'bleachers_field' | 'go_kart_track' | 'amphitheater'
  | 'greenhouse_garden' | 'animal_pens_farm' | 'cabin_house' | 'campground'
  | 'marina_docks_small' | 'pier_large' | 'roller_coaster_small'
  | 'community_garden' | 'pond_park' | 'park_gate' | 'mountain_lodge' | 'mountain_trailhead';

interface ToolInfo {
  name: string;
  cost: number;
  description: string;
  size?: number;
}

export const TOOL_INFO: Record<Tool, ToolInfo> = {
  select: { name: 'Select', cost: 0, description: 'Click to view tile info' },
  bulldoze: { name: 'Bulldoze', cost: 10, description: 'Remove buildings and zones' },
  road: { name: 'Road', cost: 25, description: 'Connect your city' },
  rail: { name: 'Rail', cost: 40, description: 'Build railway tracks' },
  subway: { name: 'Subway', cost: 50, description: 'Underground transit' },
  expand_city: { name: 'Expand City', cost: 0, description: 'Add 15 tiles to each edge' },
  shrink_city: { name: 'Shrink City', cost: 0, description: 'Remove 15 tiles from each edge' },
  tree: { name: 'Tree', cost: 15, description: 'Plant trees to improve environment' },
  zone_residential: { name: 'Residential', cost: 50, description: 'Zone for housing' },
  zone_commercial: { name: 'Commercial', cost: 50, description: 'Zone for shops and offices' },
  zone_industrial: { name: 'Industrial', cost: 50, description: 'Zone for factories' },
  zone_dezone: { name: 'De-zone', cost: 0, description: 'Remove zoning' },
  zone_water: { name: 'Water Terraform', cost: 50000, description: 'Terraform land into water' },
  zone_land: { name: 'Land Terraform', cost: 50000, description: 'Terraform water into land' },
  police_station: { name: 'Police', cost: 500, description: 'Increase safety', size: 1 },
  fire_station: { name: 'Fire Station', cost: 500, description: 'Fight fires', size: 1 },
  hospital: { name: 'Hospital', cost: 1000, description: 'Improve health (2x2)', size: 2 },
  school: { name: 'School', cost: 400, description: 'Basic education (2x2)', size: 2 },
  university: { name: 'University', cost: 2000, description: 'Higher education (3x3)', size: 3 },
  park: { name: 'Small Park', cost: 150, description: 'Boost happiness and land value (1x1)', size: 1 },
  park_large: { name: 'Large Park', cost: 600, description: 'Large park (3x3)', size: 3 },
  tennis: { name: 'Tennis Court', cost: 200, description: 'Recreation facility', size: 1 },
  power_plant: { name: 'Power Plant', cost: 3000, description: 'Generate electricity (2x2)', size: 2 },
  water_tower: { name: 'Water Tower', cost: 1000, description: 'Provide water', size: 1 },
  subway_station: { name: 'Subway Station', cost: 750, description: 'Access to subway network', size: 1 },
  rail_station: { name: 'Rail Station', cost: 1000, description: 'Passenger and freight station', size: 2 },
  stadium: { name: 'Stadium', cost: 5000, description: 'Boosts commercial demand (3x3)', size: 3 },
  museum: { name: 'Museum', cost: 4000, description: 'Boosts commercial & residential demand (3x3)', size: 3 },
  airport: { name: 'Airport', cost: 10000, description: 'Boosts commercial & industrial demand (4x4)', size: 4 },
  space_program: { name: 'Space Program', cost: 15000, description: 'Boosts industrial & residential demand (3x3)', size: 3 },
  city_hall: { name: 'City Hall', cost: 6000, description: 'Boosts all demand types (2x2)', size: 2 },
  amusement_park: { name: 'Amusement Park', cost: 12000, description: 'Major boost to commercial demand (4x4)', size: 4 },
  basketball_courts: { name: 'Basketball Courts', cost: 250, description: 'Outdoor basketball facility', size: 1 },
  playground_small: { name: 'Small Playground', cost: 200, description: 'Children\'s playground', size: 1 },
  playground_large: { name: 'Large Playground', cost: 350, description: 'Large playground with more equipment (2x2)', size: 2 },
  baseball_field_small: { name: 'Baseball Field', cost: 800, description: 'Local baseball diamond (2x2)', size: 2 },
  soccer_field_small: { name: 'Soccer Field', cost: 400, description: 'Soccer/football pitch', size: 1 },
  football_field: { name: 'Football Field', cost: 1200, description: 'Football stadium (2x2)', size: 2 },
  baseball_stadium: { name: 'Baseball Stadium', cost: 6000, description: 'Professional baseball venue (3x3)', size: 3 },
  community_center: { name: 'Community Center', cost: 500, description: 'Local community hub', size: 1 },
  office_building_small: { name: 'Small Office', cost: 600, description: 'Small office building', size: 1 },
  swimming_pool: { name: 'Swimming Pool', cost: 450, description: 'Public swimming facility', size: 1 },
  skate_park: { name: 'Skate Park', cost: 300, description: 'Skateboarding park', size: 1 },
  mini_golf_course: { name: 'Mini Golf', cost: 700, description: 'Miniature golf course (2x2)', size: 2 },
  bleachers_field: { name: 'Bleachers Field', cost: 350, description: 'Sports field with seating', size: 1 },
  go_kart_track: { name: 'Go-Kart Track', cost: 1000, description: 'Racing entertainment (2x2)', size: 2 },
  amphitheater: { name: 'Amphitheater', cost: 1500, description: 'Outdoor performance venue (2x2)', size: 2 },
  greenhouse_garden: { name: 'Greenhouse Garden', cost: 800, description: 'Botanical greenhouse (2x2)', size: 2 },
  animal_pens_farm: { name: 'Animal Pens', cost: 400, description: 'Petting zoo / farm animals', size: 1 },
  cabin_house: { name: 'Cabin House', cost: 300, description: 'Rustic cabin retreat', size: 1 },
  campground: { name: 'Campground', cost: 250, description: 'Outdoor camping area', size: 1 },
  marina_docks_small: { name: 'Marina', cost: 1200, description: 'Boat docks (2x2, must be placed next to water)', size: 2 },
  pier_large: { name: 'Pier', cost: 600, description: 'Waterfront pier (must be placed next to water)', size: 1 },
  roller_coaster_small: { name: 'Roller Coaster', cost: 3000, description: 'Thrill ride (2x2)', size: 2 },
  community_garden: { name: 'Community Garden', cost: 200, description: 'Shared gardening space', size: 1 },
  pond_park: { name: 'Pond Park', cost: 350, description: 'Park with scenic pond', size: 1 },
  park_gate: { name: 'Park Gate', cost: 150, description: 'Decorative park entrance', size: 1 },
  mountain_lodge: { name: 'Mountain Lodge', cost: 1500, description: 'Nature retreat lodge (2x2)', size: 2 },
  mountain_trailhead: { name: 'Trailhead', cost: 400, description: 'Hiking trail entrance (3x3)', size: 3 },
};

export interface Tile {
  x: number;
  y: number;
  zone: ZoneType;
  building: Building;
  landValue: number;
  pollution: number;
  crime: number;
  traffic: number;
  hasSubway: boolean;
  hasRailOverlay?: boolean;
}

export interface City {
  id: string;
  name: string;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  economy: CityEconomy;
  color: string;
}

export interface AdjacentCity {
  id: string;
  name: string;
  direction: 'north' | 'south' | 'east' | 'west';
  connected: boolean;
  discovered: boolean;
}

export interface WaterBody {
  id: string;
  name: string;
  type: 'lake' | 'ocean';
  tiles: { x: number; y: number }[];
  centerX: number;
  centerY: number;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  icon: string;
  timestamp: number;
}

export interface AdvisorMessage {
  name: string;
  icon: string;
  messages: string[];
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface GameState {
  id: string;
  grid: Tile[][];
  gridSize: number;
  cityName: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  tick: number;
  speed: 0 | 1 | 2 | 3;
  selectedTool: Tool;
  taxRate: number;
  effectiveTaxRate: number;
  stats: Stats;
  budget: Budget;
  services: ServiceCoverage;
  notifications: Notification[];
  advisorMessages: AdvisorMessage[];
  history: HistoryPoint[];
  activePanel: 'none' | 'budget' | 'statistics' | 'advisors' | 'settings';
  disastersEnabled: boolean;
  adjacentCities: AdjacentCity[];
  waterBodies: WaterBody[];
  gameVersion: number;
  cities: City[];
}
