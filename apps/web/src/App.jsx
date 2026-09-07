import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  assignAmenityToProject,
  assignFacilityToProject,
  createBuilding,
  createDeveloper,
  createAmenity,
  createFacility,
  createFloor,
  createNearbyDestination,
  createProject,
  deleteDeveloper,
  getProject,
  createUnit,
  deleteBuilding,
  deleteAmenity,
  deleteFacility,
  deleteFloor,
  deleteNearbyDestination,
  deleteProjectFacility,
  deleteProjectAmenity,
  deleteProject,
  deleteUnit,
  getMe,
  getPublicProject,
  listAmenities,
  listDevelopers,
  listFacilities,
  listProjects,
  listPublicProjects,
  listUsers,
  login,
  createUser,
  resetUserPassword,
  updateBuilding,
  updateAmenity,
  updateFacility,
  updateFloor,
  updateNearbyDestination,
  updateProject,
  updateProjectPlacement,
  updateProjectFacility,
  updateProjectAmenity,
  updateUnit,
} from './api.js';
import AmenityManagerV2 from './components/AmenityManagerV2.jsx';
import FacilityManagerV2 from './components/FacilityManagerV2.jsx';
import CesiumProjectMap from './components/CesiumProjectMap.jsx';
import { getProjectMapImage } from './mapBuildingMarker.js';
import { getProjectModelUrl } from './mediaUrl.js';
import ProjectAdminEditorV2 from './components/ProjectAdminEditorV2.jsx';
import PublicProjectLearnMoreV2 from './components/PublicProjectLearnMoreV2.jsx';
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
  return floors.find((floor) => floor.id === selectedFloorId) || null;
}

