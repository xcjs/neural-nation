import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const geoDir = join(root, 'data', 'geological', 'raw');
const terrainDir = join(root, 'data', 'geological', 'terrain');
const srtmDir = join(root, 'data', 'geological', 'terrain', 'srtm');

const SRTM_BASE = 'https://s3.amazonaws.com/elevation-tiles-prod/srtm';

async function downloadSrtmTiles(): Promise<void> {
  mkdirSync(srtmDir, { recursive: true });
  let downloaded = 0;
  let skipped = 0;
  let missing = 0;
  for (let lat = -90; lat <= 89; lat++) {
    for (let lon = -180; lon <= 179; lon++) {
      const path = join(srtmDir, `srtm_${lat}_${lon}.tif`);
      if (existsSync(path)) {
        skipped++;
        continue;
      }
      const url = `${SRTM_BASE}/srtm_${lat}_${lon}.tif`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          writeFileSync(path, buf);
          downloaded++;
        }
        else if (res.status === 404) {
          missing++;
        }
        else {
          console.log(`  srtm_${lat}_${lon}: HTTP ${res.status}`);
        }
      }
      catch (e) {
        console.log(`  srtm_${lat}_${lon}: error ${e instanceof Error ? e.message : 'unknown'}`);
      }
      if ((downloaded + skipped + missing) % 500 === 0) {
        console.log(`  SRTM progress: ${downloaded} downloaded, ${skipped} cached, ${missing} ocean (no tile)`);
      }
    }
  }
  console.log(`SRTM complete: ${downloaded} downloaded, ${skipped} cached, ${missing} ocean tiles skipped.`);
}

async function main() {
  mkdirSync(geoDir, { recursive: true });
  mkdirSync(terrainDir, { recursive: true });

  console.log('Fetching geological data...');
  console.log('  Target dirs:', geoDir, terrainDir);

  // USGS MRDS (Mineral Resources Data System) — deposit locations
  const mrdsUrl = 'https://mrdata.usgs.gov/mrds/mrds-csv.zip';
  const mrdsPath = join(geoDir, 'mrds.csv.zip');
  if (!existsSync(mrdsPath)) {
    console.log('  Downloading USGS MRDS mineral deposit data...');
    try {
      const res = await fetch(mrdsUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const { writeFile } = await import('node:fs/promises');
        await writeFile(mrdsPath, buf);
        console.log('  MRDS downloaded:', mrdsPath);
      }
      else {
        console.log('  MRDS download failed (HTTP', res.status, ') — will need manual download');
      }
    }
    catch (e) {
      console.log('  MRDS download error:', e instanceof Error ? e.message : 'unknown');
    }
  }
  else {
    console.log('  MRDS already downloaded');
  }

  await downloadSrtmTiles();

  // Oil & gas data (EIA/USGS)
  console.log('  Oil & gas: download from https://www.eia.gov/maps/');

  // Crustal abundance — bundled in lib/constants/elements.ts (already present)
  console.log('  Crustal abundance: bundled in lib/constants/elements.ts');

  // Köppen-Geiger climate classification — forest density mapping
  const kgUrl = 'https://koeppen-geiger.vu-wien.ac.at/data/Koeppen-Geiger-ASCII.txt';
  const kgPath = join(geoDir, 'Koeppen-Geiger-ASCII.txt');
  if (!existsSync(kgPath)) {
    console.log('  Downloading Köppen-Geiger climate classification...');
    try {
      const res = await fetch(kgUrl);
      if (res.ok) {
        const text = await res.text();
        const { writeFile } = await import('node:fs/promises');
        await writeFile(kgPath, text, 'utf-8');
        console.log('  Köppen-Geiger downloaded:', kgPath);
      }
      else {
        console.log('  Köppen-Geiger download failed (HTTP', res.status, ')');
      }
    }
    catch (e) {
      console.log('  Köppen-Geiger download error:', e instanceof Error ? e.message : 'unknown');
    }
  }
  else {
    console.log('  Köppen-Geiger already downloaded');
  }

  console.log('\nDone. Some datasets may require manual download.');
}

main().catch(console.error);
