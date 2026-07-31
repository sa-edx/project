import React, { useEffect, useState } from 'react';

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

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' · ');
}

function parseList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
}

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
}

function readFileAsDataUrl(file, onLoad) {
  const reader = new FileReader();
  reader.onload = () => {
    onLoad(String(reader.result || ''));
  };
  reader.readAsDataURL(file);
}

const AMENITY_OPTIONS = [
  'Pool',
  'Gym',
  'Parking',
  'Security',
  'Balcony',
  'Concierge',
  'Kids Play Area',
  'Sea View',
  'Smart Home',
  'Pet Friendly',
];

const ROUTE_CATEGORY_OPTIONS = [
  'airport',
  'hospital',
  'school',
  'mall',
  'metro',
  'beach',
  'park',
  'other',
];

function toggleArrayValue(values, value) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function reorderList(items, fromIndex, toIndex) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function normalizeFilterValue(value) {
  return String(value || '').trim().toLowerCase();
}

function includesFilterValue(source, query) {
  return String(source || '').toLowerCase().includes(query);
}

function filterStructureBuildings(buildings, searchTerm, statusFilter) {
  const query = normalizeFilterValue(searchTerm);
  const selectedStatus = statusFilter === 'all' ? '' : normalizeFilterValue(statusFilter);

  return (buildings || [])
    .map((building) => {
      const buildingStatusMatches = !selectedStatus || normalizeFilterValue(building.status) === selectedStatus;
      const buildingMatchesQuery =
        !query ||
        [
          building.buildingName,
          building.buildingCode,
          building.buildingType,
          building.status,
        ].some((value) => includesFilterValue(value, query));

      const floors = (building.floors || [])
        .map((floor) => {
          const floorStatusMatches = !selectedStatus || normalizeFilterValue(floor.status) === selectedStatus;
          const floorMatchesQuery =
            !query ||
            [
              floor.floorNumber,
              floor.floorName,
              floor.status,
            ].some((value) => includesFilterValue(value, query));

          const units = (floor.units || []).filter((unit) => {
            const unitStatusMatches = !selectedStatus || normalizeFilterValue(unit.status) === selectedStatus;
            const unitMatchesQuery =
              !query ||
              [
                unit.unitNumber,
                unit.unitCode,
                unit.unitType,
                unit.status,
                unit.viewType,
                (unit.amenities || []).join(' '),
              ].some((value) => includesFilterValue(value, query));

            return unitStatusMatches && unitMatchesQuery;
          });

          const keepFloor =
            (floorStatusMatches && floorMatchesQuery) ||
            units.length > 0 ||
            (!query && floorStatusMatches);

          if (!keepFloor) {
            return null;
          }

          return {
            ...floor,
            units,
          };
        })
        .filter(Boolean);

      const keepBuilding =
        (buildingStatusMatches && buildingMatchesQuery) ||
        floors.length > 0 ||
        (!query && buildingStatusMatches);

      if (!keepBuilding) {
        return null;
      }

      return {
        ...building,
        floors,
      };
    })
    .filter(Boolean);
}

function AmenityChips({ value, onChange }) {
  return (
    <div className="amenity-chips">
      {AMENITY_OPTIONS.map((amenity) => {
        const checked = value.includes(amenity);
        return (
          <label key={amenity} className={`amenity-chip ${checked ? 'amenity-chip--active' : ''}`}>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onChange(toggleArrayValue(value, amenity))}
            />
            <span>{amenity}</span>
          </label>
        );
      })}
    </div>
  );
}

function getCounts(project) {
  const buildings = project?.buildings || [];
  const floors = buildings.reduce((sum, building) => sum + (building.floors?.length || 0), 0);
  const units = buildings.reduce(
    (sum, building) => sum + (building.floors || []).reduce((floorSum, floor) => floorSum + (floor.units?.length || 0), 0),
    0,
  );

  return { buildings: buildings.length, floors, units };
}

function getSelectedSummary(project, selectedBuildingId, selectedFloorId, selectedUnitId) {
  const buildings = project?.buildings || [];
  const selectedBuilding = buildings.find((building) => building.id === selectedBuildingId) || null;
  const selectedFloor = selectedBuilding?.floors?.find((floor) => floor.id === selectedFloorId) || null;
  const selectedUnit = selectedFloor?.units?.find((unit) => unit.id === selectedUnitId) || null;

  return { selectedBuilding, selectedFloor, selectedUnit };
}

function SummaryCard({ label, value, hint }) {
  return (
    <article className="structure-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}

function getSortedNearbyDestinations(project) {
  return (project?.nearbyDestinations || [])
    .slice()
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }

      return String(left.label || '').localeCompare(String(right.label || ''));
    });
}

