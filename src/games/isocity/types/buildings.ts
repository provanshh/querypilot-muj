/**
 * IsoCity Building Types
 */

export type BuildingType =
  | 'empty' | 'grass' | 'water' | 'road' | 'bridge' | 'rail' | 'tree'
  // Residential
  | 'house_small' | 'house_medium' | 'mansion' | 'apartment_low' | 'apartment_high'
  // Commercial
  | 'shop_small' | 'shop_medium' | 'office_low' | 'office_high' | 'mall'
  // Industrial
  | 'factory_small' | 'factory_medium' | 'factory_large' | 'warehouse'
  // Services
  | 'police_station' | 'fire_station' | 'hospital' | 'school' | 'university'
  | 'park' | 'park_large' | 'tennis'
  // Utilities
  | 'power_plant' | 'water_tower'
  // Transportation
  | 'subway_station' | 'rail_station'
  // Special
  | 'stadium' | 'museum' | 'airport' | 'space_program' | 'city_hall' | 'amusement_park'
  // Parks (new sprite sheet)
  | 'basketball_courts' | 'playground_small' | 'playground_large'
  | 'baseball_field_small' | 'soccer_field_small' | 'football_field' | 'baseball_stadium'
  | 'community_center' | 'office_building_small' | 'swimming_pool' | 'skate_park'
  | 'mini_golf_course' | 'bleachers_field' | 'go_kart_track' | 'amphitheater'
  | 'greenhouse_garden' | 'animal_pens_farm' | 'cabin_house' | 'campground'
  | 'marina_docks_small' | 'pier_large' | 'roller_coaster_small'
  | 'community_garden' | 'pond_park' | 'park_gate' | 'mountain_lodge' | 'mountain_trailhead';

export type BridgeType = 'small' | 'medium' | 'large' | 'suspension';
export type BridgeOrientation = 'ns' | 'ew';
export type BridgeTrackType = 'road' | 'rail';

export interface Building {
  type: BuildingType;
  level: number;
  population: number;
  jobs: number;
  powered: boolean;
  watered: boolean;
  onFire: boolean;
  fireProgress: number;
  age: number;
  constructionProgress: number;
  abandoned: boolean;
  flipped?: boolean;
  cityId?: string;
  bridgeType?: BridgeType;
  bridgeOrientation?: BridgeOrientation;
  bridgeVariant?: number;
  bridgePosition?: 'start' | 'middle' | 'end';
  bridgeIndex?: number;
  bridgeSpan?: number;
  bridgeTrackType?: BridgeTrackType;
}
