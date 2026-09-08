import React, { useEffect, useMemo, useState } from 'react';

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

function isVideoSource(value) {
  return typeof value === 'string' && (value.startsWith('data:video/') || /\.(mp4|webm|ogg)(\?.*)?$/i.test(value));
}

function joinNonEmpty(values) {
  return values.filter(Boolean).join(' · ');
}

function getProjectMainImage(project) {
  if (project?.coverImage && isImageSource(project.coverImage)) {
    return project.coverImage;
  }

  const gallery = Array.isArray(project?.gallery) ? project.gallery : [];
  return gallery.find(isImageSource) || '';
}

function collectBuildings(project) {
  return Array.isArray(project?.buildings) ? project.buildings : [];
}

function collectBuildingFloors(building) {
  return Array.isArray(building?.floors) ? building.floors : [];
}

function collectFloorUnits(floor) {
  return Array.isArray(floor?.units) ? floor.units : [];
}

function collectUnitMedia(unit) {
  const media = normalizeList(unit?.media);
  return media.filter(Boolean);
}

function getImageSource(value) {
  return isImageSource(value) ? value : '';
}

function findDefaultBuilding(project, selectedBuildingId) {
  const buildings = collectBuildings(project);
  return buildings.find((building) => building.id === selectedBuildingId) || buildings[0] || null;
}

function findDefaultFloor(building, selectedFloorId) {
  const floors = collectBuildingFloors(building);
  return floors.find((floor) => floor.id === selectedFloorId) || floors[0] || null;
}

function findDefaultUnit(floor, selectedUnitId) {
  const units = collectFloorUnits(floor);
  return units.find((unit) => unit.id === selectedUnitId) || units[0] || null;
}

function PublicActionBar({ project }) {
  const email = project?.developer?.email || 'sales@example.com';
  const phone = project?.developer?.phone || '';
  const projectName = project?.projectName || 'Project';

  return (
    <div className="public-learnmore__actions" aria-label="Project actions">
      <a className="public-learnmore__action" href={`mailto:${email}?subject=${encodeURIComponent(`${projectName} enquiry`)}`}>
        Contact
      </a>
      <a className="public-learnmore__action" href={`mailto:${email}?subject=${encodeURIComponent(`${projectName} visit request`)}`}>
        Visit
      </a>
      <a className="public-learnmore__action" href={phone ? `tel:${phone}` : `mailto:${email}?subject=${encodeURIComponent(`${projectName} booking request`)}`}>
        Booking
      </a>
    </div>
  );
}