function ContextPanel({ project, selectedBuilding, selectedFloor, selectedUnit, stats }) {
  return (
    <aside className="structure-context panel">
      <div className="panel-head">
        <h3>Selected inventory</h3>
        <p>Live context for the building, floor, and unit you are editing.</p>
      </div>

      <div className="structure-context__stack">
        <div className="structure-context__card">
          <span className="eyebrow">Project</span>
          <h4>{project.projectName}</h4>
          <p>{joinNonEmpty([project.projectCode, project.projectType])}</p>
        </div>

        <div className="structure-context__card">
          <span className="eyebrow">Building</span>
          <h4>{selectedBuilding?.buildingName || 'None selected'}</h4>
          <p>{joinNonEmpty([selectedBuilding?.buildingCode, selectedBuilding?.buildingType, selectedBuilding?.status]) || 'Pick a building from the tree or a form.'}</p>
        </div>

        <div className="structure-context__card">
          <span className="eyebrow">Floor</span>
          <h4>{selectedFloor ? `Floor ${selectedFloor.floorNumber}` : 'None selected'}</h4>
          <p>{joinNonEmpty([selectedFloor?.floorName, selectedFloor?.status]) || 'Pick a floor to edit it here.'}</p>
        </div>

        <div className="structure-context__card">
          <span className="eyebrow">Unit</span>
          <h4>{selectedUnit?.unitNumber || 'None selected'}</h4>
          <p>{joinNonEmpty([selectedUnit?.unitCode, selectedUnit?.unitType, selectedUnit?.status]) || 'Pick a unit to edit it here.'}</p>
          {selectedUnit ? <strong>{formatMoney(selectedUnit.basePrice, selectedUnit.currency)}</strong> : null}
        </div>

        <div className="structure-context__tips">
          <SummaryCard label="Buildings" value={stats.buildings} hint={`${stats.activeBuildings} active`} />
          <SummaryCard label="Floors" value={stats.floors} hint={`${stats.activeFloors} active`} />
          <SummaryCard label="Units" value={stats.units} hint={`${stats.featuredUnits} featured`} />
        </div>

        <div className="structure-context__note">
          <strong>Suggested flow</strong>
          <p>Create a building, add its floors, then add units. Switch to Edit Selected when you need to adjust one item.</p>
        </div>
      </div>
    </aside>
  );
}

