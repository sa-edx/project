import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  assignFacilityToProject,
  createBuilding,
  createDeveloper,
  createFacility,
  createFloor,
  createNearbyDestination,
  createProject,
  createUnit,
  deleteBuilding,
  deleteFacility,
  deleteFloor,
  deleteNearbyDestination,
  deleteProjectFacility,
  deleteUnit,
  getMe,
  getPublicProject,
  listDevelopers,
  listFacilities,
  listProjects,
  listPublicProjects,
  login,
  updateBuilding,
  updateFacility,
  updateFloor,
  updateNearbyDestination,
  updateProject,
  updateProjectFacility,
  updateUnit,
} from './api.js';
import FacilityManagerV2 from './components/FacilityManagerV2.jsx';
import MapStoreStaticMap from './components/MapStoreStaticMap.jsx';
import ProjectAdminEditorV2 from './components/ProjectAdminEditorV2.jsx';
import PublicProjectExplorerV2 from './components/PublicProjectExplorerV2.jsx';
import StructureManagerV2 from './components/StructureManagerV2.jsx';

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractItems(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' · ');
}

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
      return trimmed.split(/\n+/).map((item) => item.trim()).filter(Boolean);
    }

    return [trimmed];
  }

  return [];
}

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
}

function getFullscreenBuilding(project, selectedBuildingId) {
  const buildings = project?.buildings || [];
  return buildings.find((building) => building.id === selectedBuildingId) || buildings[0] || null;
}

function getFullscreenFloor(building, selectedFloorId) {
  const floors = building?.floors || [];
  return floors.find((floor) => floor.id === selectedFloorId) || floors[0] || null;
}

