import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { DEFAULT_MAP_BUILDING_IMAGE } from '../mapBuildingMarker.js';
import { GRAPH_HOPPER_API_KEY, fetchRoadRoute, parseCoordinate, readLatLng } from '../mapRouting.js';

const DEFAULT_CENTER = { latitude: 25.2048, longitude: 55.2708 };
const DEFAULT_MAP_STYLE = 'satellite';
const ION_TOKEN = (import.meta.env.VITE_CESIUM_ION_TOKEN || '').trim();

function MapControls({ zoomIn, zoomOut, centerLabel, mapStyle, onSetMapStyle }) {
  return (
    <div className="map-controls map-controls--3d" onPointerDown={(event) => event.stopPropagation()}>
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

function createImageryProvider(Cesium, mapStyle) {
  if (mapStyle === 'map') {
    return new Cesium.UrlTemplateImageryProvider({
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: '© OpenStreetMap contributors',
      maximumLevel: 19,
    });
  }

  return new Cesium.UrlTemplateImageryProvider({
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Esri, Maxar, Earthstar Geographics',
    maximumLevel: 18,
  });
}

function createPoiImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 48;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas.toDataURL();
  }

  context.clearRect(0, 0, 48, 64);
  context.beginPath();
  context.arc(24, 20, 12, 0, Math.PI * 2);
  context.fillStyle = '#49d6c5';
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = '#08111a';
  context.stroke();
  context.beginPath();
  context.moveTo(24, 32);
  context.lineTo(16, 52);
  context.lineTo(32, 52);
  context.closePath();
  context.fillStyle = '#49d6c5';
  context.fill();
  return canvas.toDataURL();
}

function isGpuShaderError(error) {
  const message = String(error?.message || error || '');
  return /shader|fragment shader|vertex shader|failed to compile|GLSL|WEBGL/i.test(message);
}

