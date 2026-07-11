import type { FacilityStatus } from '../../../../lib/types/facility';
import type { PaginationParams } from '../../../../lib/types/mcp';
import { Token } from '../../ioc/Token';

export interface FacilityRow {
  id: number;
  type: string;
  name: string;
  lat: number;
  lon: number;
  status: string;
  techRequired: string | null;
  activeRecipeId: string | null;
  targetOutputRate: number;
  powerConsumption: number;
  powerConnected: number;
  throughput: number;
  constructionProgress: number;
  elevation: number;
  terrainClass: string;
  footprint: string | null;
  createdAtTick: number;
}

export interface FacilityBufferRow {
  id: number;
  facilityId: number;
  resourceKey: string;
  quantity: number;
  capacity: number;
  unit: string;
  direction: string;
}

export interface RecipeRow {
  id: string;
  name: string;
  facilityType: string;
  craftTime: number;
  techRequired: string | null;
}

export interface StockpileRow {
  id: number;
  resourceKey: string;
  facilityId: number | null;
  quantity: number;
  capacity: number;
  unit: string;
}

export interface BuildFacilityParams {
  type: string;
  name: string;
  lat: number;
  lon: number;
  footprint: string;
  status: FacilityStatus;
  techRequired: string | null;
  powerConnected: number;
  createdAtTick: number;
}

export interface SearchFacilitiesParams extends PaginationParams {
  type?: string;
  status?: string;
  producesResource?: string;
  consumesResource?: string;
  nearLat?: number;
  nearLon?: number;
  radiusKm?: number;
}

export interface IFacilityRepository {
  getTick: () => number;
  getCompletedTechIds: () => string[];
  getAllFacilities: () => FacilityRow[];
  getFacilityById: (id: number) => FacilityRow | undefined;
  getFacilityBuffers: (facilityId: number) => FacilityBufferRow[];
  getBufferFacilityIds: (resourceKey: string, direction: string) => number[];
  getStockpile: (resourceKey: string) => StockpileRow | undefined;
  decrementStockpile: (stockpileId: number, quantity: number) => void;
  getRecipe: (recipeId: string) => RecipeRow | undefined;
  insertFacility: (params: BuildFacilityParams) => FacilityRow;
  deleteFacility: (id: number) => void;
  deleteFacilityBuffers: (id: number) => void;
  updateProductionTarget: (facilityId: number, recipeId: string, targetRate: number) => void;
  listFacilities: (limit: number, offset: number) => { items: FacilityRow[]; totalCount: number };
  searchFacilities: (params: SearchFacilitiesParams) => { items: FacilityRow[]; totalCount: number };
}

export const IFacilityRepository = new Token<IFacilityRepository>('IFacilityRepository');