function getFullscreenAmenity(project, selectedAmenityId) {
  const amenities = project?.projectAmenities || [];
  return amenities.find((assignment) => assignment.id === selectedAmenityId) || null;
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
      image: getProjectMapImage(project),
      modelUrl: getProjectModelUrl(project),
      modelHeading: Number(project?.model3dHeading),
      modelScale: Number(project?.model3dScale),
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
  selectedFacilityIds,
  selectedAmenityId,
  onSelectBuilding,
  onToggleFacility,
  onSelectAmenity,
  onOpenProjectDetail,
  onOpenFloorPlan,
  openSection,
  onToggleSection,
  isOpen,
  onClose,
}) {
  const floors = building?.floors || [];
  const amenities = (project?.projectAmenities || []).slice().sort((left, right) => {
    if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
      return (left.sortOrder || 0) - (right.sortOrder || 0);
    }

    return String(left.amenity?.name || '').localeCompare(String(right.amenity?.name || ''));
  });
  const selectedAmenity = amenities.find((assignment) => assignment.id === selectedAmenityId) || null;
  const selectedFacilities = (project?.projectFacilities || []).filter((assignment) => selectedFacilityIds.includes(assignment.id));
  const buildings = project?.buildings || [];

  const handleSectionHeaderClick = (section) => {
    onToggleSection?.(section, openSection === section ? false : true);
  };

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
        <button type="button" className="ghost public-sidebar__primary-action" onClick={() => onOpenProjectDetail?.(project?.id)}>
          Floors/Gallery
        </button>
      </div>

      <div className="public-sidebar__section">
        <button type="button" className="ghost public-sidebar__primary-action" onClick={() => handleSectionHeaderClick('amenities')}>
          Amenities
        </button>
        {openSection === 'amenities' ? (
          <div className="public-sidebar__section-body">
            <p className="hint">Choose an amenity to preview its image on the map.</p>
            <div className="public-sidebar__list">
              <select value={selectedAmenityId || ''} onChange={(event) => onSelectAmenity(event.target.value)} disabled={!amenities.length}>
                <option value="">{amenities.length ? 'Select amenity' : 'No amenities available'}</option>
                {amenities.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.amenity?.name}
                  </option>
                ))}
              </select>
              <div className="public-amenity-picker__list">
                {selectedAmenity ? (
                  <article className="public-mini-card">
                    {selectedAmenity.amenity?.image ? (
                      <img
                        className="public-amenity-picker__thumb public-amenity-picker__thumb--large"
                        src={selectedAmenity.amenity.image}
                        alt={selectedAmenity.amenity?.name || 'Amenity'}
                      />
                    ) : (
                      <div className="public-amenity-picker__thumb public-amenity-picker__thumb--empty">No image</div>
                    )}
                    <strong>{selectedAmenity.amenity?.name}</strong>
                    <small>{joinNonEmpty([selectedAmenity.amenity?.category, selectedAmenity.notes])}</small>
                  </article>
                ) : (
                  <div className="empty-inline">No amenity selected.</div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="public-sidebar__section">
        <button type="button" className="ghost public-sidebar__primary-action" onClick={() => handleSectionHeaderClick('poi')}>
          Points of Interest
        </button>
        {openSection === 'poi' ? (
          <div className="public-sidebar__section-body">
            <p className="hint">Select one or more nearby places to show them on the map.</p>
            <div className="public-facility-picker__list">
              {project?.projectFacilities?.length ? (
                project.projectFacilities.map((assignment) => (
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
        ) : null}
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

const emptyUserForm = {
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  role: 'buyer',
};

const userRoleOptions = [
  'buyer',
  'guest-visitor',
  'developer',
  'sales-agent',
  'sales-manager',
  'content-maker',
  'content-approver',
  'system-administrator',
  'super-administrator',
  'crm-administrator',
];

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
  layoutPlan: '',
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
  const [publicProjectsLoading, setPublicProjectsLoading] = useState(true);
  const [publicQuery, setPublicQuery] = useState('');
  const [selectedPublicProjectId, setSelectedPublicProjectId] = useState('');
  const [publicProjectDetail, setPublicProjectDetail] = useState(null);
  const [publicFullscreenDrawerOpen, setPublicFullscreenDrawerOpen] = useState(false);
  const publicProjectSelectionRef = useRef(false);

  const [developers, setDevelopers] = useState([]);
  const [selectedDeveloperToDeleteId, setSelectedDeveloperToDeleteId] = useState('');
  const [users, setUsers] = useState([]);
  const [adminProjects, setAdminProjects] = useState([]);
  const [adminProjectDetail, setAdminProjectDetail] = useState(null);
  const [facilities, setFacilities] = useState([]);
  const [amenities, setAmenities] = useState([]);
  const [selectedAdminProjectId, setSelectedAdminProjectId] = useState('');

  const [loginForm, setLoginForm] = useState({
    email: 'admin@example.com',
    password: 'Admin1234!',
  });
  const [developerForm, setDeveloperForm] = useState(emptyDeveloperForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [resetPasswordForm, setResetPasswordForm] = useState({
    userId: '',
    password: '',
  });
  const [projectForm, setProjectForm] = useState(emptyProjectForm);
  const [buildingForm, setBuildingForm] = useState(emptyBuildingForm);
  const [floorForm, setFloorForm] = useState(emptyFloorForm);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const selectedAdminProject = useMemo(
    () =>
      adminProjectDetail ||
      adminProjects.find((project) => project.id === selectedAdminProjectId) ||
      adminProjects[0] ||
      null,
    [adminProjectDetail, adminProjects, selectedAdminProjectId],
  );

  const selectedPublicProject = useMemo(
    () => publicProjectDetail || publicProjects.find((project) => project.id === selectedPublicProjectId) || null,
    [publicProjectDetail, publicProjects, selectedPublicProjectId],
  );

  const [publicFullscreenSelectedBuildingId, setPublicFullscreenSelectedBuildingId] = useState('');
  const [publicFullscreenSelectedFloorId, setPublicFullscreenSelectedFloorId] = useState('');
  const [publicFullscreenSelectedFacilityIds, setPublicFullscreenSelectedFacilityIds] = useState([]);
  const [publicFullscreenSelectedAmenityId, setPublicFullscreenSelectedAmenityId] = useState('');
  const [publicFullscreenOpenSection, setPublicFullscreenOpenSection] = useState('');
  const [publicFloorPlanOverlay, setPublicFloorPlanOverlay] = useState(null);
  const [publicAmenityOverlay, setPublicAmenityOverlay] = useState(null);

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

  const publicFullscreenSelectedAmenity = useMemo(
    () => getFullscreenAmenity(selectedPublicProject, publicFullscreenSelectedAmenityId),
    [selectedPublicProject, publicFullscreenSelectedAmenityId],
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
      setPublicProjectsLoading(true);
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
        setPublicProjects([]);
        setError(requestError?.message || 'Failed to load public projects.');
      } finally {
        if (active) {
          setPublicProjectsLoading(false);
        }
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
    if (mode === 'public' && publicProjectSelectionRef.current && selectedPublicProjectId && publicView === 'home') {
      setPublicView('project');
    }
  }, [mode, publicView, selectedPublicProjectId]);

  useEffect(() => {
    if (mode !== 'public' || (publicView !== 'project' && publicView !== 'detail') || !selectedPublicProjectId) {
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
        const [meResponse, developerResponse, projectResponse, facilityResponse, amenityResponse, userResponse] = await Promise.all([
          getMe(token),
          listDevelopers(token),
          listProjects(token),
          listFacilities(token),
          listAmenities(token),
          listUsers(token).catch(() => ({ data: [] })),
        ]);

        if (!active) {
          return;
        }

        setUser(meResponse?.user || null);
        setDevelopers(extractItems(developerResponse));
        const projects = extractItems(projectResponse);
        const nextUsers = extractItems(userResponse);
        setAdminProjects(projects);
        setFacilities(extractItems(facilityResponse));
        setAmenities(extractItems(amenityResponse));
        setUsers(nextUsers);

        if (!selectedAdminProjectId && projects.length) {
          setSelectedAdminProjectId(projects[0].id);
        }

        if (!resetPasswordForm.userId || !nextUsers.some((entry) => entry.id === resetPasswordForm.userId)) {
          setResetPasswordForm((current) => ({
            ...current,
            userId: nextUsers[0]?.id || '',
          }));
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
    if (!token || mode !== 'admin' || !selectedAdminProjectId) {
      return;
    }

    let active = true;

    async function loadSelectedProjectDetail() {
      try {
        const response = await getProject(selectedAdminProjectId, token);
        if (!active) {
          return;
        }

        setAdminProjectDetail(response?.data || null);
      } catch (requestError) {
        if (!active) {
          return;
        }

        setAdminProjectDetail(null);
        setError(requestError?.message || 'Failed to load selected project details.');
      }
    }

    loadSelectedProjectDetail();
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

    const [developerResponse, projectResponse, facilityResponse, amenityResponse, userResponse, projectDetailResponse] = await Promise.all([
      listDevelopers(token),
      listProjects(token),
      listFacilities(token),
      listAmenities(token),
      listUsers(token).catch(() => ({ data: [] })),
      nextProjectId ? getProject(nextProjectId, token).catch(() => null) : Promise.resolve(null),
    ]);

    const projects = extractItems(projectResponse);
    const nextDevelopers = extractItems(developerResponse);
    const nextUsers = extractItems(userResponse);
    setDevelopers(nextDevelopers);
    setUsers(nextUsers);
    setAdminProjects(projects);
    setFacilities(extractItems(facilityResponse));
    setAmenities(extractItems(amenityResponse));
    setAdminProjectDetail(projectDetailResponse?.data || null);

    if (!selectedDeveloperToDeleteId || !nextDevelopers.some((developer) => developer.id === selectedDeveloperToDeleteId)) {
      setSelectedDeveloperToDeleteId(nextDevelopers[0]?.id || '');
    }

    if (!resetPasswordForm.userId || !nextUsers.some((user) => user.id === resetPasswordForm.userId)) {
      setResetPasswordForm((current) => ({
        ...current,
        userId: nextUsers[0]?.id || '',
      }));
    }

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
    setPublicFullscreenOpenSection('');
    setPublicFullscreenSelectedAmenityId('');
    setPublicFloorPlanOverlay(null);
    setPublicAmenityOverlay(null);
    setMode('public');
  }

  function handleOpenPublicProjectDetail(projectId) {
    if (!projectId) {
      return;
    }

    setSelectedPublicProjectId(projectId);
    publicProjectSelectionRef.current = true;
    setPublicView('detail');
    setPublicFullscreenDrawerOpen(false);
    setPublicFullscreenOpenSection('');
    setPublicFullscreenSelectedAmenityId('');
    setPublicFloorPlanOverlay(null);
    setPublicAmenityOverlay(null);
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
    setPublicFullscreenSelectedAmenityId('');
    setPublicFullscreenOpenSection('');
    setPublicFloorPlanOverlay(null);
    setPublicAmenityOverlay(null);
  }

  function handlePublicFullscreenBuildingChange(buildingId) {
    setPublicFullscreenSelectedBuildingId(buildingId);
    setPublicFullscreenOpenSection('');
    setPublicFullscreenSelectedAmenityId('');
    setPublicFloorPlanOverlay(null);
    setPublicAmenityOverlay(null);
    const building = (selectedPublicProject?.buildings || []).find((entry) => entry.id === buildingId);
    setPublicFullscreenSelectedFloorId(building?.floors?.[0]?.id || '');
  }

  function handlePublicFullscreenFloorChange(floorId) {
    setPublicFullscreenSelectedFloorId(floorId);
    setPublicFullscreenOpenSection('');
    setPublicFullscreenSelectedAmenityId('');
    setPublicFloorPlanOverlay(null);
    setPublicAmenityOverlay(null);
  }

  function handlePublicFullscreenToggleFacility(facilityId) {
    setPublicFullscreenSelectedFacilityIds((current) =>
      current.includes(facilityId) ? current.filter((currentId) => currentId !== facilityId) : [...current, facilityId],
    );
  }

  function handlePublicFullscreenAmenityChange(amenityId) {
    setPublicFullscreenSelectedAmenityId(amenityId);

    if (!amenityId) {
      setPublicAmenityOverlay(null);
      return;
    }

    const assignment = (selectedPublicProject?.projectAmenities || []).find((entry) => entry.id === amenityId);
    if (!assignment?.amenity) {
      setPublicAmenityOverlay(null);
      return;
    }

    setPublicAmenityOverlay({
      amenityId: assignment.amenityId,
      name: assignment.amenity.name || 'Amenity',
      category: assignment.amenity.category || 'other',
      image: assignment.amenity.image || '',
      notes: assignment.notes || '',
    });
  }

  function handlePublicFullscreenSectionToggle(section, isOpen) {
    setPublicFullscreenOpenSection(isOpen ? section : '');

    if (isOpen) {
      if (section === 'floor') {
        setPublicAmenityOverlay(null);
        setPublicFullscreenSelectedAmenityId('');
        setPublicFullscreenSelectedFacilityIds([]);
      }

      if (section === 'amenities') {
        setPublicFloorPlanOverlay(null);
        setPublicFullscreenSelectedFacilityIds([]);
      }

      if (section === 'poi') {
        setPublicFloorPlanOverlay(null);
        setPublicAmenityOverlay(null);
        setPublicFullscreenSelectedAmenityId('');
      }
      return;
    }

    if (section === 'floor') {
      setPublicFloorPlanOverlay(null);
    }

    if (section === 'amenities') {
      setPublicAmenityOverlay(null);
      setPublicFullscreenSelectedAmenityId('');
    }

    if (section === 'poi') {
      setPublicFullscreenSelectedFacilityIds([]);
    }
  }

  function handleOpenPublicFloorPlan(floor) {
    if (!floor?.floorPlan) {
      return;
    }

    setPublicFloorPlanOverlay({
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      floorName: floor.floorName || '',
      floorPlan: floor.floorPlan,
    });
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
      // 1) Always persist map pose in a tiny request (never touch gallery bytes).
      await updateProjectPlacement(token, projectId, {
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        model3dHeading: payload.model3dHeading ?? 0,
        model3dScale: payload.model3dScale ?? 1,
      });

      // 2) Save text/metadata only. Embedded data: images are stripped — already in DB.
      const { gallery, coverImage, mapMarkerImage, latitude, longitude, model3dHeading, model3dScale, ...meta } = payload;
      await updateProject(token, projectId, {
        ...meta,
        model3dUrl: payload.model3dUrl || null,
        ...(typeof coverImage === 'string' && coverImage && !coverImage.startsWith('data:') ? { coverImage } : {}),
        ...(typeof mapMarkerImage === 'string' && mapMarkerImage && !mapMarkerImage.startsWith('data:')
          ? { mapMarkerImage }
          : {}),
        ...(Array.isArray(gallery) && gallery.length && gallery.every((item) => typeof item === 'string' && !item.startsWith('data:'))
          ? { gallery }
          : {}),
      });

      await refreshAdminData(projectId);
      const publicResponse = await listPublicProjects().catch(() => null);
      if (publicResponse) {
        setPublicProjects(extractItems(publicResponse));
      }
      if (selectedPublicProjectId === projectId) {
        const detail = await getPublicProject(projectId).catch(() => null);
        setPublicProjectDetail(detail?.data || detail || null);
      }
      setMessage('Project saved (coordinates, heading, and scale updated without re-uploading gallery images).');
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

  async function handleCreateUser(payload) {
    const nextPayload = {
      firstName: String(payload?.firstName || '').trim(),
      lastName: String(payload?.lastName || '').trim(),
      email: String(payload?.email || '').trim().toLowerCase(),
      password: String(payload?.password || ''),
      role: String(payload?.role || 'buyer').trim(),
    };

    if (!nextPayload.firstName || !nextPayload.lastName || !nextPayload.email || !nextPayload.password) {
      setError('First name, last name, email, and password are required.');
      return;
    }

    if (nextPayload.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await createUser(token, nextPayload);
      await refreshAdminData();
      setUserForm(emptyUserForm);
      setMessage('User created.');
    } catch (requestError) {
      const detailMessages = Array.isArray(requestError?.payload?.details)
        ? requestError.payload.details.map((detail) => detail?.message).filter(Boolean)
        : [];
      setError(detailMessages.length ? detailMessages.join(' ') : requestError?.message || 'Failed to create user.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResetUserPassword(userId, password) {
    if (!userId) {
      setError('Select a user first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await resetUserPassword(token, userId, { password });
      setResetPasswordForm((current) => ({ ...current, password: '' }));
      setMessage('Password reset.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to reset password.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAmenity(payload) {
    setBusy(true);
    setError('');
    try {
      await createAmenity(token, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Amenity created.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to create amenity.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject(projectId) {
    if (!projectId) {
      setError('Select a project to delete.');
      return;
    }

    const project = adminProjects.find((entry) => entry.id === projectId);
    const confirmed = window.confirm(
      `Delete project "${project?.projectName || 'this project'}"? This will remove its buildings, floors, units, and linked data.`,
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await deleteProject(token, projectId);
      const remainingProjects = adminProjects.filter((entry) => entry.id !== projectId);
      const nextProjectId = remainingProjects[0]?.id || '';
      await refreshAdminData(nextProjectId);
      setSelectedAdminProjectId(nextProjectId);
      setMessage('Project deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete project.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDeveloper(developerId) {
    if (!developerId) {
      setError('Select a developer to delete.');
      return;
    }

    const developer = developers.find((entry) => entry.id === developerId);
    const confirmed = window.confirm(
      `Delete developer "${developer?.companyName || 'this developer'}"? This will remove the developer record and may affect linked projects.`,
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await deleteDeveloper(token, developerId);
      await refreshAdminData();
      setMessage('Developer deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete developer.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateAmenity(amenityId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateAmenity(token, amenityId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Amenity saved.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to save amenity.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAmenity(amenityId) {
    setBusy(true);
    setError('');
    try {
      await deleteAmenity(token, amenityId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Amenity deleted.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to delete amenity.');
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

  async function handleAssignAmenityToProject(payload) {
    if (!selectedAdminProjectId) {
      setError('Select a project first.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await assignAmenityToProject(token, selectedAdminProjectId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Amenity assigned.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to assign amenity.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateProjectAmenity(assignmentId, payload) {
    setBusy(true);
    setError('');
    try {
      await updateProjectAmenity(token, assignmentId, payload);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Project amenity updated.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to update project amenity.');
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProjectAmenity(assignmentId) {
    setBusy(true);
    setError('');
    try {
      await deleteProjectAmenity(token, assignmentId);
      await refreshAdminData(selectedAdminProjectId);
      setMessage('Amenity removed.');
    } catch (requestError) {
      setError(requestError?.message || 'Failed to remove amenity.');
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
      const response = await createFloor(token, selectedBuildingId, {
        floorNumber: Number(floorForm.floorNumber),
        floorName: floorForm.floorName || null,
        floorPlan: floorForm.floorPlan || null,
        displayOrder: Number(floorForm.displayOrder || 0),
        status: floorForm.status || 'active',
      });
      await refreshAdminData(selectedAdminProjectId);
      const createdFloor = response?.data || null;
      if (createdFloor?.id) {
        setSelectedFloorId(createdFloor.id);
      }
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
        layoutPlan: unitForm.layoutPlan || null,
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
    setSelectedBuildingId('');
    setSelectedFloorId('');
    setSelectedUnitId('');
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
          <span aria-hidden="true">{publicFullscreenDrawerOpen ? 'X' : String.fromCharCode(9776)}</span>
        </button>
        <PublicFullscreenSidebar
          project={selectedPublicProject}
          building={publicFullscreenSelectedBuilding}
          selectedFacilityIds={publicFullscreenSelectedFacilityIds}
          selectedAmenityId={publicFullscreenSelectedAmenityId}
          onSelectBuilding={handlePublicFullscreenBuildingChange}
          onToggleFacility={handlePublicFullscreenToggleFacility}
          onSelectAmenity={handlePublicFullscreenAmenityChange}
          onOpenProjectDetail={handleOpenPublicProjectDetail}
          onOpenFloorPlan={handleOpenPublicFloorPlan}
          openSection={publicFullscreenOpenSection}
          onToggleSection={handlePublicFullscreenSectionToggle}
          isOpen={publicFullscreenDrawerOpen}
          onClose={() => setPublicFullscreenDrawerOpen(false)}
        />
        <div className="public-fullscreen-map-page__map">
          <CesiumProjectMap
            className="location-map__map location-map__map--interactive"
            points={fullscreenMapData?.points || []}
            focusPoints={fullscreenMapData?.focusPoints || []}
            routes={fullscreenMapData?.routes || []}
          />
          {publicAmenityOverlay ? (
            <section className="public-amenity-overlay panel" role="dialog" aria-label="Amenity preview">
              <button
                type="button"
                className="public-amenity-overlay__close"
                onClick={() => setPublicAmenityOverlay(null)}
                aria-label="Close amenity preview"
              >
                Ã—
              </button>
              <div className="public-amenity-overlay__head">
                <div>
                  <p className="eyebrow">Amenity</p>
                  <h3>{publicAmenityOverlay.name}</h3>
                  <p>{joinNonEmpty([publicAmenityOverlay.category, publicAmenityOverlay.notes])}</p>
                </div>
              </div>
              <div className="public-amenity-overlay__image-wrap">
                {publicAmenityOverlay.image ? (
                  <img className="public-amenity-overlay__image" src={publicAmenityOverlay.image} alt={publicAmenityOverlay.name} />
                ) : (
                  <div className="public-amenity-overlay__empty">No amenity image available.</div>
                )}
              </div>
            </section>
          ) : null}
          {publicFloorPlanOverlay ? (
            <section className="public-floorplan-overlay panel" role="dialog" aria-label="Floor plan preview">
              <button
                type="button"
                className="public-floorplan-overlay__close"
                onClick={() => setPublicFloorPlanOverlay(null)}
                aria-label="Close floor plan"
              >
                Ã—
              </button>
              <div className="public-floorplan-overlay__head">
                <div>
                  <p className="eyebrow">Floor plan</p>
                  <h3>
                    Floor {publicFloorPlanOverlay.floorNumber}
                    {publicFloorPlanOverlay.floorName ? ` Â· ${publicFloorPlanOverlay.floorName}` : ''}
                  </h3>
                </div>
              </div>
              <div className="public-floorplan-overlay__image-wrap">
                <img
                  className="public-floorplan-overlay__image"
                  src={publicFloorPlanOverlay.floorPlan}
                  alt={`Floor ${publicFloorPlanOverlay.floorNumber} plan`}
                />
              </div>
              <div className="public-floorplan-overlay__actions">
                <button
                  type="button"
                  onClick={() => {
                    const email = selectedPublicProject?.developer?.email;
                    const subject = encodeURIComponent(`${selectedPublicProject?.projectName || 'Project'} floor plan inquiry`);
                    const body = encodeURIComponent(
                      `Hello,\n\nI would like more information about floor ${publicFloorPlanOverlay.floorNumber} of ${selectedPublicProject?.projectName || 'this project'}.\n`,
                    );
                    if (email) {
                      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                    }
                  }}
                >
                  Contact
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const email = selectedPublicProject?.developer?.email;
                    const subject = encodeURIComponent(`${selectedPublicProject?.projectName || 'Project'} visit request`);
                    const body = encodeURIComponent(
                      `Hello,\n\nPlease arrange a site visit for floor ${publicFloorPlanOverlay.floorNumber} of ${selectedPublicProject?.projectName || 'this project'}.\n`,
                    );
                    if (email) {
                      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                    }
                  }}
                >
                  Visit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const email = selectedPublicProject?.developer?.email;
                    const subject = encodeURIComponent(`${selectedPublicProject?.projectName || 'Project'} booking request`);
                    const body = encodeURIComponent(
                      `Hello,\n\nI would like to know the booking process for floor ${publicFloorPlanOverlay.floorNumber} of ${selectedPublicProject?.projectName || 'this project'}.\n`,
                    );
                    if (email) {
                      window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
                    }
                  }}
                >
                  Booking
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    );
  }

  if (mode === 'public' && publicView === 'detail') {
    return <PublicProjectLearnMoreV2 project={selectedPublicProject} onHome={handleReturnHome} />;
  }

  return (
    <div className="shell">
      {mode === 'public' ? (
        <main className="app-grid public-grid">
          <PublicProjectExplorerV2
            projects={publicProjects}
            selectedProject={selectedPublicProject}
            selectedProjectId={selectedPublicProjectId}
            onSelectProject={handleSelectPublicProject}
            onOpenProjectDetail={handleSelectPublicProject}
            query={publicQuery}
            onQueryChange={setPublicQuery}
            loading={publicProjectsLoading}
            mode={mode}
            token={token}
            onSwitchMode={setMode}
            onSignOut={handleLogout}
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
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  placeholder="Email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((current) => ({ ...current, email: e.target.value }))}
                  required
                  autoComplete="email"
                />
              </label>
              <label className="field">
                <span>Password</span>
                <input
                  type="password"
                  placeholder="Password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((current) => ({ ...current, password: e.target.value }))}
                  required
                  autoComplete="current-password"
                />
              </label>
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
              <div className="panel nested-panel">
                <div className="panel-head panel-head--compact">
                  <h3>Users</h3>
                  <p>{users.length ? `${users.length} user(s) loaded` : 'No users loaded yet.'}</p>
                </div>
                <div className="public-sidebar__list">
                  {users.length ? (
                    users.map((entry) => (
                      <article className="public-mini-card" key={entry.id}>
                        <strong>{entry.firstName} {entry.lastName}</strong>
                        <p>{entry.email}</p>
                        <small>{entry.role}</small>
                      </article>
                    ))
                  ) : (
                    <div className="empty-inline">No users loaded yet.</div>
                  )}
                </div>
              </div>

              <div className="panel nested-panel">
                <div className="panel-head panel-head--compact">
                  <h3>Reset password</h3>
                  <p>Set a new password for an existing user.</p>
                </div>
                <select
                  value={resetPasswordForm.userId}
                  onChange={(e) => setResetPasswordForm((current) => ({ ...current, userId: e.target.value }))}
                >
                  <option value="">Select user</option>
                  {users.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.firstName} {entry.lastName} · {entry.email} · {entry.role}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  placeholder="New password"
                  value={resetPasswordForm.password}
                  onChange={(e) => setResetPasswordForm((current) => ({ ...current, password: e.target.value }))}
                />
                <button
                  type="button"
                  className="ghost"
                  disabled={busy || !resetPasswordForm.userId || !resetPasswordForm.password}
                  onClick={() => handleResetUserPassword(resetPasswordForm.userId, resetPasswordForm.password)}
                >
                  Reset password
                </button>
              </div>

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

              <div className="panel nested-panel">
                <div className="panel-head panel-head--compact">
                  <h3>Delete developer</h3>
                  <p>Remove an existing developer profile.</p>
                </div>
                <select
                  value={selectedDeveloperToDeleteId}
                  onChange={(e) => setSelectedDeveloperToDeleteId(e.target.value)}
                >
                  <option value="">Select developer</option>
                  {developers.map((developer) => (
                    <option key={developer.id} value={developer.id}>
                      {developer.companyName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="ghost danger"
                  disabled={busy || !selectedDeveloperToDeleteId}
                  onClick={() => handleDeleteDeveloper(selectedDeveloperToDeleteId)}
                >
                  Delete developer
                </button>
              </div>

              <form
                className="stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleCreateUser(userForm);
                }}
              >
                <h3>New user</h3>
                <div className="split">
                  <input
                    placeholder="First name"
                    value={userForm.firstName}
                    onChange={(e) => setUserForm((current) => ({ ...current, firstName: e.target.value }))}
                    required
                  />
                  <input
                    placeholder="Last name"
                    value={userForm.lastName}
                    onChange={(e) => setUserForm((current) => ({ ...current, lastName: e.target.value }))}
                    required
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((current) => ({ ...current, email: e.target.value }))}
                  required
                />
                <div className="split">
                  <input
                    type="password"
                    placeholder="Password"
                    value={userForm.password}
                    onChange={(e) => setUserForm((current) => ({ ...current, password: e.target.value }))}
                    required
                  />
                  <select
                    value={userForm.role}
                    onChange={(e) => setUserForm((current) => ({ ...current, role: e.target.value }))}
                  >
                    {userRoleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={busy}>
                  Add user
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
              onDelete={handleDeleteProject}
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

            <AmenityManagerV2
              project={selectedAdminProject}
              amenities={amenities}
              busy={busy}
              onCreateAmenity={handleCreateAmenity}
              onUpdateAmenity={handleUpdateAmenity}
              onDeleteAmenity={handleDeleteAmenity}
              onAssignAmenityToProject={handleAssignAmenityToProject}
              onDeleteProjectAmenity={handleDeleteProjectAmenity}
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


