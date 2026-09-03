const GRAPH_HOPPER_ROUTE_URL = import.meta.env.VITE_GRAPHHOPPER_ROUTE_URL || 'https://graphhopper.com/api/1/route';
export const GRAPH_HOPPER_API_KEY = import.meta.env.VITE_GRAPHHOPPER_API_KEY || '';
const routeGeometryCache = new Map();

export function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function readLatLng(point) {
  const latitude = parseCoordinate(point?.latitude);
  const longitude = parseCoordinate(point?.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeVehicle(mode) {
  const value = String(mode || 'car').trim().toLowerCase();
  if (['walk', 'foot', 'pedestrian', 'hike'].includes(value)) {
    return 'foot';
  }
  if (['bike', 'bicycle', 'cycle'].includes(value)) {
    return 'bike';
  }
  if (['car', 'drive', 'driving'].includes(value)) {
    return 'car';
  }
  return 'car';
}

function parseGraphHopperGeometry(response) {
  const coordinates = response?.paths?.[0]?.points?.coordinates;
  if (!Array.isArray(coordinates)) {
    return null;
  }

  return coordinates
    .map((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) {
        return null;
      }

      const longitude = parseCoordinate(entry[0]);
      const latitude = parseCoordinate(entry[1]);
      if (latitude === null || longitude === null) {
        return null;
      }

      return { latitude, longitude };
    })
    .filter(Boolean);
}

export async function fetchRoadRoute(route, signal) {
  const from = readLatLng(route.from);
  const to = readLatLng(route.to);
  if (!from || !to) {
    return null;
  }

  const cacheKey = `${from.latitude},${from.longitude}:${to.latitude},${to.longitude}:${normalizeVehicle(route.mode)}`;
  if (routeGeometryCache.has(cacheKey)) {
    return routeGeometryCache.get(cacheKey);
  }

  const query = new URLSearchParams();
  query.append('point', `${from.latitude},${from.longitude}`);
  query.append('point', `${to.latitude},${to.longitude}`);
  query.append('vehicle', normalizeVehicle(route.mode));
  query.append('points_encoded', 'false');
  query.append('instructions', 'false');
  query.append('key', GRAPH_HOPPER_API_KEY);

  const response = await fetch(`${GRAPH_HOPPER_ROUTE_URL}?${query.toString()}`, { signal });
  if (!response.ok) {
    throw new Error(`Routing request failed with status ${response.status}`);
  }

  const data = await response.json();
  const geometry = parseGraphHopperGeometry(data);
  const summary = data?.paths?.[0] || {};
  const resolved = {
    geometry,
    distanceKm: Number.isFinite(summary.distance) ? summary.distance / 1000 : route.distanceKm,
    travelMinutes: Number.isFinite(summary.time) ? Math.round(summary.time / 60000) : route.travelMinutes,
    mode: route.mode || 'drive',
  };
  routeGeometryCache.set(cacheKey, resolved);
  return resolved;
}
