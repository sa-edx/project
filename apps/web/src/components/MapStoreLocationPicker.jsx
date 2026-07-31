import React, { useEffect, useMemo, useRef, useState } from 'react';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-mapstore-src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.mapstoreSrc = src;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

function readMapCenter(mapState) {
  const center = mapState?.center || mapState?.present?.center || null;
  if (!center) {
    return null;
  }

  if (Array.isArray(center) && center.length >= 2) {
    return {
      longitude: Number(center[0]),
      latitude: Number(center[1]),
      crs: mapState?.projection || mapState?.present?.projection || 'unknown',
    };
  }

  if (typeof center === 'object') {
    return {
      longitude: Number(center.x ?? center.lng ?? center.lon ?? 0),
      latitude: Number(center.y ?? center.lat ?? 0),
      crs: center.crs || mapState?.projection || mapState?.present?.projection || 'unknown',
    };
  }

  return null;
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildMapConfig(center, zoom = 14) {
  const resolvedCenter = center || { latitude: 0, longitude: 0 };
  return {
    version: 2,
    map: {
      projection: 'EPSG:4326',
      units: 'degrees',
      center: {
        x: parseCoordinate(resolvedCenter.longitude) ?? 0,
        y: parseCoordinate(resolvedCenter.latitude) ?? 0,
        crs: 'EPSG:4326',
      },
      zoom,
      maxExtent: [-180, -90, 180, 90],
      layers: [
        {
          type: 'osm',
          title: 'OpenStreetMap',
          name: 'mapnik',
          source: 'osm',
          group: 'background',
          visibility: true,
        },
      ],
    },
  };
}

export default function MapStoreLocationPicker({ value, onPick }) {
  const mapstoreApiUrl = useMemo(() => (import.meta.env.VITE_MAPSTORE_API_URL || '').trim(), []);
  const initialCenter = useMemo(() => {
    const latitude = parseCoordinate(value?.latitude);
    const longitude = parseCoordinate(value?.longitude);

    if (latitude === null || longitude === null) {
      return null;
    }

    return { latitude, longitude };
  }, [value?.latitude, value?.longitude]);
  const mapConfig = useMemo(() => buildMapConfig(initialCenter, initialCenter ? 14 : 2), [initialCenter]);
  const [status, setStatus] = useState(mapstoreApiUrl ? 'loading' : 'disabled');
  const [mapState, setMapState] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [containerId] = useState(() => `mapstore-location-picker-${Math.random().toString(36).slice(2, 10)}`);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!mapstoreApiUrl) {
      setStatus('disabled');
      return;
    }

    let cancelled = false;
    let unsubscribe = null;

    async function initializeMap() {
      try {
        setStatus('loading');
        setLoadError('');

        const scriptUrl = new URL('dist/ms2-api.js', mapstoreApiUrl).toString();
        await loadScript(scriptUrl);

        if (cancelled || !window.MapStore2) {
          return;
        }

        const container = containerRef.current || document.getElementById(containerId);
        if (!container) {
          throw new Error('MapStore picker container is missing.');
        }

        const waitForSize = () => new Promise((resolve, reject) => {
          const start = Date.now();
          const maxWaitMs = 4000;

          const checkSize = () => {
            if (cancelled) {
              reject(new Error('MapStore picker initialization cancelled.'));
              return;
            }

            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              resolve();
              return;
            }

            if (Date.now() - start > maxWaitMs) {
              resolve();
              return;
            }

            requestAnimationFrame(checkSize);
          };

          checkSize();
        });

        await waitForSize();

        window.MapStore2.create(containerId, {
          config: mapConfig,
        });

        const listener = (nextState) => {
          if (!cancelled) {
            setMapState(nextState);
          }
        };

        window.MapStore2.onStateChange(listener, (state) => state?.map || state?.config?.map || state);
        unsubscribe = () => window.MapStore2.offStateChange(listener);
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          setStatus('error');
          setLoadError(error?.message || 'Unable to load the MapStore picker.');
        }
      }
    }

    initializeMap();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [containerId, mapConfig, mapstoreApiUrl]);

  const currentCenter = readMapCenter(mapState);
  const displayedCenter = currentCenter || initialCenter;

  return (
    <div className="mapstore-picker">
      <div className="mapstore-picker__header">
        <h4>MapStore location picker</h4>
        <p>
          {mapstoreApiUrl
            ? 'Move the map, then apply the visible center to the facility coordinates.'
            : 'Set VITE_MAPSTORE_API_URL to your local MapStore api.html URL to enable map-based picking.'}
        </p>
      </div>

      {mapstoreApiUrl ? (
        <>
          <div className="mapstore-picker__frame">
            <div id={containerId} ref={containerRef} className="mapstore-picker__map" />
          </div>
          <div className="mapstore-picker__toolbar">
            <div className="mapstore-picker__readout">
              <strong>Map center</strong>
              {displayedCenter ? (
                <span>
                  {displayedCenter.latitude.toFixed(6)}, {displayedCenter.longitude.toFixed(6)} {currentCenter?.crs ? `(${currentCenter.crs})` : ''}
                </span>
              ) : (
                <span>Pan the map to capture a location.</span>
              )}
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                if (!currentCenter) {
                  return;
                }

                onPick({
                  latitude: Number.isFinite(currentCenter.latitude) ? currentCenter.latitude : '',
                  longitude: Number.isFinite(currentCenter.longitude) ? currentCenter.longitude : '',
                });
              }}
              disabled={!currentCenter || status !== 'ready'}
            >
              Use visible center
            </button>
          </div>
          {loadError ? <p className="error-text">{loadError}</p> : null}
        </>
      ) : (
        <div className="mapstore-picker__empty">
          <p>No MapStore URL configured yet.</p>
          <small>
            Example: set <code>VITE_MAPSTORE_API_URL=http://localhost:8080/mapstore/api.html</code> and restart the web app.
          </small>
        </div>
      )}
      {value?.latitude !== '' || value?.longitude !== '' ? (
        <p className="mapstore-picker__hint">
          Current coordinates: {value.latitude || 'n/a'}, {value.longitude || 'n/a'}
        </p>
      ) : null}
    </div>
  );
}