function buildFullscreenMapData(project, building, selectedFacilityIds = []) {
  const points = [];
  const focusPoints = [];
  const routes = [];
  const latitude = parseCoordinate(project?.latitude);
  const longitude = parseCoordinate(project?.longitude);
  let projectPoint = null;

  if (latitude !== null && longitude !== null) {
    projectPoint = {
      id: `project-${project.id}`,
      label: building?.buildingName || project.projectName || 'Project',
      kind: 'project',
      latitude,
      longitude,
    };
    points.push(projectPoint);
    focusPoints.push(projectPoint);
  }

  const facilities = Array.isArray(selectedFacilityIds) && selectedFacilityIds.length
    ? (project?.projectFacilities || []).filter((assignment) => selectedFacilityIds.includes(assignment.id))
    : [];

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
    focusPoints.push(facilityPoint);

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

function PublicFullscreenSidebar({
  project,
  building,
  selectedFloor,
  selectedFacilityIds,
  onSelectBuilding,
  onSelectFloor,
  onToggleFacility,
  isOpen,
  onClose,
}) {
  const floors = building?.floors || [];
  const facilities = (project?.projectFacilities || []).slice().sort((left, right) => {
    if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
      return (left.sortOrder || 0) - (right.sortOrder || 0);
    }

    return String(left.facility?.name || '').localeCompare(String(right.facility?.name || ''));
  });
  const selectedFacilities = facilities.filter((assignment) => selectedFacilityIds.includes(assignment.id));
  const floorMedia = normalizeList(selectedFloor?.gallery || selectedFloor?.images || selectedFloor?.media);
  const buildings = project?.buildings || [];

  return (
    <aside className={`public-fullscreen-map-page__sidebar panel ${isOpen ? 'is-open' : 'is-closed'}`}>
      <div className="public-fullscreen-map-page__sidebar-head">
        <div className="panel-head panel-head--compact">
          <p className="eyebrow">Project view</p>
          <h3>{project?.projectName || 'Selected project'}</h3>
          <p>{joinNonEmpty([project?.projectCode, project?.projectType, project?.city])}</p>
        </div>
        <button type="button" className="public-fullscreen-map-page__drawer-close" onClick={onClose} aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="public-sidebar__section">
        <h4>Building</h4>
        <select value={building?.id || ''} onChange={(event) => onSelectBuilding(event.target.value)} disabled={!buildings.length}>
          <option value="">{buildings.length ? 'Select building' : 'No buildings available'}</option>
          {buildings.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {joinNonEmpty([entry.buildingCode, entry.buildingName]) || entry.buildingName}
            </option>
          ))}
        </select>
        <div className="public-sidebar__stats">
          <span className="tag">{buildings.length} buildings</span>
          <span className="tag">{floors.length} floors</span>
        </div>
      </div>

      <div className="public-sidebar__section">
        <h4>Floor selection</h4>
        <select value={selectedFloor?.id || ''} onChange={(event) => onSelectFloor(event.target.value)} disabled={!floors.length}>
          <option value="">{floors.length ? 'Select floor' : 'No floors available'}</option>
          {floors.map((floor) => (
            <option key={floor.id} value={floor.id}>
              {floor.floorName ? `${floor.floorName} · ` : ''}Floor {floor.floorNumber}
            </option>
          ))}
        </select>
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
                <p>{floorMedia.length ? `${floorMedia.length} media item(s)` : 'No gallery media uploaded yet'}</p>
                <div className="public-gallery-strip">
                  {floorMedia.slice(0, 4).map((item, index) =>
                    isImageSource(item) ? (
                      <img
                        key={`${selectedFloor.id}-gallery-${index}`}
                        className="public-gallery-strip__image"
                        src={item}
                        alt={`Floor ${selectedFloor.floorNumber} gallery ${index + 1}`}
                      />
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
        <details className="public-facility-picker" open>
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
      </div>
    </aside>
  );
}

const emptyDeveloperForm = {
  companyName: '',
  country: '',
  city: '',
  email: '',
  phone: '',
};

const emptyProjectForm = {
  developerId: '',
  projectCode: '',
  projectName: '',
  projectType: 'Residential',
  country: '',
  city: '',
  address: '',
  startingPrice: '',
  latitude: '',
  longitude: '',
};

const emptyBuildingForm = {
  buildingCode: '',
  buildingName: '',
  buildingType: 'Tower',
  status: 'active',
};

const emptyFloorForm = {
  floorNumber: '',
  floorName: '',
  floorPlan: '',
  displayOrder: '0',
  status: 'active',
};

const emptyUnitForm = {
  unitNumber: '',
  unitCode: '',
  unitType: 'Apartment',
  bedrooms: '0',
  bathrooms: '0',
  area: '',
  basePrice: '',
  currency: 'AED',
  status: 'available',
  featured: false,
  viewType: '',
  media: '',
  amenities: [],
};

export default function App() {
  const [mode, setMode] = useState('public');
  const [publicView, setPublicView] = useState('home');
  const [token, setToken] = useState(() => window.localStorage.getItem('portal_token') || '');
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [publicProjects, setPublicProjects] = useState([]);
  const [publicQuery, setPublicQuery] = useState('');
  const [selectedPublicProjectId, setSelectedPublicProjectId] = useState('');
  const [publicProjectDetail, setPublicProjectDetail] = useState(null);
  const [publicFullscreenDrawerOpen, setPublicFullscreenDrawerOpen] = useState(false);
  const publicProjectSelectionRef = useRef(false);

  const [developers, setDevelopers] = useState([]);
  const [adminProjects, setAdminProjects] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [selectedAdminProjectId, setSelectedAdminProjectId] = useState('');

  const [loginForm, setLoginForm] = useState({
    email: 'admin@example.com',
    password: 'Admin1234!',
  });
  const [developerForm, setDeveloperForm] = useState(emptyDeveloperForm);
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [buildingForm, setBuildingForm] = useState(emptyBuildingForm);
  const [floorForm, setFloorForm] = useState(emptyFloorForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const selectedAdminProject = useMemo(
    () => adminProjects.find((project) => project.id === selectedAdminProjectId) || adminProjects[0] || null,
    [adminProjects, selectedAdminProjectId],
  );

  const selectedPublicProject = useMemo(
    () => publicProjectDetail || publicProjects.find((project) => project.id === selectedPublicProjectId) || null,
    [publicProjectDetail, publicProjects, selectedPublicProjectId],
  );

  const [publicFullscreenSelectedBuildingId, setPublicFullscreenSelectedBuildingId] = useState('');
  const [publicFullscreenSelectedFloorId, setPublicFullscreenSelectedFloorId] = useState('');
  const [publicFullscreenSelectedFacilityIds, setPublicFullscreenSelectedFacilityIds] = useState([]);

  const selectedBuilding = useMemo(() => {
    const buildings = selectedAdminProject?.buildings || [];
    return buildings.find((building) => building.id === selectedBuildingId) || buildings[0] || null;
  }, [selectedAdminProject, selectedBuildingId]);

  const selectedFloor = useMemo(() => {
    const floors = selectedBuilding?.floors || [];
    return floors.find((floor) => floor.id === selectedFloorId) || floors[0] || null;
  }, [selectedBuilding, selectedFloorId]);

  const publicFullscreenSelectedBuilding = useMemo(
    () => getFullscreenBuilding(selectedPublicProject, publicFullscreenSelectedBuildingId),
    [selectedPublicProject, publicFullscreenSelectedBuildingId],
  );

  const publicFullscreenSelectedFloor = useMemo(
    () => getFullscreenFloor(publicFullscreenSelectedBuilding, publicFullscreenSelectedFloorId),
    [publicFullscreenSelectedBuilding, publicFullscreenSelectedFloorId],
  );

  const fullscreenMapData = useMemo(
    () => (publicView === 'project' ? buildFullscreenMapData(selectedPublicProject, publicFullscreenSelectedBuilding, publicFullscreenSelectedFacilityIds) : null),
    [publicView, selectedPublicProject, publicFullscreenSelectedBuilding, publicFullscreenSelectedFacilityIds],
  );

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('portal_token', token);
    }
  }, [token]);

  useEffect(() => {
    let active = true;

    async function loadPublicProjects() {
      try {
        const response = await listPublicProjects();
        if (!active) {
          return;
        }

        setPublicProjects(extractItems(response));
      } catch (requestError) {
        if (!active) {
          return;
        }
        setError(requestError?.message || 'Failed to load public projects.');
      }
    }

    loadPublicProjects();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (mode !== 'public') {
      setPublicView('home');
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'public') {
      return;
    }
  }, [mode, publicProjects, selectedPublicProjectId]);

  useEffect(() => {
    if (mode === 'public' && publicProjectSelectionRef.current && selectedPublicProjectId) {
      setPublicView('project');
    }
  }, [mode, selectedPublicProjectId]);

  useEffect(() => {
    if (mode !== 'public' || publicView !== 'project' || !selectedPublicProjectId) {
      setPublicProjectDetail(null);
      return;
    }

    let active = true;

    async function loadPublicProjectDetail() {
      try {
        const response = await getPublicProject(selectedPublicProjectId);
        if (!active) {
          return;
        }

        setPublicProjectDetail(response?.data || response || null);
      } catch (requestError) {
        if (!active) {
          return;
        }
        setError(requestError?.message || 'Failed to load project details.');
      }
    }

    loadPublicProjectDetail();
    return () => {
      active = false;
    };
  }, [mode, publicView, selectedPublicProjectId]);

  useEffect(() => {
    if (mode !== 'public' || publicView !== 'project') {
      return;
    }

    const buildings = selectedPublicProject?.buildings || [];
    const nextBuildingId = buildings[0]?.id || '';
    if (!publicFullscreenSelectedBuildingId || !buildings.some((building) => building.id === publicFullscreenSelectedBuildingId)) {
      setPublicFullscreenSelectedBuildingId(nextBuildingId);
    }
  }, [mode, publicView, selectedPublicProject, publicFullscreenSelectedBuildingId]);

  useEffect(() => {
    if (mode !== 'public' || publicView !== 'project') {
      return;
    }

    const floors = publicFullscreenSelectedBuilding?.floors || [];
    const nextFloorId = floors[0]?.id || '';
    if (!publicFullscreenSelectedFloorId || !floors.some((floor) => floor.id === publicFullscreenSelectedFloorId)) {
      setPublicFullscreenSelectedFloorId(nextFloorId);
    }
  }, [mode, publicView, publicFullscreenSelectedBuilding, publicFullscreenSelectedFloorId]);

  useEffect(() => {
    if (mode !== 'public' || publicView !== 'project') {
      setPublicFullscreenSelectedFacilityIds([]);
      return;
    }

    const validFacilityIds = new Set((selectedPublicProject?.projectFacilities || []).map((assignment) => assignment.id));
    setPublicFullscreenSelectedFacilityIds((current) => current.filter((facilityId) => validFacilityIds.has(facilityId)));
  }, [mode, publicView, selectedPublicProject]);

  useEffect(() => {
    if (!token || mode !== 'admin') {
      return;
    }

    let active = true;

    async function loadAdminData() {
      setBusy(true);
      setError('');

      try {
        const [meResponse, developerResponse, projectResponse, facilityResponse] = await Promise.all([
          getMe(token),
          listDevelopers(token),
          listProjects(token),
          listFacilities(token),
        ]);

        if (!active) {
          return;
        }

        setUser(meResponse?.user || null);
        setDevelopers(extractItems(developerResponse));
        const projects = extractItems(projectResponse);
        setAdminProjects(projects);
        setFacilities(extractItems(facilityResponse));

        if (!selectedAdminProjectId && projects.length) {
          setSelectedAdminProjectId(projects[0].id);
        }
      } catch (requestError) {
        if (!active) {
          return;
        }
        if (requestError?.status === 401) {
          setToken('');
          setUser(null);
          setMode('public');
        }
        setError(requestError?.message || 'Failed to load admin data.');
      } finally {
        if (active) {
          setBusy(false);
        }
      }
    }

    loadAdminData();
    return () => {
      active = false;
    };
  }, [mode, token, selectedAdminProjectId]);

  useEffect(() => {
    const buildings = selectedAdminProject?.buildings || [];
    if (!buildings.length) {
      setSelectedBuildingId('');
      setSelectedFloorId('');
      setSelectedUnitId('');
      return;
    }

    if (!selectedBuildingId || !buildings.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(buildings[0].id);
    }
  }, [selectedAdminProject, selectedBuildingId]);

  useEffect(() => {
    const floors = selectedBuilding?.floors || [];
    if (!floors.length) {
      setSelectedFloorId('');
      setSelectedUnitId('');
      return;
    }

    if (!selectedFloorId || !floors.some((floor) => floor.id === selectedFloorId)) {
      setSelectedFloorId(floors[0].id);
    }
  }, [selectedBuilding, selectedFloorId]);

  useEffect(() => {
    const units = selectedFloor?.units || [];
    if (!units.length) {
      setSelectedUnitId('');
      return;
    }

    if (!selectedUnitId || !units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId(units[0].id);
    }
  }, [selectedFloor, selectedUnitId]);

  async function refreshAdminData(nextProjectId = selectedAdminProjectId) {
    if (!token) {
      return;
    }

    const [developerResponse, projectResponse, facilityResponse] = await Promise.all([
      listDevelopers(token),
      listProjects(token),
      listFacilities(token),
    ]);

    const projects = extractItems(projectResponse);
    setDevelopers(extractItems(developerResponse));
    setAdminProjects(projects);
    setFacilities(extractItems(facilityResponse));

    if (nextProjectId && projects.some((project) => project.id === nextProjectId)) {
      setSelectedAdminProjectId(nextProjectId);
    } else if (projects.length) {
      setSelectedAdminProjectId(projects[0].id);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const response = await login(loginForm.email, loginForm.password);
      setToken(response.accessToken || response.token || '');
      setUser(response.user || null);
      setMode('admin');
      setMessage('Signed in successfully.');
    } catch (requestError) {
      setError(requestError?.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setMode('public');
    setPublicView('home');
    publicProjectSelectionRef.current = false;
  }

  function handleSelectPublicProject(projectId) {
    setSelectedPublicProjectId(projectId);
    publicProjectSelectionRef.current = true;
    setPublicView('project');
    setPublicFullscreenDrawerOpen(false);
    setMode('public');
  }

  function handleReturnHome() {
    publicProjectSelectionRef.current = false;
    setPublicView('home');
    setPublicFullscreenDrawerOpen(false);
    setSelectedPublicProjectId('');
    setPublicProjectDetail(null);
    setPublicFullscreenSelectedBuildingId('');
    setPublicFullscreenSelectedFloorId('');
    setPublicFullscreenSelectedFacilityIds([]);
  }

  function handlePublicFullscreenBuildingChange(buildingId) {
    setPublicFullscreenSelectedBuildingId(buildingId);
    const building = (selectedPublicProject?.buildings || []).find((entry) => entry.id === buildingId);
    setPublicFullscreenSelectedFloorId(building?.floors?.[0]?.id || '');
  }

  function handlePublicFullscreenFloorChange(floorId) {
    setPublicFullscreenSelectedFloorId(floorId);
  }

  function handlePublicFullscreenToggleFacility(facilityId) {
    setPublicFullscreenSelectedFacilityIds((current) =>
      current.includes(facilityId) ? current.filter((currentId) => currentId !== facilityId) : [...current, facilityId],
    );
  }

  function handleTogglePublicFullscreenDrawer() {
    setPublicFullscreenDrawerOpen((current) => !current);
  }

  async function handleCreateDeveloper(payload) {
    setBusy(true);
    setError('');
    try {
      await createDeveloper(token, payload);
      await refreshAdminData();
      setDeveloperForm(emptyDeveloperForm);
      setMessage('Developer created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create developer.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateProject() {
    if (!token) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      const payload = {
        developerId: projectForm.developerId || undefined,
        projectCode: projectForm.projectCode,
        projectName: projectForm.projectName,
        projectType: projectForm.projectType,
        country: projectForm.country,
        city: projectForm.city,
        address: projectForm.address,
        latitude: projectForm.latitude === '' ? null : Number(projectForm.latitude),
        longitude: projectForm.longitude === '' ? null : Number(projectForm.longitude),
        startingPrice: projectForm.startingPrice === '' ? null : Number(projectForm.startingPrice),
      };

      await createProject(token, payload);
      await refreshAdminData();
      setProjectForm(emptyProjectForm);
      setMessage('Project created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveProject(projectId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateProject(token, projectId, payload);
      await refreshAdminData(projectId);
      setMessage('Project saved.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to save project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFacility(payload) {
    setBusy(true);
    setError('');
    try {
      await createFacility(token, payload);
      await refreshAdminData();
      setMessage('Facility created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFacility(facilityId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateFacility(token, facilityId, payload);
      await refreshAdminData();
      setMessage('Facility saved.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to save facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFacility(facilityId) {
    setBusy(true);
    setError('');
    try {
      await deleteFacility(token, facilityId);
      await refreshAdminData();
      setMessage('Facility deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignFacilityToProject(payload) {
    if (!selectedAdminProjectId) {
      setError('Select a project first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await assignFacilityToProject(token, selectedAdminProjectId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Facility assigned.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to assign facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateProjectFacility(assignmentId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateProjectFacility(token, assignmentId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Project facility updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update project facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProjectFacility(assignmentId) {
    setBusy(true);
    setError('');
    try {
      await deleteProjectFacility(token, assignmentId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Project facility removed.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to remove project facility.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBuilding() {
    if (!selectedAdminProjectId) {
      setError('Select a project first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createBuilding(token, selectedAdminProjectId, buildingForm);
      await refreshAdminData(selectedAdminProjectId);
      setBuildingForm(emptyBuildingForm);
      setMessage('Building created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create building.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateBuilding(buildingId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateBuilding(token, buildingId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Building updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update building.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBuilding(buildingId) {
    setBusy(true);
    setError('');
    try {
      await deleteBuilding(token, buildingId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Building deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete building.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateFloor() {
    if (!selectedBuildingId) {
      setError('Select a building first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createFloor(token, selectedBuildingId, floorForm);
      await refreshAdminData(selectedAdminProjectId);
      setFloorForm(emptyFloorForm);
      setMessage('Floor created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create floor.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateFloor(floorId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateFloor(token, floorId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Floor updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update floor.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteFloor(floorId) {
    setBusy(true);
    setError('');
    try {
      await deleteFloor(token, floorId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Floor deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete floor.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateUnit() {
    if (!selectedFloorId) {
      setError('Select a floor first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createUnit(token, selectedFloorId, {
        unitNumber: unitForm.unitNumber,
        unitCode: unitForm.unitCode,
        unitType: unitForm.unitType,
        bedrooms: Number(unitForm.bedrooms || 0),
        bathrooms: Number(unitForm.bathrooms || 0),
        area: unitForm.area === '' ? null : Number(unitForm.area),
        basePrice: unitForm.basePrice === '' ? null : Number(unitForm.basePrice),
        currency: unitForm.currency,
        status: unitForm.status,
        featured: Boolean(unitForm.featured),
        viewType: unitForm.viewType || null,
        media: String(unitForm.media || '')
          .split(/\n+/)
          .map((value) => value.trim())
          .filter(Boolean),
        amenities: unitForm.amenities,
      });
      await refreshAdminData(selectedAdminProjectId);
      setUnitForm(emptyUnitForm);
      setMessage('Unit created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create unit.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateUnit(unitId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateUnit(token, unitId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Unit updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update unit.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteUnit(unitId) {
    setBusy(true);
    setError('');
    try {
      await deleteUnit(token, unitId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Unit deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete unit.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateNearbyDestination(payload) {
    if (!selectedAdminProjectId) {
      setError('Select a project first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createNearbyDestination(token, selectedAdminProjectId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('POI created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create POI.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateNearbyDestination(destinationId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateNearbyDestination(token, destinationId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('POI updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update POI.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteNearbyDestination(destinationId) {
    setBusy(true);
    setError('');
    try {
      await deleteNearbyDestination(token, destinationId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('POI deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete POI.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectAdminProject(projectId) {
    setSelectedAdminProjectId(projectId);
    const project = adminProjects.find((entry) => entry.id === projectId);
    setSelectedBuildingId(project?.buildings?.[0]?.id || '');
    setSelectedFloorId(project?.buildings?.[0]?.floors?.[0]?.id || '');
    setSelectedUnitId(project?.buildings?.[0]?.floors?.[0]?.units?.[0]?.id || '');
  }

  if (mode === 'public' && publicView === 'project' && selectedPublicProject) {
    return (
      <div className="public-fullscreen-map-page">
        <button type="button" className="public-fullscreen-map-page__home" onClick={handleReturnHome} aria-label="Home">
          <span aria-hidden="true">&#8962;</span>
          <span>Home</span>
        </button>
        <button
          type="button"
          className={`public-fullscreen-map-page__burger ${publicFullscreenDrawerOpen ? 'is-open' : ''}`}
          onClick={handleTogglePublicFullscreenDrawer}
          aria-label={publicFullscreenDrawerOpen ? 'Close project panel' : 'Open project panel'}
          aria-expanded={publicFullscreenDrawerOpen}
        >
          <span aria-hidden="true">{publicFullscreenDrawerOpen ? '\u2715' : '\u2630'}</span>
        </button>
        <PublicFullscreenSidebar
          project={selectedPublicProject}
          building={publicFullscreenSelectedBuilding}
          selectedFloor={publicFullscreenSelectedFloor}
          selectedFacilityIds={publicFullscreenSelectedFacilityIds}
          onSelectBuilding={handlePublicFullscreenBuildingChange}
          onSelectFloor={handlePublicFullscreenFloorChange}
          onToggleFacility={handlePublicFullscreenToggleFacility}
          isOpen={publicFullscreenDrawerOpen}
          onClose={() => setPublicFullscreenDrawerOpen(false)}
        />
        <div className="public-fullscreen-map-page__map">
          <MapStoreStaticMap
            className="location-map__map location-map__map--interactive"
            points={fullscreenMapData?.points || []}
            focusPoints={fullscreenMapData?.focusPoints || []}
            routes={fullscreenMapData?.routes || []}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="panel app-header">
        <div>
          <p className="eyebrow">MapStore Portal</p>
          <h1>Public and admin explorer</h1>
        </div>
        <div className="topbar__modes" role="tablist" aria-label="Mode switch">
          <button type="button" className={mode === 'public' ? '' : 'ghost'} onClick={() => setMode('public')}>
            Home
          </button>
          <button type="button" className={mode === 'admin' ? '' : 'ghost'} onClick={() => setMode('admin')}>
            Admin
          </button>
          {token ? (
            <button type="button" className="ghost" onClick={handleLogout}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      {mode === 'public' ? (
        <main className="app-grid public-grid">
          <PublicProjectExplorerV2
            projects={publicProjects}
            selectedProject={selectedPublicProject}
            selectedProjectId={selectedPublicProjectId}
            onSelectProject={handleSelectPublicProject}
            query={publicQuery}
            onQueryChange={setPublicQuery}
            loading={!publicProjects.length}
            mode={mode}
          />
        </main>
      ) : !token ? (
        <main className="app-grid auth-grid">
          <section className="panel hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Admin access</p>
              <h2>Sign in to manage developers, projects, buildings, floors, and units.</h2>
              <p className="lead">Use the seeded admin account to start wiring the inventory data.</p>
            </div>

            <form className="panel auth-panel" onSubmit={handleLogin}>
              <h3>Admin login</h3>
              <input
                type="email"
                placeholder="Email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((current) => ({ ...current, email: e.target.value }))}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={loginForm.password}
                onChange={(e) => setLoginForm((current) => ({ ...current, password: e.target.value }))}
                required
              />
              <button type="submit" disabled={busy}>
                {busy ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </section>
        </main>
      ) : (
        <main className="app-grid admin-grid">
          <section className="panel admin-sidebar">
            <div className="panel-head">
              <p className="eyebrow">Admin tools</p>
              <h2>Builders and projects</h2>
            </div>

            <div className="stack">
              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCreateDeveloper({
                    companyName: developerForm.companyName,
                    country: developerForm.country || null,
                    city: developerForm.city || null,
                    email: developerForm.email || null,
                    phone: developerForm.phone || null,
                  });
                }}
              >
                <h3>New developer</h3>
                <input
                  placeholder="Company name"
                  value={developerForm.companyName}
                  onChange={(e) => setDeveloperForm((current) => ({ ...current, companyName: e.target.value }))}
                  required
                />
                <div className="split">
                  <input
                    placeholder="Country"
                    value={developerForm.country}
                    onChange={(e) => setDeveloperForm((current) => ({ ...current, country: e.target.value }))}
                  />
                  <input
                    placeholder="City"
                    value={developerForm.city}
                    onChange={(e) => setDeveloperForm((current) => ({ ...current, city: e.target.value }))}
                  />
                </div>
                <div className="split">
                  <input
                    placeholder="Email"
                    value={developerForm.email}
                    onChange={(e) => setDeveloperForm((current) => ({ ...current, email: e.target.value }))}
                  />
                  <input
                    placeholder="Phone"
                    value={developerForm.phone}
                    onChange={(e) => setDeveloperForm((current) => ({ ...current, phone: e.target.value }))}
                  />
                </div>
                <button type="submit" disabled={busy}>
                  Add developer
                </button>
              </form>

              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCreateProject();
                }}
              >
                <h3>New project</h3>
                <select
                  value={projectForm.developerId}
                  onChange={(e) => setProjectForm((current) => ({ ...current, developerId: e.target.value }))}
                >
                  <option value="">Select developer</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.companyName}
                    </option>
                  ))}
                </select>
                <div className="split">
                  <input
                    placeholder="Project code"
                    value={projectForm.projectCode}
                    onChange={(e) => setProjectForm((current) => ({ ...current, projectCode: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Project name"
                    value={projectForm.projectName}
                    onChange={(e) => setProjectForm((current) => ({ ...current, projectName: e.target.value }))}
                    required
                  />
                </div>
                <div className="split">
                  <input
                    placeholder="Country"
                    value={projectForm.country}
                    onChange={(e) => setProjectForm((current) => ({ ...current, country: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="City"
                    value={projectForm.city}
                    onChange={(e) => setProjectForm((current) => ({ ...current, city: e.target.value }))}
                    required
                  />
                </div>
                <input
                  placeholder="Address"
                  value={projectForm.address}
                  onChange={(e) => setProjectForm((current) => ({ ...current, address: e.target.value }))}
                  required
                />
                <div className="split">
                  <input
                    placeholder="Latitude"
                    value={projectForm.latitude}
                    onChange={(e) => setProjectForm((current) => ({ ...current, latitude: e.target.value }))}
                  />
                  <input
                    placeholder="Longitude"
                    value={projectForm.longitude}
                    onChange={(e) => setProjectForm((current) => ({ ...current, longitude: e.target.value }))}
                  />
                </div>
                <div className="split">
                  <input
                    placeholder="Starting price"
                    value={projectForm.startingPrice}
                    onChange={(e) => setProjectForm((current) => ({ ...current, startingPrice: e.target.value }))}
                  />
                  <input
                    placeholder="Project type"
                    value={projectForm.projectType}
                    onChange={(e) => setProjectForm((current) => ({ ...current, projectType: e.target.value }))}
                  />
                </div>
                <button type="submit" disabled={busy}>
                  Add project
                </button>
              </form>

              <div className="panel nested-panel">
                <div className="panel-head panel-head--compact">
                  <h3>Project list</h3>
                  <p>Select one project to edit its structure and facilities.</p>
                </div>
                <select value={selectedAdminProjectId} onChange={(e) => handleSelectAdminProject(e.target.value)}>
                  <option value="">Select project</option>
                  {adminProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.projectCode ? `${project.projectCode} - ` : ''}
                      {project.projectName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section className="panel admin-main">
            <div className="feedback-stack">
              {error ? <div className="feedback error">{error}</div> : null}
              {message ? <div className="feedback success">{message}</div> : null}
            </div>

            <ProjectAdminEditorV2
              project={selectedAdminProject}
              developers={developers}
              token={token}
              onSave={handleSaveProject}
              busy={busy}
              onDeveloperChange={(nextDeveloperId) => {
                setProjectForm((current) => ({ ...current, developerId: nextDeveloperId }));
              }}
            />

            <FacilityManagerV2
              project={selectedAdminProject}
              facilities={facilities}
              busy={busy}
              onCreateFacility={handleCreateFacility}
              onUpdateFacility={handleUpdateFacility}
              onDeleteFacility={handleDeleteFacility}
              onAssignFacilityToProject={handleAssignFacilityToProject}
              onDeleteProjectFacility={handleDeleteProjectFacility}
            />

            <StructureManagerV2
              project={selectedAdminProject}
              selectedBuildingId={selectedBuildingId}
              setSelectedBuildingId={setSelectedBuildingId}
              selectedFloorId={selectedFloorId}
              setSelectedFloorId={setSelectedFloorId}
              selectedUnitId={selectedUnitId}
              setSelectedUnitId={setSelectedUnitId}
              buildingForm={buildingForm}
              setBuildingForm={setBuildingForm}
              floorForm={floorForm}
              setFloorForm={setFloorForm}
              unitForm={unitForm}
              setUnitForm={setUnitForm}
              onCreateBuilding={handleCreateBuilding}
              onUpdateBuilding={handleUpdateBuilding}
              onCreateFloor={handleCreateFloor}
              onUpdateFloor={handleUpdateFloor}
              onCreateUnit={handleCreateUnit}
              onUpdateUnit={handleUpdateUnit}
              onDeleteBuilding={handleDeleteBuilding}
              onDeleteFloor={handleDeleteFloor}
              onDeleteUnit={handleDeleteUnit}
              onCreateNearbyDestination={handleCreateNearbyDestination}
              onUpdateNearbyDestination={handleUpdateNearbyDestination}
              onDeleteNearbyDestination={handleDeleteNearbyDestination}
              busy={busy}
            />
          </section>
        </main>
      )}
    </div>
  );
}
