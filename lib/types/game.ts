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
  token: string
  publicToken: string
  createdAt: string
  lastActiveAt: string
  lastTickAt: string | null
  tickCount: number
  status: GameStatus
  difficulty: DifficultyPreset
  cleanupEligibleAt: string | null
}

export interface TickState {
  tickCount: number
  status: GameStatus
  lastTickAt: string | null
}

export interface RegistryEntry {
  token: string
  publicToken: string
  createdAt: string
  lastActive: string
  status: GameStatus
  cleanupEligibleAt: string | null
}

export interface FullGameState {
  meta: GameMeta
  tick: TickState
  resources: ResourceOverviewRow[]
  facilities: FacilitySummary[]
  transports: TransportSummary[]
  environment: EnvironmentState
  techTree: TechTreeNode[]
  power: PowerGridSummary
  space: SpaceSummary
}