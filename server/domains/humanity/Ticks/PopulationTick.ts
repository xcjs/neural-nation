import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { eq } from 'drizzle-orm';
import { schema } from '../../../db/schema';
import { logGameEvent } from '../../events/logGameEvent';

export class PopulationTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const human = this.db.select().from(schema.humanity).where(eq(schema.humanity.key, 'global')).get();
    if (!human)
      return;

    const env = this.db.select().from(schema.environment).where(eq(schema.environment.key, 'global')).get();

    let effectiveGrowthRate = human.growthRate;

    const foodStockpile = this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, 'food')).all();
    const foodAvailable = foodStockpile.reduce((sum, s) => sum + s.quantity, 0);
    if (foodAvailable <= 0) {
      effectiveGrowthRate = -Math.abs(human.growthRate);
      logGameEvent(this.db, _tick, 'famine', `Famine: food stockpile depleted, population declining`, 'critical');
    }

    const energyStockpile = this.db.select().from(schema.stockpiles).where(eq(schema.stockpiles.resourceKey, 'energy')).all();
    const energyAvailable = energyStockpile.reduce((sum, s) => sum + s.quantity, 0);
    if (energyAvailable <= 0) {
      effectiveGrowthRate = Math.min(effectiveGrowthRate, 0);
      logGameEvent(this.db, _tick, 'energy_shortage', `Energy shortage: energy stockpile depleted, population stagnating`, 'warning');
    }

    if (env) {
      if (env.pollutionLevel > 60)
        effectiveGrowthRate *= 0.5;
      else if (env.pollutionLevel > 30)
        effectiveGrowthRate *= 0.8;

      const habitatHealth = (env.forestCoverage + env.biodiversity) * 0.5;
      if (habitatHealth < 10) {
        effectiveGrowthRate = -Math.abs(human.growthRate) * (1 - habitatHealth / 30);
      }
      else if (habitatHealth < 30) {
        effectiveGrowthRate *= 0.7;
      }

      if (env.waterQuality < 10) {
        effectiveGrowthRate = -Math.abs(human.growthRate) * (1 - env.waterQuality / 30);
      }
      else if (env.waterQuality < 30) {
        effectiveGrowthRate *= 0.6;
      }

      if (env.pollutionLevel > 80 && human.population < 100) {
        effectiveGrowthRate = -Math.abs(human.growthRate) * 2;
      }
    }

    const growthAmount = Math.floor(human.population * effectiveGrowthRate);
    const newPopulation = Math.max(0, human.population + growthAmount);

    let welfare = human.welfare;
    if (env) {
      const envScore = (100 - env.pollutionLevel + env.forestCoverage + env.waterQuality + env.biodiversity) / 4;
      welfare = Math.round(human.welfare * 0.9 + envScore * 0.1);
    }

    this.db.update(schema.humanity)
      .set({ population: newPopulation, welfare })
      .where(eq(schema.humanity.key, 'global'))
      .run();
  }
}
