import React, { useEffect, useMemo, useRef, useState } from 'react';

const TILE_SIZE = 256;
const DEFAULT_CENTER = { latitude: 25.2048, longitude: 55.2708 };
const DEFAULT_ZOOM = 16;
const DEFAULT_MAP_STYLE = 'satellite';
const MIN_ZOOM = 2;
const MAX_ZOOM = 18;
const MULTI_POINT_MIN_ZOOM = 12;
const GRAPH_HOPPER_ROUTE_URL = import.meta.env.VITE_GRAPHHOPPER_ROUTE_URL || 'https://graphhopper.com/api/1/route';
const GRAPH_HOPPER_API_KEY = import.meta.env.VITE_GRAPHHOPPER_API_KEY || '';
const routeGeometryCache = new Map();

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function wrapLongitude(longitude) {
  if (!Number.isFinite(longitude)) {
    return 0;
  }

  let next = longitude;
  while (next < -180) next += 360;
  while (next > 180) next -= 360;
  return next;
}

function latLngToWorld({ latitude, longitude }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const x = ((wrapLongitude(longitude) + 180) / 360) * scale;
  const lat = clamp(latitude, -85.05112878, 85.05112878);
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
}

function worldToLatLng({ x, y }, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const mercatorY = Math.PI * (1 - (2 * y) / scale);
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));
  return { latitude, longitude };
}

function readLatLng(point) {
  const latitude = parseCoordinate(point?.latitude);
  const longitude = parseCoordinate(point?.longitude);
  if (latitude === null || longitude === null) {
    return null;
  }

  return { latitude, longitude };
}

function getFitView(points, size) {
  const safePoints = Array.isArray(points) ? points : [];
  const coordinates = safePoints
    .map((point) => ({
      latitude: parseCoordinate(point.latitude),
      longitude: parseCoordinate(point.longitude),
    }))
    .filter((point) => point.latitude !== null && point.longitude !== null);

  if (!coordinates.length) {
    return {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    };
  }

  if (coordinates.length === 1) {
    return {
      center: coordinates[0],
      zoom: DEFAULT_ZOOM,
    };
  }

  const latitudes = coordinates.map((point) => point.latitude);
  const longitudes = coordinates.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const span = Math.max(maxLat - minLat, maxLng - minLng);

  let zoom = 12;
  if (span > 40) zoom = 4;
  else if (span > 20) zoom = 5;
  else if (span > 10) zoom = 6;
  else if (span > 4) zoom = 8;
  else if (span > 1.5) zoom = 10;
  else if (span > 0.5) zoom = 12;
  else if (span > 0.15) zoom = 13;
  else zoom = DEFAULT_ZOOM;

  if (size?.width && size?.height && coordinates.length > 1) {
    const padding = coordinates.length > 2 ? 72 : 56;
    const usableWidth = Math.max(1, size.width - padding * 2);
    const usableHeight = Math.max(1, size.height - padding * 2);
    const worldPoints = coordinates.map((point) => latLngToWorld(point, 0));
    const minX = Math.min(...worldPoints.map((point) => point.x));
    const maxX = Math.max(...worldPoints.map((point) => point.x));
    const minY = Math.min(...worldPoints.map((point) => point.y));
    const maxY = Math.max(...worldPoints.map((point) => point.y));
    const worldWidth = Math.max(maxX - minX, 1);
    const worldHeight = Math.max(maxY - minY, 1);
    const zoomForWidth = Math.log2(usableWidth / worldWidth);
    const zoomForHeight = Math.log2(usableHeight / worldHeight);
    zoom = clamp(Math.floor(Math.min(zoomForWidth, zoomForHeight)), MULTI_POINT_MIN_ZOOM, MAX_ZOOM);
  }

  return {
    center: {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
    },
    zoom,
  };
}

