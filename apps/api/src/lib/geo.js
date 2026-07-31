function toNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric = Number(value?.toString?.() ?? value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeLatitudeLongitude(latitude, longitude) {
  const lat = toNumber(latitude);
  const lng = toNumber(longitude);

  if (lat === null || lng === null) {
    return null;
  }

  return { latitude: lat, longitude: lng };
}

export function calculateDistanceKm(origin, destination) {
  if (!origin || !destination) {
    return null;
  }

  const radiusKm = 6371;
  const lat1 = (origin.latitude * Math.PI) / 180;
  const lat2 = (destination.latitude * Math.PI) / 180;
  const deltaLat = ((destination.latitude - origin.latitude) * Math.PI) / 180;
  const deltaLng = ((destination.longitude - origin.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return 2 * radiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateTravelMinutes(distanceKm, mode = 'drive') {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    return null;
  }

  const speedKmhByMode = {
    walk: 5,
    bike: 15,
    transit: 28,
    drive: 40,
  };

  const speedKmh = speedKmhByMode[String(mode || '').toLowerCase()] || speedKmhByMode.drive;
  const minutes = (distanceKm / speedKmh) * 60;
  return Math.max(1, Math.round(minutes));
}

export function projectDistancePayload(project, facility, mode = 'drive') {
  const origin = normalizeLatitudeLongitude(project?.latitude, project?.longitude);
  const destination = normalizeLatitudeLongitude(facility?.latitude, facility?.longitude);

  const distanceKm = calculateDistanceKm(origin, destination);
  if (distanceKm === null) {
    return null;
  }

  return {
    distanceKm: Number(distanceKm.toFixed(2)),
    travelMinutes: estimateTravelMinutes(distanceKm, mode),
  };
}
