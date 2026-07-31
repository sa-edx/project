import React, { useEffect, useMemo, useState } from 'react';
import MapStoreStaticMap from './MapStoreStaticMap.jsx';
function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' · ');
}

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
}

function formatMoney(value, currency = 'AED') {
  if (value === null || value === undefined || value === '') {
    return 'Price on request';
  }

  const amount = Number(value);
  if (Number.isNaN(amount)) {
    return `${value} ${currency}`;
  }

  const safeCurrency = String(currency || 'AED').trim().toUpperCase();
  try {
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: safeCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${new Intl.NumberFormat('en', { maximumFractionDigits: 0 }).format(amount)} ${safeCurrency}`;
  }
}

function getUniqueBuilders(projects) {
  const builders = new Map();
  for (const project of projects || []) {
    const developer = project.developer;
    if (!developer?.id || builders.has(developer.id)) {
      continue;
    }

    builders.set(developer.id, developer);
  }
  return Array.from(builders.values());
}

function getSelectedBuilding(project, selectedBuildingId) {
  const buildings = project?.buildings || [];
  return buildings.find((building) => building.id === selectedBuildingId) || buildings[0] || null;
}

function getSelectedFloor(building, selectedFloorId) {
  const floors = building?.floors || [];
  return floors.find((floor) => floor.id === selectedFloorId) || floors[0] || null;
}

function buildMapPoints(project, selectedBuilding, selectedFacilityIds = []) {
  const points = [];
  const focusPoints = [];
  const routes = [];
  const latitude = parseCoordinate(project?.latitude);
  const longitude = parseCoordinate(project?.longitude);
  let projectPoint = null;

  if (latitude !== null && longitude !== null) {
    projectPoint = {
      id: `project-${project.id}`,
      label: selectedBuilding?.buildingName || project.projectName,
      kind: 'project',
      latitude,
      longitude,
    };
    points.push(projectPoint);
    focusPoints.push(projectPoint);
  }

  for (const destination of project?.nearbyDestinations || []) {
    const destLat = parseCoordinate(destination.latitude);
    const destLng = parseCoordinate(destination.longitude);
    if (destLat === null || destLng === null) {
      continue;
    }

    points.push({
      id: destination.id,
      label: destination.label,
      kind: 'poi',
      latitude: destLat,
      longitude: destLng,
    });
  }

  const facilities = Array.isArray(selectedFacilityIds) && selectedFacilityIds.length
    ? (project?.projectFacilities || []).filter((assignment) => selectedFacilityIds.includes(assignment.id))
    : project?.projectFacilities || [];

  for (const assignment of facilities) {
    const facilityLat = parseCoordinate(assignment.facility?.latitude);
    const facilityLng = parseCoordinate(assignment.facility?.longitude);
    if (facilityLat === null || facilityLng === null) {
      continue;
    }

    const facilityPoint = {
      id: assignment.id,
      label: assignment.facility?.name || 'Facility',
      kind: 'poi',
      latitude: facilityLat,
      longitude: facilityLng,
    };
    points.push(facilityPoint);
    if (selectedFacilityIds.length) {
      focusPoints.push(facilityPoint);
    }

    if (projectPoint && selectedFacilityIds.length) {
      routes.push({
        id: `route-${assignment.id}`,
        label: assignment.facility?.name || 'Facility',
        from: projectPoint,
        to: facilityPoint,
        distanceKm: assignment.distanceKm,
        travelMinutes: assignment.travelMinutes,
        mode: assignment.mode,
      });
    }
  }

  if (!focusPoints.length) {
    focusPoints.push(...points);
  }

  return { points, focusPoints, routes };
}

function MapLegend({ points }) {
  if (!points.length) {
    return null;
  }

  return (
    <div className="public-map-legend">
      {points.map((point) => (
        <div className="public-map-legend__item" key={point.id}>
          <span className={`public-map-legend__dot ${point.kind === 'project' ? 'public-map-legend__dot--project' : ''}`} />
          <span>{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function BuildingSidebar({ project, building, selectedFloor, selectedFacilityIds, onToggleFacility, onSelectFloor }) {
  const floors = building?.floors || [];
  const nearbyDestinations = project?.nearbyDestinations || [];
  const facilities = (project?.projectFacilities || []).slice().sort((left, right) => {
    if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
      return (left.sortOrder || 0) - (right.sortOrder || 0);
    }

    return String(left.facility?.name || '').localeCompare(String(right.facility?.name || ''));
  });
  const floorUnits = selectedFloor?.units || [];
  const selectedFacilities = facilities.filter((assignment) => selectedFacilityIds.includes(assignment.id));
  const floorGallery = normalizeList(selectedFloor?.gallery || selectedFloor?.images || selectedFloor?.media);

  return (
    <aside className="public-sidebar panel">
      <div className="panel-head">
        <p className="eyebrow">Building options</p>
        <h3>Choose a floor and points of interest</h3>
        <p>Use the floor dropdown to view floor plans, gallery media, and the units on that level.</p>
      </div>

      <div className="public-sidebar__section">
        <h4>Floor selection</h4>
        <select value={selectedFloor?.id || ''} onChange={(e) => onSelectFloor(e.target.value)} disabled={!floors.length}>
          <option value="">{floors.length ? 'Select floor' : 'No floors available'}</option>
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.floorName ? `${floor.floorName} · ` : ''}Floor {floor.floorNumber}
            </option>
          ))}
        </select>
        <div className="public-sidebar__stats">
          <span className="tag">{floors.length} floors</span>
          <span className="tag">{floorUnits.length} units</span>
          <span className="tag">{selectedFloor?.status || building?.status || project.status}</span>
        </div>
      </div>

      <div className="public-sidebar__section">
        <h4>Selected floor</h4>
        <div className="public-sidebar__list">
          {selectedFloor ? (
            <article className="public-mini-card">
              <strong>
                {selectedFloor.floorName ? `${selectedFloor.floorName} · ` : ''}
                Floor {selectedFloor.floorNumber}
              </strong>
              <p>{joinNonEmpty([selectedFloor.status, selectedFloor.displayOrder !== null ? `Sort ${selectedFloor.displayOrder}` : ''])}</p>
              <small>{floorUnits.length} units on this floor</small>
            </article>
          ) : (
            <div className="empty-inline">Pick a floor to see its plan, gallery, and units.</div>
          )}
        </div>
      </div>

      <div className="public-sidebar__section">
        <h4>Floor plan and gallery</h4>
        <div className="public-sidebar__list">
          {selectedFloor ? (
            <>
              <article className="public-mini-card">
                <strong>Floor plan</strong>
                <p>{selectedFloor.floorPlan ? 'Available for preview' : 'No floor plan uploaded yet'}</p>
                {selectedFloor.floorPlan ? (
                  isImageSource(selectedFloor.floorPlan) ? (
                    <img className="public-floor-preview" src={selectedFloor.floorPlan} alt={`Floor ${selectedFloor.floorNumber} plan`} />
                  ) : (
                    <a className="ghost public-floor-link" href={selectedFloor.floorPlan} target="_blank" rel="noreferrer">
                      Open floor plan
                    </a>
                  )
                ) : null}
              </article>

              <article className="public-mini-card">
                <strong>Gallery views</strong>
                <p>{floorGallery.length ? `${floorGallery.length} media item(s)` : 'No gallery media uploaded yet'}</p>
                <div className="public-gallery-strip">
                  {floorGallery.slice(0, 4).map((item, index) =>
                    isImageSource(item) ? (
                      <img key={`${selectedFloor.id}-gallery-${index}`} className="public-gallery-strip__image" src={item} alt={`Floor ${selectedFloor.floorNumber} gallery ${index + 1}`} />
                    ) : (
                      <a key={`${selectedFloor.id}-gallery-${index}`} className="public-gallery-strip__link" href={item} target="_blank" rel="noreferrer">
                        Media {index + 1}
                      </a>
                    ),
                  )}
                </div>
              </article>
            </>
          ) : (
            <div className="empty-inline">Select a floor to reveal floor plan and gallery options.</div>
          )}
        </div>
      </div>

      <div className="public-sidebar__section">
        <details className="public-facility-picker">
          <summary>Points of Interest</summary>
          <p className="hint">Select one or more nearby places to show them on the map.</p>
          <div className="public-facility-picker__list">
            {facilities.length ? (
              facilities.map((assignment) => (
                <label key={assignment.id} className="public-facility-picker__item">
                  <input
                    type="checkbox"
                    checked={selectedFacilityIds.includes(assignment.id)}
                    onChange={() => onToggleFacility(assignment.id)}
                  />
                  <span>
                    <strong>{assignment.facility?.name}</strong>
                    <small>{joinNonEmpty([assignment.facility?.category, assignment.mode])}</small>
                  </span>
                </label>
              ))
            ) : (
              <div className="empty-inline">No points of interest assigned yet.</div>
            )}
          </div>
        </details>

        {selectedFacilities.length ? (
          <div className="public-sidebar__list">
            {selectedFacilities.map((assignment) => (
              <article className="public-mini-card" key={`selected-${assignment.id}`}>
                <strong>{assignment.facility?.name}</strong>
                <p>{joinNonEmpty([assignment.facility?.category, assignment.mode])}</p>
                <small>
                  {assignment.distanceKm} km | {assignment.travelMinutes} min
                </small>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-inline">Select points of interest to show their route cards.</div>
        )}

        {nearbyDestinations.length ? (
          <div className="public-sidebar__list">
            {nearbyDestinations.slice(0, 3).map((destination) => (
              <article className="public-mini-card" key={destination.id}>
                <strong>{destination.label}</strong>
                <p>{joinNonEmpty([destination.category, destination.mode])}</p>
                <small>
                  {destination.distanceKm} km | {destination.travelMinutes} min
                </small>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function MapActionBar({ project }) {
  const enquiryEmail = project?.developer?.email || 'sales@example.com';
  const phone = project?.developer?.phone;
  const bookingLabel = `Book ${project?.projectName || 'project'}`;

  return (
    <div className="public-map-actions" aria-label="Project actions">
      <a className="public-map-action" href={`mailto:${enquiryEmail}?subject=${encodeURIComponent(`${project?.projectName || 'Project'} enquiry`)}`}>
        <span className="public-map-action__icon">✉</span>
        <span>Contact</span>
      </a>
      <a className="public-map-action" href={`mailto:${enquiryEmail}?subject=${encodeURIComponent(`${project?.projectName || 'Project'} query`)}`}>
        <span className="public-map-action__icon">?</span>
        <span>Query</span>
      </a>
      <a className="public-map-action" href={phone ? `tel:${phone}` : `mailto:${enquiryEmail}?subject=${encodeURIComponent(bookingLabel)}`}>
        <span className="public-map-action__icon">✓</span>
        <span>Booking</span>
      </a>
    </div>
  );
}

export default function PublicProjectExplorerV2({
  projects,
  selectedProject,
  selectedProjectId,
  onSelectProject,
  query,
  onQueryChange,
  loading,
  mode,
  onModeChange,
  token,
  onLogout,
}) {
  const builders = useMemo(() => getUniqueBuilders(projects), [projects]);
  const [selectedBuilderId, setSelectedBuilderId] = useState('');
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedFacilityIds, setSelectedFacilityIds] = useState([]);
  const filteredProjects = selectedBuilderId
    ? projects.filter((project) => project.developerId === selectedBuilderId)
    : projects;
  const building = getSelectedBuilding(selectedProject, selectedBuildingId);
  const selectedFloor = getSelectedFloor(building, selectedFloorId);

  useEffect(() => {
    const nextBuilderId = selectedProject?.developerId || builders[0]?.id || '';
    if (!selectedBuilderId || !builders.some((builder) => builder.id === selectedBuilderId)) {
      setSelectedBuilderId(nextBuilderId);
    }
  }, [builders, selectedBuilderId, selectedProject]);

  useEffect(() => {
    const buildings = selectedProject?.buildings || [];
    const nextBuildingId = buildings[0]?.id || '';
    if (!selectedBuildingId || !buildings.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(nextBuildingId);
    }
  }, [selectedProject, selectedBuildingId]);

  useEffect(() => {
    const floors = building?.floors || [];
    const nextFloorId = floors[0]?.id || '';
    if (!selectedFloorId || !floors.some((floor) => floor.id === selectedFloorId)) {
      setSelectedFloorId(nextFloorId);
    }
  }, [building, selectedFloorId]);

  useEffect(() => {
    if (!selectedProject) {
      setSelectedFacilityIds([]);
      return;
    }

    const validFacilityIds = new Set((selectedProject.projectFacilities || []).map((assignment) => assignment.id));
    setSelectedFacilityIds((current) => current.filter((facilityId) => validFacilityIds.has(facilityId)));
  }, [selectedProject]);

  const { points: mapPoints, focusPoints: mapFocusPoints, routes: mapRoutes } = selectedProject
    ? buildMapPoints(selectedProject, building, selectedFacilityIds)
    : { points: [], focusPoints: [], routes: [] };

  function handleBuilderChange(nextBuilderId) {
    setSelectedBuilderId(nextBuilderId);
    const nextProject = (nextBuilderId ? projects.filter((project) => project.developerId === nextBuilderId) : projects)[0] || null;
    onSelectProject(nextProject?.id || '');
  }

  function handleProjectChange(nextProjectId) {
    onSelectProject(nextProjectId);
  }

  function handleFloorChange(nextFloorId) {
    setSelectedFloorId(nextFloorId);
  }

  function handleToggleFacility(facilityId) {
    setSelectedFacilityIds((current) =>
      current.includes(facilityId) ? current.filter((currentId) => currentId !== facilityId) : [...current, facilityId],
    );
  }

  const projectOptions = filteredProjects.length ? filteredProjects : projects;

  return (
    <div className="public-dashboard">
      <section className="panel public-toolbar">
        <div className="public-toolbar__head">
          <div className="panel-head">
            <p className="eyebrow">Explorer</p>
            <h2>Builder, project, building</h2>
          </div>
          <div className="topbar__modes" role="tablist" aria-label="Mode switch">
            <button type="button" className={mode === 'public' ? '' : 'ghost'} onClick={() => onModeChange('public')}>
              Public
            </button>
            <button type="button" className={mode === 'admin' ? '' : 'ghost'} onClick={() => onModeChange('admin')}>
              Admin
            </button>
            {token ? (
              <button type="button" className="ghost" onClick={onLogout}>
                Sign out
              </button>
            ) : null}
          </div>
        </div>

        <div className="public-toolbar__controls">
          <input
            placeholder="Search projects"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <select value={selectedBuilderId} onChange={(e) => handleBuilderChange(e.target.value)}>
            <option value="">Builder</option>
            {builders.map((builder) => (
              <option key={builder.id} value={builder.id}>
                {builder.companyName}
              </option>
            ))}
          </select>
          <select value={selectedProjectId} onChange={(e) => handleProjectChange(e.target.value)} disabled={!projectOptions.length}>
            <option value="">{loading ? 'Loading...' : 'Project'}</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.projectCode ? `${project.projectCode} · ` : ''}
                {project.projectName}
              </option>
            ))}
          </select>
          <select
            value={selectedBuildingId}
            onChange={(e) => setSelectedBuildingId(e.target.value)}
            disabled={!selectedProject?.buildings?.length}
          >
            <option value="">Building</option>
            {(selectedProject?.buildings || []).map((nextBuilding) => (
              <option key={nextBuilding.id} value={nextBuilding.id}>
                {nextBuilding.buildingName}
              </option>
            ))}
          </select>
        </div>
      </section>

      <div className="public-dashboard__body">
        {selectedProject ? (
          <BuildingSidebar
            project={selectedProject}
            building={building}
            selectedFloor={selectedFloor}
            selectedFacilityIds={selectedFacilityIds}
            onToggleFacility={handleToggleFacility}
            onSelectFloor={handleFloorChange}
          />
        ) : (
          <section className="panel public-sidebar panel">
            <div className="empty-state">
              <h3>{loading ? 'Loading projects...' : 'No project selected'}</h3>
              <p>{loading ? 'Please wait while the public project list loads.' : 'Pick a builder and project to start exploring.'}</p>
            </div>
          </section>
        )}

        <section className="panel public-map-shell">
          <div className="panel-head">
            <h3>Map</h3>
            <p>Project location and nearby POIs.</p>
          </div>

          <div className="public-map-shell__frame">
            <MapStoreStaticMap
              points={mapPoints}
              focusPoints={mapFocusPoints}
              routes={mapRoutes}
            />
          </div>

          {selectedProject ? <MapLegend points={mapPoints} /> : null}
          {selectedProject ? <MapActionBar project={selectedProject} /> : null}
        </section>
      </div>
    </div>
  );
}
