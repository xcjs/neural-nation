import process from 'node:process';
import { buildForestDensityData } from './lib/climate-texture';

console.log('Building forest density data from Köppen-Geiger climate classification...');
try {
  const result = buildForestDensityData();
  console.log(`Forest density data: ${result.width}x${result.height}, ${result.cellsProcessed} climate cells processed`);
  console.log(`Output: ${result.outputPath}`);
}
catch (e) {
  console.error('Error:', e instanceof Error ? e.message : 'unknown');
  process.exit(1);
}