function addProjectBuilding(viewer, Cesium, point, { disableModel = false } = {}) {
  const latitude = parseCoordinate(point.latitude);
  const longitude = parseCoordinate(point.longitude);
  if (latitude === null || longitude === null) {
    return;
  }

  if (point.modelUrl && !disableModel) {
    const position = Cesium.Cartesian3.fromDegrees(longitude, latitude, 0);
    const headingDegrees = Number.isFinite(Number(point.modelHeading)) ? Number(point.modelHeading) : 0;
    const scale = Number.isFinite(Number(point.modelScale)) && Number(point.modelScale) > 0 ? Number(point.modelScale) : 1;
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      position,
      new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(headingDegrees), 0, 0),
    );

    viewer.entities.add({
      id: point.id,
      name: point.label,
      position,
      orientation,
      model: {
        uri: point.modelUrl,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        scale,
        minimumPixelSize: 48,
        maximumScale: 800,
        incrementallyLoadTextures: true,
        runAnimations: false,
        shadows: Cesium.ShadowMode.DISABLED,
        silhouetteSize: 0,
        color: Cesium.Color.WHITE,
        colorBlendMode: Cesium.ColorBlendMode.HIGHLIGHT,
        colorBlendAmount: 0,
        imageBasedLightingFactor: new Cesium.Cartesian2(1.0, 0.2),
      },
      label: {
        text: point.label || '',
        font: '600 14px Segoe UI, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -24),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
    });
    return;
  }

  const customImage =
    typeof point.image === 'string' && point.image.trim() && point.image.trim() !== DEFAULT_MAP_BUILDING_IMAGE
      ? point.image.trim()
      : '';

  if (customImage) {
    viewer.entities.add({
      id: point.id,
      name: point.label,
      position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
      billboard: {
        image: customImage,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        width: 104,
        height: 128,
        scaleByDistance: new Cesium.NearFarScalar(150, 1.35, 12000, 0.3),
      },
      label: {
        text: point.label || '',
        font: '600 14px Segoe UI, sans-serif',
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
        outlineWidth: 4,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -136),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
    return;
  }

  const podium = 9;
  const tower = 78;
  const cap = 4;

  viewer.entities.add({
    id: `${point.id}-podium`,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, podium / 2),
    box: {
      dimensions: new Cesium.Cartesian3(42, 32, podium),
      material: Cesium.Color.fromCssColorString('#c4b093'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#7a6a55').withAlpha(0.85),
    },
  });
  viewer.entities.add({
    id: `${point.id}-tower`,
    name: point.label,
    description: point.label,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, podium + tower / 2),
    box: {
      dimensions: new Cesium.Cartesian3(26, 22, tower),
      material: Cesium.Color.fromCssColorString('#efe4d2'),
      outline: true,
      outlineColor: Cesium.Color.fromCssColorString('#b7a48c'),
    },
  });
  viewer.entities.add({
    id: `${point.id}-cap`,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, podium + tower + cap / 2),
    box: {
      dimensions: new Cesium.Cartesian3(28, 24, cap),
      material: Cesium.Color.fromCssColorString('#8d6b4a'),
    },
  });
  viewer.entities.add({
    id: `${point.id}-label`,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, podium + tower + cap + 10),
    label: {
      text: point.label || '',
      font: '600 14px Segoe UI, sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
      outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addPoiMarker(viewer, Cesium, point, pinImage) {
  const latitude = parseCoordinate(point.latitude);
  const longitude = parseCoordinate(point.longitude);
  if (latitude === null || longitude === null) {
    return;
  }

  viewer.entities.add({
    id: point.id,
    name: point.label,
    position: Cesium.Cartesian3.fromDegrees(longitude, latitude, 0),
    billboard: {
      image: pinImage,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scale: 0.7,
    },
    label: {
      text: point.label || '',
      font: '600 12px Segoe UI, sans-serif',
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.fromCssColorString('#0b1220'),
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -56),
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
}

function addRouteEntity(viewer, Cesium, route, details, isSelected) {
  const from = readLatLng(route.from);
  const to = readLatLng(route.to);
  if (!from || !to) {
    return null;
  }

  const pathPoints = Array.isArray(details?.geometry) && details.geometry.length ? details.geometry : [from, to];
  const positions = pathPoints.flatMap((point) => [point.longitude, point.latitude]);

  viewer.entities.add({
    id: route.id,
    name: route.label,
    polyline: {
      positions: Cesium.Cartesian3.fromDegreesArray(positions),
      width: isSelected ? 6 : 4,
      clampToGround: true,
      material: Cesium.Color.fromCssColorString(isSelected ? '#f97316' : '#49d6c5'),
    },
  });

  return {
    ...route,
    distanceKm: details?.distanceKm ?? route.distanceKm,
    travelMinutes: details?.travelMinutes ?? route.travelMinutes,
    mode: details?.mode || route.mode,
  };
}

function flyToPoints(viewer, Cesium, points) {
  const coordinates = points
    .map((point) => {
      const latitude = parseCoordinate(point.latitude);
      const longitude = parseCoordinate(point.longitude);
      if (latitude === null || longitude === null) {
        return null;
      }
      return { latitude, longitude };
    })
    .filter(Boolean);

  if (!coordinates.length) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(DEFAULT_CENTER.longitude, DEFAULT_CENTER.latitude, 1200),
      orientation: {
        heading: Cesium.Math.toRadians(20),
        pitch: Cesium.Math.toRadians(-38),
        roll: 0,
      },
      duration: 0.8,
    });
    return;
  }

  if (coordinates.length === 1) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(coordinates[0].longitude, coordinates[0].latitude, 650),
      orientation: {
        heading: Cesium.Math.toRadians(22),
        pitch: Cesium.Math.toRadians(-38),
        roll: 0,
      },
      duration: 1.1,
    });
    return;
  }

  const cartesians = coordinates.map((point) => Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude, 40));
  const sphere = Cesium.BoundingSphere.fromPoints(cartesians);
  viewer.camera.flyToBoundingSphere(sphere, {
    offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(22), Cesium.Math.toRadians(-42), Math.max(sphere.radius * 4.5, 500)),
    duration: 1.1,
  });
}