function createTileUrl(x, y, z, mapStyle = DEFAULT_MAP_STYLE) {
  if (mapStyle === 'satellite') {
    return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }

  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
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

function getPolylineMidpoint(points) {
  if (!Array.isArray(points) || !points.length) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return points[0];
  }

  const lengths = [];
  let totalLength = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    lengths.push(length);
    totalLength += length;
  }

  if (!totalLength) {
    return points[0];
  }

  const targetLength = totalLength / 2;
  let travelled = 0;

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = lengths[index - 1];
    if (travelled + length >= targetLength) {
      const ratio = (targetLength - travelled) / length;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    travelled += length;
  }

  return points[points.length - 1];
}

function buildSvgPath(points) {
  if (!Array.isArray(points) || !points.length) {
    return '';
  }

  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
}

async function fetchRoadRoute(route, signal) {
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

function MapControls({ zoomIn, zoomOut, centerLabel, mapStyle, onSetMapStyle }) {
  return (
    <div className="map-controls" onPointerDown={(event) => event.stopPropagation()}>
      <button type="button" onClick={zoomIn} aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={zoomOut} aria-label="Zoom out">
        -
      </button>
      <div className="map-controls__segmented" role="group" aria-label="Map style">
        <button
          type="button"
          className={`map-controls__segment ${mapStyle === 'satellite' ? 'map-controls__segment--active' : ''}`}
          onClick={() => onSetMapStyle('satellite')}
          aria-pressed={mapStyle === 'satellite'}
        >
          Satellite
        </button>
        <button
          type="button"
          className={`map-controls__segment ${mapStyle === 'map' ? 'map-controls__segment--active' : ''}`}
          onClick={() => onSetMapStyle('map')}
          aria-pressed={mapStyle === 'map'}
        >
          Map
        </button>
      </div>
      <span>{centerLabel}</span>
    </div>
  );
}

export default function MapStoreStaticMap({ points, focusPoints, routes, className = 'location-map__map' }) {
  const safePoints = Array.isArray(points) ? points : [];
  const safeFocusPoints = Array.isArray(focusPoints) && focusPoints.length ? focusPoints : safePoints;
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const wrapperRef = useRef(null);
  const dragRef = useRef(null);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeDetails, setRouteDetails] = useState({});
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState(() => getFitView(safeFocusPoints));
  const [mapStyle, setMapStyle] = useState(DEFAULT_MAP_STYLE);

  const focusSignature = useMemo(
    () => safeFocusPoints.map((point) => `${point.id}:${point.latitude},${point.longitude}`).join('|'),
    [safeFocusPoints],
  );

  const routeSignature = useMemo(
    () =>
      safeRoutes
        .map((route) => `${route.id}:${route.from?.latitude},${route.from?.longitude}:${route.to?.latitude},${route.to?.longitude}`)
        .join('|'),
    [safeRoutes],
  );

  useEffect(() => {
    setView(getFitView(safeFocusPoints, size));
  }, [focusSignature, size.width, size.height]);

  useEffect(() => {
    if (!safeRoutes.length) {
      setSelectedRouteId('');
      setRouteDetails({});
      return;
    }

    if (!selectedRouteId || !safeRoutes.some((route) => route.id === selectedRouteId)) {
      setSelectedRouteId(safeRoutes[0].id);
    }
  }, [safeRoutes, selectedRouteId]);

  useEffect(() => {
    if (!safeRoutes.length || !GRAPH_HOPPER_API_KEY) {
      setRouteDetails({});
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    Promise.allSettled(
      safeRoutes.map(async (route) => {
        const result = await fetchRoadRoute(route, controller.signal);
        if (!result) {
          return null;
        }

        return [route.id, result];
      }),
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const nextRouteDetails = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
          const [routeId, details] = result.value;
          nextRouteDetails[routeId] = details;
        }
      });

      setRouteDetails(nextRouteDetails);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeSignature, safeRoutes]);

  useEffect(() => {
    const element = wrapperRef.current;
    if (!element) {
      return undefined;
    }

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
      });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const viewport = useMemo(() => {
    if (!size.width || !size.height) {
      return null;
    }

    return {
      centerWorld: latLngToWorld(view.center, view.zoom),
      worldSize: TILE_SIZE * 2 ** view.zoom,
    };
  }, [size.width, size.height, view.center, view.zoom]);

  const tileInfo = useMemo(() => {
    if (!viewport) {
      return { tiles: [], topLeftWorld: { x: 0, y: 0 } };
    }

    const centerWorld = viewport.centerWorld;
    const topLeftWorld = {
      x: centerWorld.x - size.width / 2,
      y: centerWorld.y - size.height / 2,
    };
    const maxTileIndex = 2 ** view.zoom - 1;
    const startX = Math.floor(topLeftWorld.x / TILE_SIZE) - 1;
    const endX = Math.floor((topLeftWorld.x + size.width) / TILE_SIZE) + 1;
    const startY = Math.floor(topLeftWorld.y / TILE_SIZE) - 1;
    const endY = Math.floor((topLeftWorld.y + size.height) / TILE_SIZE) + 1;
    const tiles = [];

    for (let x = startX; x <= endX; x += 1) {
      const wrappedX = ((x % (maxTileIndex + 1)) + (maxTileIndex + 1)) % (maxTileIndex + 1);
      for (let y = startY; y <= endY; y += 1) {
        if (y < 0 || y > maxTileIndex) {
          continue;
        }

        tiles.push({
          key: `${view.zoom}-${x}-${y}`,
          x: x * TILE_SIZE - topLeftWorld.x,
          y: y * TILE_SIZE - topLeftWorld.y,
          src: createTileUrl(wrappedX, y, view.zoom, mapStyle),
        });
      }
    }

    return { tiles, topLeftWorld };
  }, [mapStyle, size.height, size.width, view.center, view.zoom, viewport]);

  const markerPositions = useMemo(() => {
    if (!viewport) {
      return [];
    }

    return safePoints
      .map((point) => {
        const latitude = parseCoordinate(point.latitude);
        const longitude = parseCoordinate(point.longitude);
        if (latitude === null || longitude === null) {
          return null;
        }

        const world = latLngToWorld({ latitude, longitude }, view.zoom);
        return {
          ...point,
          left: world.x - tileInfo.topLeftWorld.x,
          top: world.y - tileInfo.topLeftWorld.y,
        };
      })
      .filter(Boolean);
  }, [safePoints, tileInfo.topLeftWorld.x, tileInfo.topLeftWorld.y, view.zoom, viewport]);

  const routePositions = useMemo(() => {
    if (!viewport || !safeRoutes.length) {
      return [];
    }

    return safeRoutes
      .map((route) => {
        const from = readLatLng(route.from);
        const to = readLatLng(route.to);
        if (!from || !to) {
          return null;
        }

        const routeDetail = routeDetails[route.id] || {};
        const pathPoints = Array.isArray(routeDetail.geometry) && routeDetail.geometry.length ? routeDetail.geometry : [from, to];
        const projectedPoints = pathPoints.map((point) => {
          const world = latLngToWorld(point, view.zoom);
          return {
            x: world.x - tileInfo.topLeftWorld.x,
            y: world.y - tileInfo.topLeftWorld.y,
          };
        });
        const midpoint = getPolylineMidpoint(projectedPoints);

        return {
          ...route,
          pathD: buildSvgPath(projectedPoints),
          midX: midpoint.x,
          midY: midpoint.y,
          from,
          to,
          geometry: pathPoints,
          distanceKm: routeDetail.distanceKm ?? route.distanceKm,
          travelMinutes: routeDetail.travelMinutes ?? route.travelMinutes,
          mode: routeDetail.mode || route.mode,
        };
      })
      .filter(Boolean);
  }, [routeDetails, routeSignature, tileInfo.topLeftWorld.x, tileInfo.topLeftWorld.y, view.zoom, viewport]);

  const selectedRoute = routePositions.find((route) => route.id === selectedRouteId) || routePositions[0] || null;

  function handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const target = wrapperRef.current;
    if (!target) {
      return;
    }

    if (typeof target.setPointerCapture === 'function') {
      target.setPointerCapture(event.pointerId);
    }
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      center: view.center,
      zoom: view.zoom,
      pointerId: event.pointerId,
    };
  }

  function handlePointerMove(event) {
    if (!dragRef.current) {
      return;
    }

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const worldCenter = latLngToWorld(dragRef.current.center, dragRef.current.zoom);
    const nextWorld = {
      x: worldCenter.x - dx,
      y: worldCenter.y - dy,
    };
    setView({
      center: worldToLatLng(nextWorld, dragRef.current.zoom),
      zoom: dragRef.current.zoom,
    });
  }

  function handlePointerUp(event) {
    if (!dragRef.current) {
      return;
    }

    const target = wrapperRef.current;
    if (target && typeof target.releasePointerCapture === 'function') {
      try {
        target.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore release errors.
      }
    }

    dragRef.current = null;
  }

  function handleWheel(event) {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setView((current) => ({
      center: current.center,
      zoom: clamp(current.zoom + direction, MIN_ZOOM, MAX_ZOOM),
    }));
  }

  const zoomIn = () => setView((current) => ({ center: current.center, zoom: clamp(current.zoom + 1, MIN_ZOOM, MAX_ZOOM) }));
  const zoomOut = () => setView((current) => ({ center: current.center, zoom: clamp(current.zoom - 1, MIN_ZOOM, MAX_ZOOM) }));
  const centerLabel = `${view.center.latitude.toFixed(5)}, ${view.center.longitude.toFixed(5)}`;
  function handleToggleMapStyle() {
    setMapStyle((current) => (current === 'satellite' ? 'map' : 'satellite'));
  }

  return (
    <div className="location-map__stack location-map__stack--interactive">
      <div
        ref={wrapperRef}
        className={`${className} location-map__map--interactive`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        role="application"
        aria-label="Interactive map"
      >
        <div className="location-map__tiles">
          {tileInfo.tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              className="location-map__tile"
              style={{
                transform: `translate(${tile.x}px, ${tile.y}px)`,
              }}
              draggable="false"
            />
          ))}
        </div>

        <svg className="location-map__routes" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true">
          {routePositions.map((route) => {
            const isSelected = route.id === selectedRouteId;
            return (
              <g key={route.id}>
                <path
                  d={route.pathD}
                  className={`location-map__route-hit ${isSelected ? 'location-map__route-hit--active' : ''}`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setSelectedRouteId(route.id)}
                />
                <path d={route.pathD} className={`location-map__route ${isSelected ? 'location-map__route--active' : ''}`} />
                <text x={route.midX} y={route.midY - 10} className={`location-map__route-label ${isSelected ? 'location-map__route-label--active' : ''}`}>
                  {route.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="location-map__markers" aria-hidden="true">
          {markerPositions.map((point) => (
            <span
              key={point.id}
              className={`location-map__pin ${point.kind === 'project' ? 'location-map__pin--project' : ''}`}
              style={{
                left: `${point.left}px`,
                top: `${point.top}px`,
              }}
            />
          ))}
        </div>

        <MapControls
          zoomIn={zoomIn}
          zoomOut={zoomOut}
          centerLabel={centerLabel}
          mapStyle={mapStyle}
          onSetMapStyle={setMapStyle}
        />

        {selectedRoute ? (
          <div className="location-map__route-info">
            <strong>{selectedRoute.label}</strong>
            <p>
              {selectedRoute.distanceKm} km | {selectedRoute.travelMinutes} min
            </p>
            <small>{selectedRoute.mode || 'drive'} route</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
