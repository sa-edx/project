import React, { useEffect, useMemo, useState } from 'react';

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' | ');
}

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function getSortedAssignments(project) {
  return (project?.projectAmenities || [])
    .slice()
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }

      return String(left.amenity?.name || '').localeCompare(String(right.amenity?.name || ''));
    });
}

export default function AmenityManagerV2({
  project,
  amenities,
  busy,
  onCreateAmenity,
  onUpdateAmenity,
  onDeleteAmenity,
  onAssignAmenityToProject,
  onDeleteProjectAmenity,
}) {
  const [creatingAmenity, setCreatingAmenity] = useState(true);
  const [selectedAmenityId, setSelectedAmenityId] = useState('');
  const [amenityForm, setAmenityForm] = useState({
    name: '',
    category: 'other',
    description: '',
    image: '',
    status: 'active',
  });
  const [assignmentForm, setAssignmentForm] = useState({
    amenityId: '',
    sortOrder: '0',
    notes: '',
  });

  const assignedAmenities = useMemo(() => getSortedAssignments(project), [project]);
  const assignedAmenityIds = useMemo(() => new Set(assignedAmenities.map((assignment) => assignment.amenityId)), [assignedAmenities]);
  const availableAmenities = useMemo(() => (amenities || []).slice().sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))), [amenities]);
  const selectedAmenity = availableAmenities.find((amenity) => amenity.id === selectedAmenityId) || availableAmenities[0] || null;

  useEffect(() => {
    if (!availableAmenities.length) {
      setCreatingAmenity(true);
      setSelectedAmenityId('');
      return;
    }

    if (creatingAmenity) {
      setAmenityForm({
        name: '',
        category: 'other',
        description: '',
        image: '',
        status: 'active',
      });
      setSelectedAmenityId('');
      return;
    }

    if (!selectedAmenityId || !availableAmenities.some((amenity) => amenity.id === selectedAmenityId)) {
      setSelectedAmenityId(availableAmenities[0].id);
    }
  }, [availableAmenities, creatingAmenity, selectedAmenityId]);

  useEffect(() => {
    if (creatingAmenity) {
      return;
    }

    if (selectedAmenity) {
      setAmenityForm({
        name: selectedAmenity.name || '',
        category: selectedAmenity.category || 'other',
        description: selectedAmenity.description || '',
        image: selectedAmenity.image || '',
        status: selectedAmenity.status || 'active',
      });
    }
  }, [creatingAmenity, selectedAmenity]);

  useEffect(() => {
    if (!assignmentForm.amenityId && availableAmenities.length) {
      setAssignmentForm((current) => ({
        ...current,
        amenityId: availableAmenities[0].id,
      }));
    }
  }, [assignmentForm.amenityId, availableAmenities]);

  if (!project) {
    return null;
  }

  return (
    <section className="panel facility-manager">
      <div className="panel-head">
        <p className="eyebrow">Amenities</p>
        <h3>Project amenity catalog</h3>
        <p>Create amenities such as gym, pool, play area, or park, then assign them to the selected project.</p>
      </div>

      <div className="facility-manager__layout">
        <div className="facility-manager__column">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              const payload = {
                name: amenityForm.name,
                category: amenityForm.category,
                description: amenityForm.description || null,
                image: amenityForm.image || null,
                status: amenityForm.status,
              };

              if (creatingAmenity || !selectedAmenityId) {
                onCreateAmenity(payload);
                return;
              }

              onUpdateAmenity(selectedAmenityId, payload);
            }}
          >
            <div className="panel-head panel-head--compact">
              <h4>Amenity catalog</h4>
              <p>Use this as a reusable library of project features.</p>
            </div>

            <div className="action-row">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCreatingAmenity(true);
                  setSelectedAmenityId('');
                }}
              >
                New amenity
              </button>
              <button type="submit" disabled={busy}>
                {creatingAmenity || !selectedAmenityId ? 'Create amenity' : 'Save amenity'}
              </button>
            </div>

            <select
              value={selectedAmenityId}
              onChange={(e) => {
                const nextValue = e.target.value;
                setSelectedAmenityId(nextValue);
                setCreatingAmenity(!nextValue);
              }}
            >
              <option value="">Create new amenity</option>
              {availableAmenities.map((amenity) => (
                <option key={amenity.id} value={amenity.id}>
                  {amenity.name}
                </option>
              ))}
            </select>

            <div className="split">
              <input
                placeholder="Amenity name"
                value={amenityForm.name}
                onChange={(e) => setAmenityForm((current) => ({ ...current, name: e.target.value }))}
                required
              />
              <input
                placeholder="Category"
                value={amenityForm.category}
                onChange={(e) => setAmenityForm((current) => ({ ...current, category: e.target.value }))}
              />
            </div>
            <input
              placeholder="Amenity image URL"
              value={amenityForm.image}
              onChange={(e) => setAmenityForm((current) => ({ ...current, image: e.target.value }))}
            />
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) {
                  return;
                }

                const dataUrl = await readFileAsDataUrl(file);
                setAmenityForm((current) => ({ ...current, image: dataUrl }));
              }}
            />
            {isImageSource(amenityForm.image) ? (
              <div className="public-mini-card facility-manager__image-preview">
                <img src={amenityForm.image} alt="Amenity preview" />
              </div>
            ) : null}
            <input
              placeholder="Status"
              value={amenityForm.status}
              onChange={(e) => setAmenityForm((current) => ({ ...current, status: e.target.value }))}
            />
            <textarea
              className="text-area"
              placeholder="Description"
              rows="3"
              value={amenityForm.description}
              onChange={(e) => setAmenityForm((current) => ({ ...current, description: e.target.value }))}
            />
            {selectedAmenityId ? (
              <button type="button" className="ghost danger" onClick={() => onDeleteAmenity(selectedAmenityId)} disabled={busy}>
                Delete amenity
              </button>
            ) : null}
          </form>

          <div className="facility-list">
            {availableAmenities.map((amenity) => (
              <button
                key={amenity.id}
                type="button"
                className={`route-card route-card--button ${selectedAmenityId === amenity.id ? 'route-card--selected' : ''}`}
                onClick={() => {
                  setCreatingAmenity(false);
                  setSelectedAmenityId(amenity.id);
                }}
              >
                <div className="route-card__header">
                  <div>
                    <span className="eyebrow">{amenity.category}</span>
                    <h4>{amenity.name}</h4>
                  </div>
                  <span className="chip">{amenity.status}</span>
                </div>
                {isImageSource(amenity.image) ? (
                  <img className="facility-manager__thumb" src={amenity.image} alt={amenity.name} />
                ) : null}
                <p>{amenity.description || 'No description added yet'}</p>
              </button>
            ))}
            {!availableAmenities.length ? <p className="empty-inline">No amenities have been created yet.</p> : null}
          </div>
        </div>

        <div className="facility-manager__column">
          <form
            className="stack"
            onSubmit={(event) => {
              event.preventDefault();
              onAssignAmenityToProject({
                amenityId: assignmentForm.amenityId,
                sortOrder: Number(assignmentForm.sortOrder || 0),
                notes: assignmentForm.notes || null,
              });
            }}
          >
            <div className="panel-head panel-head--compact">
              <h4>Assign to project</h4>
              <p>Pick an amenity for this project. No coordinates are needed.</p>
            </div>

            <select
              value={assignmentForm.amenityId}
              onChange={(e) => setAssignmentForm((current) => ({ ...current, amenityId: e.target.value }))}
              required
            >
              <option value="">Select amenity</option>
              {availableAmenities.map((amenity) => (
                <option key={amenity.id} value={amenity.id}>
                  {amenity.name}{assignedAmenityIds.has(amenity.id) ? ' (assigned)' : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder="Sort order"
              value={assignmentForm.sortOrder}
              onChange={(e) => setAssignmentForm((current) => ({ ...current, sortOrder: e.target.value }))}
            />
            <textarea
              className="text-area"
              placeholder="Notes"
              rows="3"
              value={assignmentForm.notes}
              onChange={(e) => setAssignmentForm((current) => ({ ...current, notes: e.target.value }))}
            />
            <button type="submit" disabled={busy || !assignmentForm.amenityId}>
              Assign to project
            </button>
          </form>

          <div className="project-facility-list">
            <div className="panel-head panel-head--compact">
              <h4>Assigned amenities</h4>
              <p>{assignedAmenities.length ? `${assignedAmenities.length} assignment(s) on this project` : 'No amenities assigned yet.'}</p>
            </div>

            {assignedAmenities.map((assignment) => (
              <article className="route-card" key={assignment.id}>
                <div className="route-card__header">
                  <div>
                    <span className="eyebrow">{assignment.amenity?.category}</span>
                    <h4>{assignment.amenity?.name}</h4>
                  </div>
                  <span className="chip">amenity</span>
                </div>
                {isImageSource(assignment.amenity?.image) ? (
                  <img className="facility-manager__thumb" src={assignment.amenity.image} alt={assignment.amenity?.name || 'Amenity'} />
                ) : null}
                <p>{joinNonEmpty([assignment.amenity?.description, assignment.notes]) || 'No notes available'}</p>
                <div className="action-row">
                  <button type="button" className="ghost danger" onClick={() => onDeleteProjectAmenity(assignment.id)} disabled={busy}>
                    Remove
                  </button>
                </div>
              </article>
            ))}

            {!assignedAmenities.length ? <p className="empty-inline">Assign an amenity to show it here.</p> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