function formatCameraLabel(viewer, Cesium) {
  const cartographic = viewer.camera.positionCartographic;
  if (!cartographic) {
    return `${DEFAULT_CENTER.latitude.toFixed(5)}, ${DEFAULT_CENTER.longitude.toFixed(5)}`;
  }

  return `${Cesium.Math.toDegrees(cartographic.latitude).toFixed(5)}, ${Cesium.Math.toDegrees(cartographic.longitude).toFixed(5)}`;
}

export default function CesiumProjectMap({ points, focusPoints, routes, className = 'location-map__map' }) {
  const safePoints = Array.isArray(points) ? points : [];
  const safeFocusPoints = Array.isArray(focusPoints) && focusPoints.length ? focusPoints : safePoints;
  const safeRoutes = Array.isArray(routes) ? routes : [];
  const wrapperRef = useRef(null);
  const viewerRef = useRef(null);
  const cesiumRef = useRef(null);
  const poiImageRef = useRef('');
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mapStyle, setMapStyle] = useState(DEFAULT_MAP_STYLE);
  const [centerLabel, setCenterLabel] = useState(`${DEFAULT_CENTER.latitude.toFixed(5)}, ${DEFAULT_CENTER.longitude.toFixed(5)}`);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [routeDetails, setRouteDetails] = useState({});
  const disableModelsRef = useRef(false);
  const pointsRef = useRef(safePoints);

  const focusSignature = useMemo(
    () => safeFocusPoints.map((point) => `${point.id}:${point.latitude},${point.longitude}`).join('|'),
    [safeFocusPoints],
  );
  const pointSignature = useMemo(
    () =>
      safePoints
        .map((point) => {
          const image = typeof point.image === 'string' ? point.image : '';
          const imageKey = image ? `${image.length}:${image.slice(0, 24)}:${image.slice(-24)}` : '';
          return `${point.id}:${point.kind}:${point.latitude},${point.longitude}:${point.modelUrl || ''}:${point.modelHeading || 0}:${point.modelScale || 1}:${imageKey}`;
        })
        .join('|'),
    [safePoints],
  );
  const routeSignature = useMemo(
    () =>
      safeRoutes
        .map((route) => `${route.id}:${route.from?.latitude},${route.from?.longitude}:${route.to?.latitude},${route.to?.longitude}`)
        .join('|'),
    [safeRoutes],
  );

  useEffect(() => {
    const container = wrapperRef.current;
    if (!container) {
      return undefined;
    }

    let cancelled = false;
    let resizeObserver;

    async function createViewer() {
      try {
        if (!window.CESIUM_BASE_URL) {
          window.CESIUM_BASE_URL = '/cesium-lib/';
        }
        if (cancelled || viewerRef.current) {
          return;
        }

        if (ION_TOKEN) {
          Cesium.Ion.defaultAccessToken = ION_TOKEN;
        }

        const viewer = new Cesium.Viewer(container, {
          animation: false,
          timeline: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          baseLayerPicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          infoBox: true,
          selectionIndicator: true,
          baseLayer: false,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
          contextOptions: {
            webgl: {
              alpha: false,
              failIfMajorPerformanceCaveat: false,
            },
          },
        });

        viewer.scene.highDynamicRange = false;
        viewer.scene.fog.enabled = false;

        if (ION_TOKEN && typeof Cesium.createWorldTerrainAsync === 'function') {
          try {
            viewer.terrainProvider = await Cesium.createWorldTerrainAsync();
          } catch {
            viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
          }
        }

        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.shadows = false;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 40;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 2.0e7;
        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(createImageryProvider(Cesium, DEFAULT_MAP_STYLE));

        poiImageRef.current = createPoiImage();
        cesiumRef.current = Cesium;
        viewerRef.current = viewer;
        setReady(true);
        setLoadError('');

        viewer.scene.renderError.addEventListener((scene, error) => {
          if (!isGpuShaderError(error) || disableModelsRef.current) {
            setLoadError(error?.message || 'The 3D map failed to render.');
            return;
          }

          disableModelsRef.current = true;
          setLoadError(
            'Fragment shader failed to compile for this GLB. The map marker is shown instead. Re-upload an optimized model (≤ 15 MB, 1024px textures).',
          );

          try {
            viewer.entities.removeAll();
            pointsRef.current.forEach((point) => {
              if (point.kind === 'project') {
                addProjectBuilding(viewer, Cesium, point, { disableModel: true });
                return;
              }
              addPoiMarker(viewer, Cesium, point, poiImageRef.current);
            });
            scene.requestRender();
          } catch {
            // Keep the error banner if fallback also fails.
          }
        });

        viewer.camera.moveEnd.addEventListener(() => {
          setCenterLabel(formatCameraLabel(viewer, Cesium));
        });

        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((movement) => {
          const picked = viewer.scene.pick(movement.position);
          const entity = picked?.id;
          if (entity?.polyline) {
            setSelectedRouteId(entity.id);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        viewer._portalClickHandler = handler;

        resizeObserver = new ResizeObserver(() => {
          viewer.resize();
        });
        resizeObserver.observe(container);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error?.message || 'Failed to start the 3D map.');
        }
      }
    }

    createViewer();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed()) {
        viewer._portalClickHandler?.destroy();
        viewer.destroy();
      }
      viewerRef.current = null;
      cesiumRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !ready) {
      return;
    }

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(createImageryProvider(Cesium, mapStyle));
  }, [mapStyle, ready]);

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
    pointsRef.current = safePoints;
  }, [safePoints]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !ready) {
      return;
    }

    viewer.entities.removeAll();

    safePoints.forEach((point) => {
      if (point.kind === 'project') {
        addProjectBuilding(viewer, Cesium, point, { disableModel: disableModelsRef.current });
        return;
      }

      addPoiMarker(viewer, Cesium, point, poiImageRef.current);
    });

    safeRoutes.forEach((route) => {
      addRouteEntity(viewer, Cesium, route, routeDetails[route.id], route.id === selectedRouteId);
    });
  }, [pointSignature, ready, routeDetails, routeSignature, selectedRouteId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !ready) {
      return;
    }

    flyToPoints(viewer, Cesium, safeFocusPoints);
    setCenterLabel(formatCameraLabel(viewer, Cesium));
  }, [focusSignature, ready]);

  function zoomBy(direction) {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const amount = Math.max(viewer.camera.positionCartographic.height * 0.28, 80);
    if (direction > 0) {
      viewer.camera.zoomIn(amount);
    } else {
      viewer.camera.zoomOut(amount);
    }
  }

  const selectedRoute =
    safeRoutes.find((route) => route.id === selectedRouteId) || safeRoutes[0] || null;
  const selectedDetails = selectedRoute ? routeDetails[selectedRoute.id] || {} : {};

  return (
    <div className="location-map__stack location-map__stack--interactive location-map__stack--3d">
      <div
        ref={wrapperRef}
        className={`${className} location-map__map--interactive location-map__map--3d`}
        role="application"
        aria-label="Interactive 3D map"
      />
      {loadError ? <div className="location-map__cesium-error">{loadError}</div> : null}
      <p className="location-map__cesium-hint">Drag to pan · Right-drag to tilt · Scroll to zoom</p>
      <MapControls
        zoomIn={() => zoomBy(1)}
        zoomOut={() => zoomBy(-1)}
        centerLabel={centerLabel}
        mapStyle={mapStyle}
        onSetMapStyle={setMapStyle}
      />
      {selectedRoute ? (
        <div className="location-map__route-info location-map__route-info--3d">
          <strong>{selectedRoute.label}</strong>
          <p>
            {selectedDetails.distanceKm ?? selectedRoute.distanceKm} km | {selectedDetails.travelMinutes ?? selectedRoute.travelMinutes} min
          </p>
          <small>{selectedDetails.mode || selectedRoute.mode || 'drive'} route</small>
        </div>
      ) : null}
    </div>
  );
}
