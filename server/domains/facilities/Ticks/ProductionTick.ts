import type { GameDb } from '../../../db/client';
import type { ITick } from '../../tick/ITick';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '../../../db/schema';

const EXTRACTOR_TYPES = new Set(['Extractor', 'Farm', 'Forestry', 'WaterPump', 'Excavator', 'Dredger']);
const POWER_GENERATING_TYPES = new Set([
  'PowerPlant',
  'SolarFarm',
  'WindFarm',
  'HydroPlant',
  'NuclearReactor',
  'BreederReactor',
  'FusionReactor',
  'BiomassPlant',
  'BiogasPlant',
  'DieselGenerator',
  'CoalPlant',
  'GasPlant',
  'OilPlant',
  'GeothermalPlant',
]);
const DEFAULT_BUFFER_CAPACITY = 100;
const STORAGE_BUFFER_CAPACITY = 1000;
const EXTRACTOR_RANGE_DEG = 2;

export class ProductionTick implements ITick {
  constructor(private readonly db: GameDb) {}

  process(_tick: number): void {
    const activeFacilities = this.db.select()
      .from(schema.facilities)
      .where(eq(schema.facilities.status, 'Active'))
      .all();

    for (const facility of activeFacilities) {
      const isExtractor = EXTRACTOR_TYPES.has(facility.type);
      const isPowerGenerator = POWER_GENERATING_TYPES.has(facility.type);
      if (!facility.powerConnected && !isExtractor && !isPowerGenerator) {
        this.db.update(schema.facilities)
          .set({ throughput: 0 })
          .where(eq(schema.facilities.id, facility.id))
          .run();
        continue;
      }

      if (isExtractor) {
        this.processExtractorProduction(facility);
      }
      else if (facility.activeRecipeId) {
        this.processRecipeProduction(facility);
      }
      else {
        this.db.update(schema.facilities)
          .set({ throughput: 0 })
          .where(eq(schema.facilities.id, facility.id))
          .run();
      }
    }
  }

  private processExtractorProduction(facility: typeof schema.facilities.$inferSelect): void {
    const rate = facility.targetOutputRate || 1;

    const deposit = this.db.select().from(schema.resources).where(
      and(
        sql`${schema.resources.discovered} = 1`,
        sql`${schema.resources.remaining} > 0`,
        sql`abs(${schema.resources.lat} - ${facility.lat}) <= ${EXTRACTOR_RANGE_DEG}`,
        sql`abs(${schema.resources.lon} - ${facility.lon}) <= ${EXTRACTOR_RANGE_DEG}`,
      ),
    ).all().sort((a, b) => {
      const da = Math.sqrt((a.lat - facility.lat) ** 2 + (a.lon - facility.lon) ** 2);
      const db2 = Math.sqrt((b.lat - facility.lat) ** 2 + (b.lon - facility.lon) ** 2);
      return da - db2;
    })[0];

    if (!deposit) {
      this.db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run();
      return;
    }

    const extractAmount = Math.min(rate, deposit.remaining);
    if (extractAmount <= 0)
      return;

    const outputBuffer = this.getOrCreateBuffer(facility.id, deposit.resourceKey, 'output', facility.type === 'Storage' ? STORAGE_BUFFER_CAPACITY : DEFAULT_BUFFER_CAPACITY, deposit.unit);
    const spaceRemaining = outputBuffer.capacity - outputBuffer.quantity;
    const actualExtract = Math.min(extractAmount, spaceRemaining);

    if (actualExtract <= 0) {
      this.db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run();
      return;
    }

    this.db.update(schema.resources)
      .set({ remaining: deposit.remaining - actualExtract })
      .where(eq(schema.resources.id, deposit.id))
      .run();

    this.db.update(schema.facilityBuffers)
      .set({ quantity: outputBuffer.quantity + actualExtract })
      .where(eq(schema.facilityBuffers.id, outputBuffer.id))
      .run();

    this.db.update(schema.facilities)
      .set({ throughput: actualExtract })
      .where(eq(schema.facilities.id, facility.id))
      .run();
  }

  private processRecipeProduction(facility: typeof schema.facilities.$inferSelect): void {
    const recipeId = facility.activeRecipeId!;

    const inputs = this.db.select().from(schema.recipeInputs).where(eq(schema.recipeInputs.recipeId, recipeId)).all();
    const outputs = this.db.select().from(schema.recipeOutputs).where(eq(schema.recipeOutputs.recipeId, recipeId)).all();

    if (outputs.length === 0)
      return;

    const rate = facility.targetOutputRate || 1;
    const cycles = rate;

    let canProduce = true;
    const inputConsumption: Array<{ buffer: typeof schema.facilityBuffers.$inferSelect; amount: number }> = [];

    for (const input of inputs) {
      if (input.optional)
        continue;

      const buffer = this.getOrCreateBuffer(facility.id, input.resourceKey, 'input', DEFAULT_BUFFER_CAPACITY, input.unit);
      const needed = input.quantity * cycles;

      if (buffer.quantity < needed) {
        canProduce = false;
        break;
      }
      inputConsumption.push({ buffer, amount: needed });
    }

    if (!canProduce) {
      this.db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run();
      return;
    }

    const outputProduction: Array<{ buffer: typeof schema.facilityBuffers.$inferSelect; amount: number }> = [];
    for (const output of outputs) {
      const buffer = this.getOrCreateBuffer(facility.id, output.resourceKey, 'output', facility.type === 'Storage' ? STORAGE_BUFFER_CAPACITY : DEFAULT_BUFFER_CAPACITY, output.unit);
      const spaceRemaining = buffer.capacity - buffer.quantity;
      const produced = output.quantity * cycles;

      if (produced > spaceRemaining) {
        canProduce = false;
        break;
      }
      outputProduction.push({ buffer, amount: produced });
    }

    if (!canProduce) {
      this.db.update(schema.facilities)
        .set({ throughput: 0 })
        .where(eq(schema.facilities.id, facility.id))
        .run();
      return;
    }

    for (const { buffer, amount } of inputConsumption) {
      this.db.update(schema.facilityBuffers)
        .set({ quantity: buffer.quantity - amount })
        .where(eq(schema.facilityBuffers.id, buffer.id))
        .run();
    }

    for (const { buffer, amount } of outputProduction) {
      this.db.update(schema.facilityBuffers)
        .set({ quantity: buffer.quantity + amount })
        .where(eq(schema.facilityBuffers.id, buffer.id))
        .run();
    }

    const totalOutput = outputProduction.reduce((sum, o) => sum + o.amount, 0);
    this.db.update(schema.facilities)
      .set({ throughput: totalOutput })
      .where(eq(schema.facilities.id, facility.id))
      .run();
  }

  private getOrCreateBuffer(
    facilityId: number,
    resourceKey: string,
    direction: 'input' | 'output',
    capacity: number,
    unit: string,
  ): typeof schema.facilityBuffers.$inferSelect {
    const existing = this.db.select().from(schema.facilityBuffers).where(
      and(
        eq(schema.facilityBuffers.facilityId, facilityId),
        eq(schema.facilityBuffers.resourceKey, resourceKey),
        eq(schema.facilityBuffers.direction, direction),
      ),
    ).get();

    if (existing)
      return existing;

    return this.db.insert(schema.facilityBuffers).values({
      facilityId,
      resourceKey,
      quantity: 0,
      capacity,
      unit,
      direction,
    }).returning().get();
  }
}