export default function StructureManagerV2({
  project,
  selectedBuildingId,
  setSelectedBuildingId,
  selectedFloorId,
  setSelectedFloorId,
  selectedUnitId,
  setSelectedUnitId,
  buildingForm,
  setBuildingForm,
  floorForm,
  setFloorForm,
  unitForm,
  setUnitForm,
  onCreateBuilding,
  onUpdateBuilding,
  onCreateFloor,
  onUpdateFloor,
  onCreateUnit,
  onUpdateUnit,
  onDeleteBuilding,
  onDeleteFloor,
  onDeleteUnit,
  onCreateNearbyDestination,
  onUpdateNearbyDestination,
  onDeleteNearbyDestination,
  busy,
}) {
  const [activeTab, setActiveTab] = useState('create');
  const [structureSearch, setStructureSearch] = useState('');
  const [structureStatus, setStructureStatus] = useState('all');
  const [draggedFloor, setDraggedFloor] = useState(null);
  const [selectedNearbyDestinationId, setSelectedNearbyDestinationId] = useState('');
  const [creatingNearbyDestination, setCreatingNearbyDestination] = useState(false);
  const [buildingEditForm, setBuildingEditForm] = useState({
    buildingCode: '',
    buildingName: '',
    buildingType: 'Tower',
    status: 'active',
  });
  const [floorEditForm, setFloorEditForm] = useState({
    floorNumber: '',
    floorName: '',
    floorPlan: '',
    displayOrder: '0',
    status: 'active',
  });
  const [unitEditForm, setUnitEditForm] = useState({
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
  });
  const [nearbyDestinationForm, setNearbyDestinationForm] = useState({
    label: '',
    category: 'other',
    latitude: '',
    longitude: '',
    mode: 'drive',
    notes: '',
    sortOrder: '0',
  });

  const stats = getCounts(project);
  const { selectedBuilding, selectedFloor, selectedUnit } = getSelectedSummary(
    project,
    selectedBuildingId,
    selectedFloorId,
    selectedUnitId,
  );

  const buildings = project?.buildings || [];
  const filteredBuildings = filterStructureBuildings(buildings, structureSearch, structureStatus);
  const nearbyDestinations = getSortedNearbyDestinations(project);
  const selectedNearbyDestination = nearbyDestinations.find((destination) => destination.id === selectedNearbyDestinationId) || nearbyDestinations[0] || null;

  async function commitFloorOrder(orderedFloors) {
    for (let index = 0; index < orderedFloors.length; index += 1) {
      const floor = orderedFloors[index];
      await onUpdateFloor(floor.id, { displayOrder: index });
    }

    if (selectedFloorId) {
      const selectedStillVisible = orderedFloors.some((floor) => floor.id === selectedFloorId);
      if (!selectedStillVisible) {
        setSelectedFloorId(orderedFloors[0]?.id || '');
      }
    }
  }

  async function handleFloorDrop(building, targetFloorId) {
    if (!draggedFloor || draggedFloor.buildingId !== building.id || draggedFloor.floorId === targetFloorId) {
      setDraggedFloor(null);
      return;
    }

    const sourceIndex = (building.floors || []).findIndex((floor) => floor.id === draggedFloor.floorId);
    const targetIndex = (building.floors || []).findIndex((floor) => floor.id === targetFloorId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedFloor(null);
      return;
    }

    const orderedFloors = reorderList(building.floors || [], sourceIndex, targetIndex);
    setDraggedFloor(null);
    await commitFloorOrder(orderedFloors);
  }

  useEffect(() => {
    if (selectedBuilding) {
      setBuildingEditForm({
        buildingCode: selectedBuilding.buildingCode || '',
        buildingName: selectedBuilding.buildingName || '',
        buildingType: selectedBuilding.buildingType || 'Tower',
        status: selectedBuilding.status || 'active',
      });
    }
  }, [selectedBuilding]);

  useEffect(() => {
    if (selectedFloor) {
      setFloorEditForm({
        floorNumber: String(selectedFloor.floorNumber ?? ''),
        floorName: selectedFloor.floorName || '',
        floorPlan: selectedFloor.floorPlan || '',
        displayOrder: String(selectedFloor.displayOrder ?? 0),
        status: selectedFloor.status || 'active',
      });
    }
  }, [selectedFloor]);

  useEffect(() => {
    if (selectedUnit) {
      setUnitEditForm({
        unitNumber: selectedUnit.unitNumber || '',
        unitCode: selectedUnit.unitCode || '',
        unitType: selectedUnit.unitType || 'Apartment',
        bedrooms: String(selectedUnit.bedrooms ?? 0),
        bathrooms: String(selectedUnit.bathrooms ?? 0),
        area: selectedUnit.area ?? '',
        basePrice: selectedUnit.basePrice ?? '',
        currency: selectedUnit.currency || 'AED',
        status: selectedUnit.status || 'available',
        featured: Boolean(selectedUnit.featured),
        viewType: selectedUnit.viewType || '',
        media: normalizeList(selectedUnit.media).join('\n'),
        amenities: normalizeList(selectedUnit.amenities),
      });
    }
  }, [selectedUnit]);

  useEffect(() => {
    if (!nearbyDestinations.length) {
      setSelectedNearbyDestinationId((current) => (current ? '' : current));
      setCreatingNearbyDestination((current) => (current ? current : true));
      setNearbyDestinationForm((current) => {
        const nextForm = {
          label: '',
          category: 'other',
          latitude: '',
          longitude: '',
          mode: 'drive',
          notes: '',
          sortOrder: '0',
        };

        if (
          current.label === nextForm.label &&
          current.category === nextForm.category &&
          current.latitude === nextForm.latitude &&
          current.longitude === nextForm.longitude &&
          current.mode === nextForm.mode &&
          current.notes === nextForm.notes &&
          current.sortOrder === nextForm.sortOrder
        ) {
          return current;
        }

        return nextForm;
      });
      return;
    }

    if (!creatingNearbyDestination && (!selectedNearbyDestinationId || !nearbyDestinations.some((destination) => destination.id === selectedNearbyDestinationId))) {
      setSelectedNearbyDestinationId(nearbyDestinations[0].id);
    }
  }, [nearbyDestinations, selectedNearbyDestinationId, creatingNearbyDestination]);

  useEffect(() => {
    if (creatingNearbyDestination) {
      const nextForm = {
        label: '',
        category: 'other',
        latitude: '',
        longitude: '',
        mode: 'drive',
        notes: '',
        sortOrder: String(nearbyDestinations.length),
      };

      setNearbyDestinationForm((current) => (
        current.label === nextForm.label &&
        current.category === nextForm.category &&
        current.latitude === nextForm.latitude &&
        current.longitude === nextForm.longitude &&
        current.mode === nextForm.mode &&
        current.notes === nextForm.notes &&
        current.sortOrder === nextForm.sortOrder
          ? current
          : nextForm
      ));
      return;
    }

    if (selectedNearbyDestination) {
      const nextForm = {
        label: selectedNearbyDestination.label || '',
        category: selectedNearbyDestination.category || 'other',
        latitude: String(selectedNearbyDestination.latitude ?? ''),
        longitude: String(selectedNearbyDestination.longitude ?? ''),
        mode: selectedNearbyDestination.mode || 'drive',
        notes: selectedNearbyDestination.notes || '',
        sortOrder: String(selectedNearbyDestination.sortOrder ?? 0),
      };

      setNearbyDestinationForm((current) => (
        current.label === nextForm.label &&
        current.category === nextForm.category &&
        current.latitude === nextForm.latitude &&
        current.longitude === nextForm.longitude &&
        current.mode === nextForm.mode &&
        current.notes === nextForm.notes &&
        current.sortOrder === nextForm.sortOrder
          ? current
          : nextForm
      ));
    }
  }, [creatingNearbyDestination, nearbyDestinations.length, selectedNearbyDestination]);

  if (!project) {
    return <div className="empty-state"><h3>Select a project</h3><p>Choose a project to manage its buildings, floors and units.</p></div>;
  }

  const tree = (
    <div className="structure-tree structure-tree--v2">
      {filteredBuildings.map((building) => {
        const buildingSelected = building.id === selectedBuildingId;
        return (
          <article className={`structure-card ${buildingSelected ? 'structure-card--selected' : ''}`} key={building.id}>
            <div className="structure-card__header">
              <div>
                <p className="eyebrow">Building</p>
                <h4>{building.buildingName}</h4>
                <p>{joinNonEmpty([building.buildingCode, building.buildingType])}</p>
              </div>
              <div className="action-row">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setSelectedBuildingId(building.id);
                    setActiveTab('edit');
                  }}
                >
                  Select
                </button>
                <button type="button" className="ghost danger" onClick={() => onDeleteBuilding(building.id)}>
                  Delete
                </button>
              </div>
            </div>

            <div className="structure-card__summary">
              <span className="tag">{building.status}</span>
              <span className="tag">{building.floors?.length || 0} floors</span>
            </div>

            <div className="floor-stack">
              {(building.floors || []).map((floor) => {
                const floorSelected = floor.id === selectedFloorId;
                return (
                  <div
                    className={`floor-card ${floorSelected ? 'floor-card--selected' : ''} ${draggedFloor?.floorId === floor.id ? 'floor-card--dragging' : ''}`}
                    key={floor.id}
                    draggable
                    onDragStart={() => setDraggedFloor({ buildingId: building.id, floorId: floor.id })}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleFloorDrop(building, floor.id)}
                    onDragEnd={() => setDraggedFloor(null)}
                  >
                    <div className="floor-card__header">
                      <div>
                        <strong>Floor {floor.floorNumber}</strong>
                        <p>{floor.floorName || 'Unnamed floor'}</p>
                      </div>
                      <div className="action-row">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const floors = building.floors || [];
                            const currentIndex = floors.findIndex((item) => item.id === floor.id);
                            if (currentIndex > 0) {
                              void handleFloorDrop(building, floors[currentIndex - 1].id);
                            }
                          }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            const floors = building.floors || [];
                            const currentIndex = floors.findIndex((item) => item.id === floor.id);
                            if (currentIndex >= 0 && currentIndex < floors.length - 1) {
                              void handleFloorDrop(building, floors[currentIndex + 1].id);
                            }
                          }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setSelectedFloorId(floor.id);
                            setActiveTab('edit');
                          }}
                        >
                          Select
                        </button>
                        <button type="button" className="ghost danger" onClick={() => onDeleteFloor(floor.id)}>
                          Delete
                        </button>
                      </div>
                    </div>

                    {isImageSource(floor.floorPlan) ? (
                      <div className="floor-plan-preview floor-plan-preview--compact">
                        <img src={floor.floorPlan} alt={`Floor plan ${floor.floorNumber}`} />
                      </div>
                    ) : floor.floorPlan ? (
                      <a className="floor-plan-link" href={floor.floorPlan} target="_blank" rel="noreferrer">
                        Open floor plan
                      </a>
                    ) : (
                      <p className="empty-inline">No floor plan uploaded.</p>
                    )}

                    <div className="unit-grid unit-grid--dense">
                      {(floor.units || []).map((unit) => (
                        <article
                          className={`unit-card ${unit.id === selectedUnitId ? 'unit-card--selected' : ''}`}
                          key={unit.id}
                        >
                          <strong>{unit.unitNumber}</strong>
                          <span>{unit.unitCode}</span>
                          <small>{joinNonEmpty([unit.unitType, `${unit.bedrooms} BR`, `${unit.bathrooms} BA`])}</small>
                          <small>{formatMoney(unit.basePrice, unit.currency)}</small>
                          <small>{unit.status}</small>
                          <small>{`Media ${unit.media?.length || 0} | Amenities ${unit.amenities?.length || 0}`}</small>
                          <button
                            type="button"
                            className="ghost unit-select"
                            onClick={() => {
                              setSelectedUnitId(unit.id);
                              setActiveTab('edit');
                            }}
                          >
                            Select
                          </button>
                          <button type="button" className="ghost danger unit-select" onClick={() => onDeleteUnit(unit.id)}>
                            Delete
                          </button>
                        </article>
                      ))}
                      {!floor.units?.length ? <p className="empty-inline">No units yet.</p> : null}
                    </div>
                  </div>
                );
              })}
              {!building.floors?.length ? <p className="empty-inline">No floors yet.</p> : null}
            </div>
          </article>
        );
      })}
      {!filteredBuildings.length ? (
        <div className="empty-state">
          <h3>{(project?.buildings || []).length ? 'No matching results' : 'No buildings yet'}</h3>
          <p>{(project?.buildings || []).length ? 'Try a different search or clear the structure filters.' : 'Create the first building to start the project structure.'}</p>
        </div>
      ) : null}
    </div>
  );

  const createPanel = (
    <div className="manager-grid manager-grid--v2">
      <div className="manager-column">
        <form className="stack" onSubmit={(event) => { event.preventDefault(); onCreateBuilding(); }}>
          <h4>Create Building</h4>
          <input placeholder="Building Code" value={buildingForm.buildingCode} onChange={(e) => setBuildingForm((c) => ({ ...c, buildingCode: e.target.value }))} />
          <input placeholder="Building Name" value={buildingForm.buildingName} onChange={(e) => setBuildingForm((c) => ({ ...c, buildingName: e.target.value }))} />
          <input placeholder="Building Type" value={buildingForm.buildingType} onChange={(e) => setBuildingForm((c) => ({ ...c, buildingType: e.target.value }))} />
          <input placeholder="Status" value={buildingForm.status} onChange={(e) => setBuildingForm((c) => ({ ...c, status: e.target.value }))} />
          <button type="submit" disabled={busy}>Add Building</button>
        </form>

        <form className="stack" onSubmit={(event) => { event.preventDefault(); onCreateFloor(); }}>
          <h4>Create Floor</h4>
          <select value={selectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)} required>
            <option value="">Select building</option>
            {buildings.map((building) => <option key={building.id} value={building.id}>{building.buildingName}</option>)}
          </select>
          <input type="number" placeholder="Floor Number" value={floorForm.floorNumber} onChange={(e) => setFloorForm((c) => ({ ...c, floorNumber: e.target.value }))} />
          <input placeholder="Floor Name" value={floorForm.floorName} onChange={(e) => setFloorForm((c) => ({ ...c, floorName: e.target.value }))} />
          <input
            placeholder="Floor Plan URL or data URL"
            value={floorForm.floorPlan}
            onChange={(e) => setFloorForm((c) => ({ ...c, floorPlan: e.target.value }))}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                readFileAsDataUrl(file, (dataUrl) => setFloorForm((c) => ({ ...c, floorPlan: dataUrl })));
              }
            }}
          />
          {isImageSource(floorForm.floorPlan) ? (
            <div className="floor-plan-preview">
              <img src={floorForm.floorPlan} alt="Floor plan preview" />
            </div>
          ) : null}
          <input type="number" placeholder="Display Order" value={floorForm.displayOrder} onChange={(e) => setFloorForm((c) => ({ ...c, displayOrder: e.target.value }))} />
          <input placeholder="Status" value={floorForm.status} onChange={(e) => setFloorForm((c) => ({ ...c, status: e.target.value }))} />
          <button type="submit" disabled={busy || !selectedBuildingId}>Add Floor</button>
        </form>

        <form className="stack" onSubmit={(event) => { event.preventDefault(); onCreateUnit(); }}>
          <h4>Create Unit</h4>
          <select value={selectedFloorId} onChange={(e) => setSelectedFloorId(e.target.value)} required>
            <option value="">Select floor</option>
            {buildings.flatMap((building) => (building.floors || []).map((floor) => <option key={floor.id} value={floor.id}>{building.buildingName} | Floor {floor.floorNumber}</option>))}
          </select>
          <input placeholder="Unit Number" value={unitForm.unitNumber} onChange={(e) => setUnitForm((c) => ({ ...c, unitNumber: e.target.value }))} />
          <input placeholder="Unit Code" value={unitForm.unitCode} onChange={(e) => setUnitForm((c) => ({ ...c, unitCode: e.target.value }))} />
          <div className="split">
            <input placeholder="Unit Type" value={unitForm.unitType} onChange={(e) => setUnitForm((c) => ({ ...c, unitType: e.target.value }))} />
            <input type="number" placeholder="Bedrooms" value={unitForm.bedrooms} onChange={(e) => setUnitForm((c) => ({ ...c, bedrooms: e.target.value }))} />
          </div>
          <div className="split">
            <input type="number" placeholder="Bathrooms" value={unitForm.bathrooms} onChange={(e) => setUnitForm((c) => ({ ...c, bathrooms: e.target.value }))} />
            <input type="number" placeholder="Area" value={unitForm.area} onChange={(e) => setUnitForm((c) => ({ ...c, area: e.target.value }))} />
          </div>
          <div className="split">
            <input type="number" placeholder="Base Price" value={unitForm.basePrice} onChange={(e) => setUnitForm((c) => ({ ...c, basePrice: e.target.value }))} />
            <input placeholder="Currency" value={unitForm.currency} onChange={(e) => setUnitForm((c) => ({ ...c, currency: e.target.value }))} />
          </div>
          <div className="split">
            <input placeholder="View Type" value={unitForm.viewType} onChange={(e) => setUnitForm((c) => ({ ...c, viewType: e.target.value }))} />
            <input placeholder="Status" value={unitForm.status} onChange={(e) => setUnitForm((c) => ({ ...c, status: e.target.value }))} />
          </div>
          <textarea
            className="text-area"
            placeholder="Unit media URLs, one per line"
            rows="3"
            value={unitForm.media}
            onChange={(e) => setUnitForm((c) => ({ ...c, media: e.target.value }))}
          />
          <div className="amenity-section">
            <div className="amenity-section__head">
              <strong>Amenities</strong>
              <small>{unitForm.amenities.length ? `${unitForm.amenities.length} selected` : 'Pick any that apply'}</small>
            </div>
            <AmenityChips value={unitForm.amenities} onChange={(nextValue) => setUnitForm((c) => ({ ...c, amenities: nextValue }))} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={unitForm.featured} onChange={(e) => setUnitForm((c) => ({ ...c, featured: e.target.checked }))} />
            Featured unit
          </label>
          <button type="submit" disabled={busy || !selectedFloorId}>Add Unit</button>
        </form>
      </div>
    </div>
  );

  const editPanel = (
    <div className="manager-grid manager-grid--v2">
      <div className="manager-column">
        <form className="stack" onSubmit={(event) => { event.preventDefault(); if (selectedBuildingId) onUpdateBuilding(selectedBuildingId, { ...buildingEditForm }); }}>
          <h4>Edit Selected Building</h4>
          <select value={selectedBuildingId} onChange={(e) => setSelectedBuildingId(e.target.value)}>
            <option value="">Select building</option>
            {buildings.map((building) => <option key={building.id} value={building.id}>{building.buildingName}</option>)}
          </select>
          <input placeholder="Building Code" value={buildingEditForm.buildingCode} onChange={(e) => setBuildingEditForm((c) => ({ ...c, buildingCode: e.target.value }))} />
          <input placeholder="Building Name" value={buildingEditForm.buildingName} onChange={(e) => setBuildingEditForm((c) => ({ ...c, buildingName: e.target.value }))} />
          <input placeholder="Building Type" value={buildingEditForm.buildingType} onChange={(e) => setBuildingEditForm((c) => ({ ...c, buildingType: e.target.value }))} />
          <input placeholder="Status" value={buildingEditForm.status} onChange={(e) => setBuildingEditForm((c) => ({ ...c, status: e.target.value }))} />
          <button type="submit" disabled={busy || !selectedBuildingId}>Save Building</button>
        </form>

        <form className="stack" onSubmit={(event) => { event.preventDefault(); if (selectedFloorId) onUpdateFloor(selectedFloorId, { ...floorEditForm, floorNumber: Number(floorEditForm.floorNumber), displayOrder: Number(floorEditForm.displayOrder || 0) }); }}>
          <h4>Edit Selected Floor</h4>
          <select value={selectedFloorId} onChange={(e) => setSelectedFloorId(e.target.value)}>
            <option value="">Select floor</option>
            {buildings.flatMap((building) => (building.floors || []).map((floor) => <option key={floor.id} value={floor.id}>{building.buildingName} | Floor {floor.floorNumber}</option>))}
          </select>
          <input type="number" placeholder="Floor Number" value={floorEditForm.floorNumber} onChange={(e) => setFloorEditForm((c) => ({ ...c, floorNumber: e.target.value }))} />
          <input placeholder="Floor Name" value={floorEditForm.floorName} onChange={(e) => setFloorEditForm((c) => ({ ...c, floorName: e.target.value }))} />
          <input
            placeholder="Floor Plan URL or data URL"
            value={floorEditForm.floorPlan}
            onChange={(e) => setFloorEditForm((c) => ({ ...c, floorPlan: e.target.value }))}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                readFileAsDataUrl(file, (dataUrl) => setFloorEditForm((c) => ({ ...c, floorPlan: dataUrl })));
              }
            }}
          />
          {isImageSource(floorEditForm.floorPlan) ? (
            <div className="floor-plan-preview">
              <img src={floorEditForm.floorPlan} alt="Floor plan preview" />
            </div>
          ) : null}
          <input type="number" placeholder="Display Order" value={floorEditForm.displayOrder} onChange={(e) => setFloorEditForm((c) => ({ ...c, displayOrder: e.target.value }))} />
          <input placeholder="Status" value={floorEditForm.status} onChange={(e) => setFloorEditForm((c) => ({ ...c, status: e.target.value }))} />
          <button type="submit" disabled={busy || !selectedFloorId}>Save Floor</button>
        </form>

        <form className="stack" onSubmit={(event) => { event.preventDefault(); if (selectedUnitId) onUpdateUnit(selectedUnitId, { ...unitEditForm, bedrooms: Number(unitEditForm.bedrooms || 0), bathrooms: Number(unitEditForm.bathrooms || 0), area: unitEditForm.area === '' ? null : Number(unitEditForm.area), basePrice: unitEditForm.basePrice === '' ? null : Number(unitEditForm.basePrice), media: parseList(unitEditForm.media), amenities: unitEditForm.amenities }); }}>
          <h4>Edit Selected Unit</h4>
          <select value={selectedUnitId} onChange={(e) => setSelectedUnitId(e.target.value)}>
            <option value="">Select unit</option>
            {buildings.flatMap((building) => building.floors?.flatMap((floor) => (floor.units || []).map((unit) => <option key={unit.id} value={unit.id}>{building.buildingName} | Floor {floor.floorNumber} | {unit.unitNumber}</option>)) || [])}
          </select>
          <input placeholder="Unit Number" value={unitEditForm.unitNumber} onChange={(e) => setUnitEditForm((c) => ({ ...c, unitNumber: e.target.value }))} />
          <input placeholder="Unit Code" value={unitEditForm.unitCode} onChange={(e) => setUnitEditForm((c) => ({ ...c, unitCode: e.target.value }))} />
          <div className="split">
            <input placeholder="Unit Type" value={unitEditForm.unitType} onChange={(e) => setUnitEditForm((c) => ({ ...c, unitType: e.target.value }))} />
            <input type="number" placeholder="Bedrooms" value={unitEditForm.bedrooms} onChange={(e) => setUnitEditForm((c) => ({ ...c, bedrooms: e.target.value }))} />
          </div>
          <div className="split">
            <input type="number" placeholder="Bathrooms" value={unitEditForm.bathrooms} onChange={(e) => setUnitEditForm((c) => ({ ...c, bathrooms: e.target.value }))} />
            <input type="number" placeholder="Area" value={unitEditForm.area} onChange={(e) => setUnitEditForm((c) => ({ ...c, area: e.target.value }))} />
          </div>
          <div className="split">
            <input type="number" placeholder="Base Price" value={unitEditForm.basePrice} onChange={(e) => setUnitEditForm((c) => ({ ...c, basePrice: e.target.value }))} />
            <input placeholder="Currency" value={unitEditForm.currency} onChange={(e) => setUnitEditForm((c) => ({ ...c, currency: e.target.value }))} />
          </div>
          <div className="split">
            <input placeholder="View Type" value={unitEditForm.viewType} onChange={(e) => setUnitEditForm((c) => ({ ...c, viewType: e.target.value }))} />
            <input placeholder="Status" value={unitEditForm.status} onChange={(e) => setUnitEditForm((c) => ({ ...c, status: e.target.value }))} />
          </div>
          <textarea
            className="text-area"
            placeholder="Unit media URLs, one per line"
            rows="3"
            value={unitEditForm.media}
            onChange={(e) => setUnitEditForm((c) => ({ ...c, media: e.target.value }))}
          />
          <div className="amenity-section">
            <div className="amenity-section__head">
              <strong>Amenities</strong>
              <small>{unitEditForm.amenities.length ? `${unitEditForm.amenities.length} selected` : 'Pick any that apply'}</small>
            </div>
            <AmenityChips
              value={unitEditForm.amenities}
              onChange={(nextValue) => setUnitEditForm((c) => ({ ...c, amenities: nextValue }))}
            />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={unitEditForm.featured} onChange={(e) => setUnitEditForm((c) => ({ ...c, featured: e.target.checked }))} />
            Featured unit
          </label>
          <button type="submit" disabled={busy || !selectedUnitId}>Save Unit</button>
        </form>
      </div>
    </div>
  );

  const routePanel = (
    <div className="panel nested-panel route-guidance-editor">
      <div className="panel-head">
        <h4>Interactive route guidance</h4>
        <p>Add POIs with latitude and longitude. The app will calculate distance and travel time from the project coordinates.</p>
      </div>

      <div className="route-guidance-editor__layout">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (creatingNearbyDestination || !selectedNearbyDestinationId) {
              onCreateNearbyDestination({
                label: nearbyDestinationForm.label,
                category: nearbyDestinationForm.category,
                latitude: Number(nearbyDestinationForm.latitude || 0),
                longitude: Number(nearbyDestinationForm.longitude || 0),
                mode: nearbyDestinationForm.mode,
                notes: nearbyDestinationForm.notes || null,
                sortOrder: Number(nearbyDestinationForm.sortOrder || 0),
              });
              return;
            }

            onUpdateNearbyDestination(selectedNearbyDestinationId, {
              label: nearbyDestinationForm.label,
              category: nearbyDestinationForm.category,
              latitude: Number(nearbyDestinationForm.latitude || 0),
              longitude: Number(nearbyDestinationForm.longitude || 0),
              mode: nearbyDestinationForm.mode,
              notes: nearbyDestinationForm.notes || null,
              sortOrder: Number(nearbyDestinationForm.sortOrder || 0),
            });
          }}
        >
          <select
            value={selectedNearbyDestinationId}
            onChange={(e) => {
              const nextValue = e.target.value;
              setSelectedNearbyDestinationId(nextValue);
              setCreatingNearbyDestination(!nextValue);
            }}
          >
            <option value="">Create new destination</option>
            {nearbyDestinations.map((destination) => (
              <option key={destination.id} value={destination.id}>
                {destination.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setSelectedNearbyDestinationId('');
              setCreatingNearbyDestination(true);
            }}
          >
            New destination
          </button>
          <input
            placeholder="Destination label"
            value={nearbyDestinationForm.label}
            onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, label: e.target.value }))}
            required
          />
          <div className="split">
            <select value={nearbyDestinationForm.category} onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, category: e.target.value }))}>
              {ROUTE_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <input
              placeholder="Mode"
              value={nearbyDestinationForm.mode}
              onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, mode: e.target.value }))}
            />
          </div>
          <div className="split">
            <input
              type="number"
              step="0.000001"
              placeholder="Latitude"
              value={nearbyDestinationForm.latitude}
              onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, latitude: e.target.value }))}
              required
            />
            <input
              type="number"
              step="0.000001"
              placeholder="Longitude"
              value={nearbyDestinationForm.longitude}
              onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, longitude: e.target.value }))}
              required
            />
          </div>
          <input
            type="number"
            placeholder="Sort order"
            value={nearbyDestinationForm.sortOrder}
            onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, sortOrder: e.target.value }))}
          />
          <textarea
            className="text-area"
            placeholder="Notes"
            rows="3"
            value={nearbyDestinationForm.notes}
            onChange={(e) => setNearbyDestinationForm((c) => ({ ...c, notes: e.target.value }))}
          />
          <button type="submit" disabled={busy}>
            {selectedNearbyDestinationId ? 'Save destination' : 'Add destination'}
          </button>
          {selectedNearbyDestinationId ? (
            <button type="button" className="ghost danger" onClick={() => onDeleteNearbyDestination(selectedNearbyDestinationId)} disabled={busy}>
              Delete destination
            </button>
          ) : null}
        </form>

        <div className="route-guidance-editor__list">
          <div className="panel-head panel-head--compact">
            <h4>Configured destinations</h4>
            <p>{nearbyDestinations.length ? `${nearbyDestinations.length} destination(s) ready for the public page` : 'No destinations configured yet.'}</p>
          </div>

          <div className="route-guidance-list">
            {nearbyDestinations.map((destination) => (
              <button
                key={destination.id}
                type="button"
                className={`route-card route-card--button ${selectedNearbyDestinationId === destination.id ? 'route-card--selected' : ''}`}
                onClick={() => {
                  setCreatingNearbyDestination(false);
                  setSelectedNearbyDestinationId(destination.id);
                }}
              >
                <div className="route-card__header">
                  <div>
                    <span className="eyebrow">{destination.category}</span>
                    <h4>{destination.label}</h4>
                  </div>
                  <span className="chip">{destination.mode}</span>
                </div>
                <strong>{destination.distanceKm} km | {destination.travelMinutes} min</strong>
                <small>{joinNonEmpty([destination.latitude, destination.longitude]) || 'Coordinates not set'}</small>
                {destination.notes ? <p>{destination.notes}</p> : null}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section className="panel structure-manager structure-manager--v2">
      <div className="panel-head">
        <p className="eyebrow">Structure manager</p>
        <h3>Buildings, floors and units management</h3>
        <p>Create structure, browse the tree, and remove inventory from the selected project.</p>
      </div>

      <div className="structure-filters">
        <input
          placeholder="Search building, floor, unit, or amenity"
          value={structureSearch}
          onChange={(e) => setStructureSearch(e.target.value)}
        />
        <select value={structureStatus} onChange={(e) => setStructureStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="available">Available</option>
          <option value="inactive">Inactive</option>
          <option value="sold">Sold</option>
          <option value="reserved">Reserved</option>
        </select>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            setStructureSearch('');
            setStructureStatus('all');
          }}
        >
          Clear
        </button>
      </div>

      <div className="structure-summary">
        <SummaryCard label="Buildings" value={stats.buildings} hint={`${stats.activeBuildings} active`} />
        <SummaryCard label="Floors" value={stats.floors} hint={`${stats.activeFloors} active`} />
        <SummaryCard label="Units" value={stats.units} hint={`${stats.featuredUnits} featured`} />
        <SummaryCard label="Selected" value={selectedBuilding?.buildingName || 'None'} hint={selectedFloor ? `Floor ${selectedFloor.floorNumber}` : 'Pick a building'} />
      </div>

      <div className="tab-bar">
        <button type="button" className={activeTab === 'create' ? '' : 'ghost'} onClick={() => setActiveTab('create')}>Create</button>
        <button type="button" className={activeTab === 'edit' ? '' : 'ghost'} onClick={() => setActiveTab('edit')}>Edit Selected</button>
        <button type="button" className={activeTab === 'tree' ? '' : 'ghost'} onClick={() => setActiveTab('tree')}>Tree</button>
      </div>

      <div className="structure-manager__layout">
        <div className="structure-manager__main">
          {activeTab === 'create' ? createPanel : activeTab === 'edit' ? editPanel : tree}
          {routePanel}
        </div>
        <ContextPanel project={project} selectedBuilding={selectedBuilding} selectedFloor={selectedFloor} selectedUnit={selectedUnit} stats={stats} />
      </div>
    </section>
  );
}
