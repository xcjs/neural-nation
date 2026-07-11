import { Vector3 } from 'three';

const EARTH_RADIUS = 1;

export function latLonToVector3(lat: number, lon: number, radius: number = EARTH_RADIUS): Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);

  return new Vector3(x, y, z);
}

export function vector3ToLatLon(vec: Vector3): { lat: number; lon: number } {
  const radius = vec.length();
  const phi = Math.acos(vec.y / radius);
  const theta = Math.atan2(vec.z, -vec.x);

  const lat = 90 - (phi * 180) / Math.PI;
  const lon = (theta * 180) / Math.PI - 180;

  return { lat, lon };
}
