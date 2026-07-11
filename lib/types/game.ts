import type { FacilitySummary } from './facility';
import type { EnvironmentState } from './humanity';
import type { PowerGridSummary } from './power';
import type { ResourceOverviewRow } from './resource';
import type { SpaceSummary } from './space';
import type { TechTreeNode } from './tech';
import type { TransportSummary } from './transport';

export enum GameStatus {
  Active = 'Active',
  Paused = 'Paused',
  GameOver = 'GameOver',
  PendingCleanup = 'PendingCleanup',
}

export enum DifficultyPreset {
  Easy = 'Easy',
  Normal = 'Normal',
  Hard = 'Hard',
}

export interface GameMeta {
  token: string;
  publicToken: string;
  createdAt: string;
  lastActiveAt: string;
  lastTickAt: string | null;
  tickCount: number;
  status: GameStatus;
  difficulty: DifficultyPreset;
  cleanupEligibleAt: string | null;
}

export interface TickState {
  tickCount: number;
  status: GameStatus;
  lastTickAt: string | null;
}

export interface RegistryEntry {
  token: string;
  publicToken: string;
  createdAt: string;
  lastActive: string;
  status: GameStatus;
  cleanupEligibleAt: string | null;
}

export interface FullGameState {
  meta: GameMeta;
  tick: TickState;
  resources: ResourceOverviewRow[];
  facilities: FacilitySummary[];
  transports: TransportSummary[];
  environment: EnvironmentState;
  techTree: TechTreeNode[];
  power: PowerGridSummary;
  space: SpaceSummary;
}