export default function PublicProjectLearnMoreV2({ project, onHome, onBack }) {
  const buildings = useMemo(() => collectBuildings(project), [project]);
  const [selectedBuildingId, setSelectedBuildingId] = useState('');
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [selectedGalleryIndex, setSelectedGalleryIndex] = useState(0);
  const [previewMode, setPreviewMode] = useState('floor');

  const selectedBuilding = useMemo(
    () => findDefaultBuilding(project, selectedBuildingId),
    [project, selectedBuildingId],
  );

  const selectedFloor = useMemo(
    () => findDefaultFloor(selectedBuilding, selectedFloorId),
    [selectedBuilding, selectedFloorId],
  );

  const selectedUnit = useMemo(
    () => findDefaultUnit(selectedFloor, selectedUnitId),
    [selectedFloor, selectedUnitId],
  );

  const mainImage = getProjectMainImage(project);
  const floorImage = getImageSource(selectedFloor?.floorPlan);
  const unitLayoutImage = getImageSource(selectedUnit?.layoutPlan);
  const unitGalleryImages = useMemo(() => collectUnitMedia(selectedUnit).filter(isImageSource), [selectedUnit]);
  const activeMedia =
    previewMode === 'gallery'
      ? unitGalleryImages[selectedGalleryIndex] || unitLayoutImage || floorImage || mainImage
      : previewMode === 'unit'
        ? unitLayoutImage || floorImage || mainImage
        : floorImage || unitLayoutImage || mainImage;
  const floorOptions = collectBuildingFloors(selectedBuilding);
  const unitOptions = collectFloorUnits(selectedFloor);

  useEffect(() => {
    if (!buildings.length) {
      return;
    }

    if (!selectedBuildingId || !buildings.some((building) => building.id === selectedBuildingId)) {
      setSelectedBuildingId(buildings[0].id);
      return;
    }

    const nextBuilding = buildings.find((building) => building.id === selectedBuildingId) || buildings[0];
    const floors = collectBuildingFloors(nextBuilding);
    if (!floors.length) {
      setSelectedFloorId('');
      setSelectedUnitId('');
      return;
    }

    if (!selectedFloorId || !floors.some((floor) => floor.id === selectedFloorId)) {
      setSelectedFloorId(floors[0].id);
    }
  }, [buildings, selectedBuildingId, selectedFloorId]);

  useEffect(() => {
    if (!selectedFloor) {
      setSelectedUnitId('');
      setPreviewMode('floor');
      return;
    }

    const units = collectFloorUnits(selectedFloor);
    if (!units.length) {
      setSelectedUnitId('');
      setPreviewMode('floor');
      return;
    }

    if (selectedUnitId && !units.some((unit) => unit.id === selectedUnitId)) {
      setSelectedUnitId('');
    }
  }, [selectedFloor, selectedUnitId]);

  useEffect(() => {
    setSelectedGalleryIndex(0);
  }, [selectedUnitId]);

  useEffect(() => {
    if (selectedUnitId) {
      setPreviewMode('unit');
      return;
    }

    if (selectedFloorId) {
      setPreviewMode('floor');
      return;
    }

    setPreviewMode('floor');
  }, [selectedUnitId, selectedFloorId]);

  if (!project) {
    return (
      <div className="public-learnmore-page">
        <div className="public-learnmore-page__nav">
          {onBack ? (
            <button type="button" className="public-learnmore-page__back" onClick={onBack}>
              ← Map menu
            </button>
          ) : null}
          <button type="button" className="public-learnmore-page__home" onClick={onHome}>
            Home
          </button>
        </div>
        <div className="panel public-learnmore-page__loading">
          <h3>Loading project</h3>
          <p>Please wait while the project detail view is prepared.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="public-learnmore-page">
      <div className="public-learnmore-page__nav">
        {onBack ? (
          <button type="button" className="public-learnmore-page__back" onClick={onBack}>
            ← Map menu
          </button>
        ) : null}
        <button type="button" className="public-learnmore-page__home" onClick={onHome}>
          Home
        </button>
      </div>

      <header className="public-learnmore-page__header panel">
        <div>
          <p className="eyebrow">Project spotlight</p>
          <h2>{project.projectName}</h2>
          <p>{joinNonEmpty([project.projectCode, project.projectType, project.city, project.country])}</p>
        </div>
        <div className="public-learnmore-page__summary">
          <span>{project.status}</span>
          <span>{project.startingPrice ? `From ${project.startingPrice}` : 'Price on request'}</span>
        </div>
      </header>

      <section className="public-learnmore-shell">
        <aside className="public-learnmore-shell__left">
          <article className="panel public-learnmore-card public-learnmore-card--main">
            <div className="panel-head panel-head--compact">
              <h3>Main image</h3>
              <p>Saved from the admin side as the project cover image.</p>
            </div>
            {mainImage ? (
              <img className="public-learnmore-card__image" src={mainImage} alt={`${project.projectName} main`} />
            ) : (
              <div className="public-learnmore-card__empty">No main image has been added yet.</div>
            )}
          </article>

          <article className="panel public-learnmore-card">
            <div className="panel-head panel-head--compact">
              <h3>Floor and unit</h3>
              <p>Select a floor, then a unit to browse its gallery views.</p>
            </div>

            <div className="public-learnmore-form">
              <label>
                <span>Building</span>
                <select
                  value={selectedBuilding?.id || ''}
                  onChange={(event) => {
                    setSelectedBuildingId(event.target.value);
                    setSelectedFloorId('');
                    setSelectedUnitId('');
                    setSelectedGalleryIndex(0);
                    setPreviewMode('floor');
                  }}
                  disabled={!buildings.length}
                >
                  <option value="">{buildings.length ? 'Select building' : 'No buildings available'}</option>
                  {buildings.map((building) => (
                    <option key={building.id} value={building.id}>
                      {joinNonEmpty([building.buildingCode, building.buildingName]) || building.buildingName}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Floor</span>
                <select
                  value={selectedFloor?.id || ''}
                  onChange={(event) => {
                    setSelectedFloorId(event.target.value);
                    setSelectedUnitId('');
                    setSelectedGalleryIndex(0);
                    setPreviewMode('floor');
                  }}
                  disabled={!floorOptions.length}
                >
                  <option value="">{floorOptions.length ? 'Select floor' : 'No floors available'}</option>
                  {floorOptions.map((floor) => (
                    <option key={floor.id} value={floor.id}>
                      {floor.floorName ? `${floor.floorName} · ` : ''}Floor {floor.floorNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Unit</span>
                <select
                  value={selectedUnit?.id || ''}
                  onChange={(event) => {
                    setSelectedUnitId(event.target.value);
                    setSelectedGalleryIndex(0);
                    setPreviewMode(event.target.value ? 'unit' : 'floor');
                  }}
                  disabled={!unitOptions.length}
                >
                  <option value="">{unitOptions.length ? 'Select unit' : 'No units available'}</option>
                  {unitOptions.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {joinNonEmpty([unit.unitCode, unit.unitNumber]) || unit.unitNumber}
                    </option>
                  ))}
                </select>
              </label>

              {selectedUnit ? (
                <div className="public-learnmore-summary">
                  <strong>{selectedUnit.unitNumber}</strong>
                  <span>{joinNonEmpty([selectedUnit.unitCode, selectedUnit.unitType, `Floor ${selectedFloor?.floorNumber || ''}`])}</span>
                  <small>{unitGalleryImages.length ? `${unitGalleryImages.length} gallery view(s)` : 'No unit gallery uploaded yet'}</small>
                </div>
              ) : (
                <div className="public-learnmore-card__empty">Choose a unit to view its gallery.</div>
              )}
            </div>
          </article>
        </aside>

        <section className="panel public-learnmore-shell__viewer">
          <div className="public-learnmore-tabs" role="tablist" aria-label="Project preview tabs">
            <button
              type="button"
              className={previewMode === 'floor' ? 'is-active' : ''}
              onClick={() => setPreviewMode('floor')}
            >
              Floor
            </button>
            <button
              type="button"
              className={previewMode === 'unit' ? 'is-active' : ''}
              onClick={() => setPreviewMode('unit')}
              disabled={!selectedUnit && !unitLayoutImage}
            >
              Unit
            </button>
            <button
              type="button"
              className={previewMode === 'gallery' ? 'is-active' : ''}
              onClick={() => setPreviewMode('gallery')}
              disabled={!selectedUnit || !unitGalleryImages.length}
            >
              Gallery
            </button>
          </div>

          <div className="public-learnmore-viewer">
            {activeMedia ? (
              isVideoSource(activeMedia) ? (
                <video className="public-learnmore-viewer__media" src={activeMedia} controls playsInline autoPlay muted />
              ) : (
                <img className="public-learnmore-viewer__media" src={activeMedia} alt={selectedUnit ? `${selectedUnit.unitNumber} gallery` : project.projectName} />
              )
            ) : (
              <div className="public-learnmore-viewer__empty">Pick a floor and unit to reveal gallery views.</div>
            )}

            <PublicActionBar project={project} />
          </div>

          {previewMode === 'floor' && floorImage ? (
            <div className="public-learnmore-thumbs">
              <button type="button" className="public-learnmore-thumb public-learnmore-thumb--active">
                <img src={floorImage} alt="Floor plan thumbnail" />
                <span>Floor plan</span>
              </button>
            </div>
          ) : null}

          {previewMode === 'unit' && unitLayoutImage ? (
            <div className="public-learnmore-thumbs">
              <button type="button" className="public-learnmore-thumb public-learnmore-thumb--active">
                <img src={unitLayoutImage} alt="Unit layout thumbnail" />
                <span>Unit layout</span>
              </button>
            </div>
          ) : null}

          {previewMode === 'gallery' && selectedUnit && unitGalleryImages.length ? (
            <div className="public-learnmore-strip" aria-label="Gallery thumbnails">
              {unitGalleryImages.map((item, index) => (
                <button
                  type="button"
                  key={`${selectedUnit?.id || 'unit'}-${index}`}
                  className={`public-learnmore-thumb ${index === selectedGalleryIndex ? 'public-learnmore-thumb--active' : ''}`}
                  onClick={() => {
                    setSelectedGalleryIndex(index);
                    setPreviewMode('gallery');
                  }}
                >
                  <img src={item} alt={`Gallery view ${index + 1} thumbnail`} />
                  <span>View {index + 1}</span>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
