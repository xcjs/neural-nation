import type { FacilityService } from '../facilities/FacilityService';
import type { HumanityService } from '../humanity/HumanityService';
import type { PowerService } from '../power/PowerService';
import type { ResourceService } from '../resources/ResourceService';
import type { SpaceService } from '../space/SpaceService';
import type { TechService } from '../tech/TechService';
import type { TransportService } from '../transport/TransportService';
import type { IGameRepository } from './Repositories/IGameRepository';
import { type FullGameState, type GameMeta, GameStatus, type RegistryEntry, type TickState } from '../../../lib/types/game';

export class GameStateService {
  constructor(
    private readonly gameRepo: IGameRepository,
    private readonly resourceService: ResourceService,
    private readonly facilityService: FacilityService,
    private readonly transportService: TransportService,
    private readonly humanityService: HumanityService,
    private readonly techService: TechService,
    private readonly powerService: PowerService,
    private readonly spaceService: SpaceService,
  ) {}

  buildFullGameState(entry: RegistryEntry, isSpectator: boolean = false): FullGameState | null {
    const meta = this.gameRepo.getMeta();
    if (!meta)
      return null;

    const gameMeta: GameMeta = {
      token: isSpectator ? '' : meta.token ?? entry.token,
      publicToken: meta.publicToken ?? entry.publicToken,
      createdAt: meta.createdAt ?? entry.createdAt,
      lastActiveAt: meta.lastActiveAt ?? entry.lastActive,
      lastTickAt: meta.lastTickAt,
      tickCount: meta.tickCount ?? 0,
      status: (meta.status as GameStatus) || GameStatus.Active,
      cleanupEligibleAt: meta.cleanupEligibleAt,
    };

    const tickState: TickState = {
      tickCount: meta.tickCount ?? 0,
      status: (meta.status as GameStatus) || GameStatus.Active,
      lastTickAt: meta.lastTickAt,
    };

    return {
      meta: gameMeta,
      tick: tickState,
      resources: this.resourceService.getResourceOverview(),
      facilities: this.facilityService.listFacilities({ limit: 200, offset: 0 }).items,
      transports: this.transportService.listTransports({ limit: 200, offset: 0 }).items,
      environment: this.humanityService.getEnvironmentalStatus().environment,
      techTree: this.techService.getTechTree(),
      power: this.powerService.getPowerGridStatus(),
      space: this.spaceService.getSpaceStatus(),
    };
  }
}
