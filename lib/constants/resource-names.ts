import { ELEMENTS } from './elements';

/**
 * Display names for non-element resources keyed by their lowercase
 * resource key. Element names are resolved from the periodic table.
 */
const NON_ELEMENT_NAMES: Record<string, string> = {
  // Renewables
  wood: 'Wood',
  water: 'Water',
  arableland: 'Arable Land',
  biomass: 'Biomass',
  solar: 'Solar Energy',
  wind: 'Wind Energy',
  hydro: 'Hydro Power',
  population: 'Population',
  // Non-renewable / mined
  coal: 'Coal',
  naturalgas: 'Natural Gas',
  oil: 'Oil',
  peat: 'Peat',
  geothermal: 'Geothermal',
  stone: 'Stone',
  sand: 'Sand',
  gravel: 'Gravel',
  clay: 'Clay',
  limestone: 'Limestone',
  gypsum: 'Gypsum',
  salt: 'Salt',
  mica: 'Mica',
  asbestos: 'Asbestos',
  talc: 'Talc',
  graphite: 'Graphite',
  diamond: 'Diamond',
  gemstone: 'Gemstone',
  ree: 'Rare Earth Elements',
  // Manufactured
  iron: 'Iron',
  copper: 'Copper',
  steel: 'Steel',
  aluminum: 'Aluminum',
  silicon: 'Silicon',
  machinery: 'Machinery',
  electronics: 'Electronics',
  plastics: 'Plastics',
  fuel: 'Fuel',
  concrete: 'Concrete',
  lumber: 'Lumber',
  chemicals: 'Chemicals',
  fertilizer: 'Fertilizer',
  biofuel: 'Biofuel',
  ethanol: 'Ethanol',
  alloys: 'Alloys',
  composites: 'Composites',
  explosives: 'Explosives',
  fusioncore: 'Fusion Core',
  food: 'Food',
  energy: 'Energy',
};

const ELEMENT_BY_KEY: Record<string, { symbol: string; name: string }> = {};
for (const el of ELEMENTS) {
  ELEMENT_BY_KEY[el.symbol.toLowerCase()] = { symbol: el.symbol, name: el.name };
}

/**
 * Resolve a lowercase resource key to a human-readable display name.
 * Elements show as "Fe (Iron)"; non-elements show their proper name.
 */
export function getResourceDisplayName(resourceKey: string): string {
  const key = resourceKey.toLowerCase();
  const el = ELEMENT_BY_KEY[key];
  if (el)
    return `${el.symbol} (${el.name})`;
  return NON_ELEMENT_NAMES[key] ?? resourceKey;
}
