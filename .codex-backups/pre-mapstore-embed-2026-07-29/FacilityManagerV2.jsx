import React, { useEffect, useMemo, useState } from 'react';

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' | ');
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getSortedAssignments(project) {
  return (project?.projectFacilities || [])
    .slice()
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }

      return String(left.facility?.name || '').localeCompare(String(right.facility?.name || ''));
    });
}

export default function FacilityManagerV2({
  project,
  facilities,
  busy,
  onCreateFacility,
  onUpdateFacility,
  onDeleteFacility,
  onAssignFacilityToProject,
  onDeleteProjectFacility,
}) {
  const [creatingFacility, setCreatingFacility] = useState(true);
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [facilityForm, setFacilityForm] = useState({
    name: '',
    category: 'other',
    description: '',
    latitude: '',
    longitude: '',
    address: '',
    icon: '',
    status: 'active',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    facilityId: '',
    mode: 'drive',
    sortOrder: '0',
    notes: '',
  });

  const assignedFacilities = useMemo(() => getSortedAssignments(project), [project]);
  const assignedFacilityIds = useMemo(() => new Set(assignedFacilities.map((assignment) => assignment.facilityId)), [assignedFacilities]);
  const availableFacilities = useMemo(() => (facilities || []).slice().sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))), [facilities]);
  const selectedFacility = availableFacilities.find((facility) => facility.id === selectedFacilityId) || availableFacilities[0] || null;

  useEffect(() => {
    if (!availableFacilities.length) {
      setCreatingFacility(true);
      setSelectedFacilityId('');
      return;
    }

    if (creatingFacility) {
      setFacilityForm({
        name: '',
        category: 'other',
        description: '',
        latitude: '',
        longitude: '',
        address: '',
        icon: '',
        status: 'active',
      });
      setSelectedFacilityId('');
      return;
    }

    if (!selectedFacilityId || !availableFacilities.some((facility) => facility.id === selectedFacilityId)) {
      setSelectedFacilityId(availableFacilities[0].id);
    }
  }, [availableFacilities, creatingFacility, selectedFacilityId]);

  useEffect(() => {
    if (creatingFacility) {
      return;
    }

    if (selectedFacility) {
      setFacilityForm({
        name: selectedFacility.name || '',
        category: selectedFacility.category || 'other',
        description: selectedFacility.description || '',
        latitude: selectedFacility.latitude ?? '',
        longitude: selectedFacility.longitude ?? '',
        address: selectedFacility.address || '',
        icon: selectedFacility.icon || '',
        status: selectedFacility.status || 'active',
      });
    }
  }, [creatingFacility, selectedFacility]);

  useEffect(() => {
    if (!assignmentForm.facilityId && availableFacilities.length) {
      setAssignmentForm((current) => ({
        ...current,
        facilityId: availableFacilities[0].id,
      }));
    }
  }, [assignmentForm.facilityId, availableFacilities]);

  if (!project) {
    return null;
  }

  return (
    <section className="panel facility-manager">
      <div className="panel-head">
        <p className="eyebrow">Facilities</p>
        <h3>Project amenities and facility overview</h3>
        <p>Create reusable facilities, then assign them to the selected project. Distances are computed from coordinates automatically.</p>
      </div>

      <div className="facility-manager__layout">
        <div className="facility-manager__column">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const payload = {
                name: facilityForm.name,
                category: facilityForm.category,
                description: facilityForm.description || null,
                latitude: facilityForm.latitude === '' ? null : Number(facilityForm.latitude),
                longitude: facilityForm.longitude === '' ? null : Number(facilityForm.longitude),
                address: facilityForm.address || null,
                icon: facilityForm.icon || null,
                status: facilityForm.status,
              };

              if (creatingFacility || !selectedFacilityId) {
                onCreateFacility(payload);
                return;
              }

              onUpdateFacility(selectedFacilityId, payload);
            }}
          >
            <div className="panel-head panel-head--compact">
              <h4>Facility catalog</h4>
              <p>Use this as a shared library of places and amenities across projects.</p>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreatingFacility(true);
                  setSelectedFacilityId('');
                }}
              >
                New facility
              </button>
              <button type="submit" disabled={busy}>
                {creatingFacility || !selectedFacilityId ? 'Create facility' : 'Save facility'}
              </button>
            </div>

            <select
              value={selectedFacilityId}
              onChange={(e) => {
                const nextValue = e.target.value;
                setSelectedFacilityId(nextValue);
                setCreatingFacility(!nextValue);
              }}
            >
              <option value="">Create new facility</option>
              {availableFacilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>

            <div className="split">
              <input
                placeholder="Facility name"
                value={facilityForm.name}
                onChange={(e) => setFacilityForm((current) => ({ ...current, name: e.target.value }))}
                required
              />
              <input
                placeholder="Category"
                value={facilityForm.category}
                onChange={(e) => setFacilityForm((current) => ({ ...current, category: e.target.value }))}
              />
            </div>
            <div className="split">
              <input
                placeholder="Latitude"
                value={facilityForm.latitude}
                onChange={(e) => setFacilityForm((current) => ({ ...current, latitude: e.target.value }))}
              />
              <input
                placeholder="Longitude"
                value={facilityForm.longitude}
                onChange={(e) => setFacilityForm((current) => ({ ...current, longitude: e.target.value }))}
              />
            </div>
            <input
              placeholder="Address"
              value={facilityForm.address}
              onChange={(e) => setFacilityForm((current) => ({ ...current, address: e.target.value }))}
            />
            <input
              placeholder="Icon or tag"
              value={facilityForm.icon}
              onChange={(e) => setFacilityForm((current) => ({ ...current, icon: e.target.value }))}
            />
            <input
              placeholder="Status"
              value={facilityForm.status}
              onChange={(e) => setFacilityForm((current) => ({ ...current, status: e.target.value }))}
            />
            <textarea
              className="text-area"
              placeholder="Description"
              rows="3"
              value={facilityForm.description}
              onChange={(e) => setFacilityForm((current) => ({ ...current, description: e.target.value }))}
            />
            {selectedFacilityId ? (
              <button type="button" className="ghost danger" onClick={() => onDeleteFacility(selectedFacilityId)} disabled={busy}>
                Delete facility
              </button>
            ) : null}
          </form>

          <div className="facility-list">
            {availableFacilities.map((facility) => (
              <button
                key={facility.id}
                type="button"
                className={`route-card route-card--button ${selectedFacilityId === facility.id ? 'route-card--selected' : ''}`}
                onClick={() => {
                  setCreatingFacility(false);
                  setSelectedFacilityId(facility.id);
                }}
              >
                <div className="route-card__header">
                  <div>
                    <span className="eyebrow">{facility.category}</span>
                    <h4>{facility.name}</h4>
                  </div>
                  <span className="chip">{facility.status}</span>
                </div>
                <p>{joinNonEmpty([facility.address, facility.icon]) || 'No address added yet'}</p>
                <small>
                  {joinNonEmpty([facility.latitude, facility.longitude]) || 'Coordinates not set'}
                </small>
              </button>
            ))}
            {!availableFacilities.length ? <p className="empty-inline">No facilities have been created yet.</p> : null}
          </div>
        </div>

        <div className="facility-manager__column">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onAssignFacilityToProject({
                facilityId: assignmentForm.facilityId,
                mode: assignmentForm.mode,
                sortOrder: Number(assignmentForm.sortOrder || 0),
                notes: assignmentForm.notes || null,
              });
            }}
          >
            <div className="panel-head panel-head--compact">
              <h4>Assign to project</h4>
              <p>Pick one of the shared facilities for this project. Distance and time are calculated from coordinates.</p>
            </div>

            <select
              value={assignmentForm.facilityId}
              onChange={(e) => setAssignmentForm((current) => ({ ...current, facilityId: e.target.value }))}
              required
            >
              <option value="">Select facility</option>
              {availableFacilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}{assignedFacilityIds.has(facility.id) ? ' (assigned)' : ''}
                </option>
              ))}
            </select>
            <div className="split">
              <input
                placeholder="Mode"
                value={assignmentForm.mode}
                onChange={(e) => setAssignmentForm((current) => ({ ...current, mode: e.target.value }))}
              />
              <input
                type="number"
                placeholder="Sort order"
                value={assignmentForm.sortOrder}
                onChange={(e) => setAssignmentForm((current) => ({ ...current, sortOrder: e.target.value }))}
              />
            </div>
            <textarea
              className="text-area"
              placeholder="Notes"
              rows="3"
              value={assignmentForm.notes}
              onChange={(e) => setAssignmentForm((current) => ({ ...current, notes: e.target.value }))}
            />
            <button type="submit" disabled={busy || !assignmentForm.facilityId}>
              Assign to project
            </button>
          </form>

          <div className="project-facility-list">
            <div className="panel-head panel-head--compact">
              <h4>Assigned facilities</h4>
              <p>{assignedFacilities.length ? `${assignedFacilities.length} assignment(s) on this project` : 'No facilities assigned yet.'}</p>
            </div>

            {assignedFacilities.map((assignment) => (
              <article className="route-card" key={assignment.id}>
                <div className="route-card__header">
                  <div>
                    <span className="eyebrow">{assignment.facility?.category}</span>
                    <h4>{assignment.facility?.name}</h4>
                  </div>
                  <span className="chip">{assignment.mode}</span>
                </div>
                <strong>{assignment.distanceKm} km | {assignment.travelMinutes} min</strong>
                <p>{joinNonEmpty([assignment.facility?.address, assignment.notes]) || 'No notes available'}</p>
                <div className="action-row">
                  <button type="button" className="ghost danger" onClick={() => onDeleteProjectFacility(assignment.id)} disabled={busy}>
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {!assignedFacilities.length ? <p className="empty-inline">Assign a facility to show it here.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
