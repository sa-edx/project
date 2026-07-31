import React, { useEffect, useMemo, useState } from 'react';
import { createLead } from '../api.js';
import MapStoreStaticMap from './MapStoreStaticMap.jsx';

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
  return values.filter(Boolean).join(' | ');
}

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
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

function getCounts(project) {
  const buildings = project?.buildings || [];
  const floors = buildings.reduce((sum, building) => sum + (building.floors?.length || 0), 0);
  const units = buildings.reduce(
    (sum, building) => sum + (building.floors || []).reduce((floorSum, floor) => floorSum + (floor.units?.length || 0), 0),
    0,
  );

  return { buildings: buildings.length, floors, units };
}

function getFloorPlans(project) {
  return (project?.buildings || []).flatMap((building, buildingIndex) =>
    (building.floors || []).map((floor, floorIndex) => {
      const units = floor.units || [];
      const featuredUnit = units.find((unit) => unit.featured) || units[0] || null;

      return {
        id: floor.id,
        buildingName: building.buildingName,
        buildingCode: building.buildingCode,
        buildingType: building.buildingType,
        buildingStatus: building.status,
        floor,
        floorLabel: floor.floorName || `Floor ${floor.floorNumber}`,
        planLabel: isImageSource(floor.floorPlan)
          ? 'Floor plan image'
          : floor.floorPlan
            ? 'Floor plan link'
            : `Plan ${String(buildingIndex + 1).padStart(2, '0')}-${String(floorIndex + 1).padStart(2, '0')}`,
        featuredUnit,
        unitCount: units.length,
      };
    }),
  );
}

function collectProjectGallery(project) {
  const gallery = Array.isArray(project?.gallery) ? project.gallery.filter(Boolean) : [];
  const coverImage = project?.coverImage && isImageSource(project.coverImage) ? project.coverImage : '';
  const ordered = coverImage ? [coverImage, ...gallery.filter((item) => item !== coverImage)] : gallery;

  return ordered
    .filter(isImageSource)
    .map((src, index) => ({
      id: `project-gallery-${index}`,
      src,
      title: `${project.projectName} image ${index + 1}`,
      subtitle: project.developer?.companyName || 'Project gallery',
      kind: index === 0 ? 'Cover image' : 'Project gallery',
    }));
}

function collectProjectUnits(project) {
  return (project?.buildings || []).flatMap((building) =>
    (building.floors || []).flatMap((floor) =>
      (floor.units || []).map((unit) => ({
        id: unit.id,
        floorId: floor.id,
        buildingName: building.buildingName,
        buildingCode: building.buildingCode,
        floorNumber: floor.floorNumber,
        floorName: floor.floorName,
        unitNumber: unit.unitNumber,
        unitCode: unit.unitCode,
        unitType: unit.unitType,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        area: unit.area,
        basePrice: unit.basePrice,
        currency: unit.currency,
        status: unit.status,
        featured: unit.featured,
        viewType: unit.viewType,
        layoutPlan: unit.layoutPlan,
        media: normalizeList(unit.media),
        amenities: normalizeList(unit.amenities),
      })),
    ),
  );
}

function collectMediaCarouselItems(project) {
  const floorImages = (project?.buildings || []).flatMap((building) =>
    (building.floors || []).flatMap((floor) =>
      isImageSource(floor.floorPlan)
        ? [
            {
              id: `floor-${floor.id}`,
              src: floor.floorPlan,
              title: `${building.buildingName} - Floor ${floor.floorNumber}`,
              subtitle: floor.floorName || 'Floor plan',
              kind: 'Floor plan',
            },
          ]
        : [],
    ),
  );

  const unitImages = collectProjectUnits(project).flatMap((unit) =>
    isImageSource(unit.layoutPlan)
      ? [
          {
            id: `unit-layout-${unit.id}`,
            src: unit.layoutPlan,
            title: `${unit.unitNumber} layout plan`,
            subtitle: `${unit.buildingName} - Floor ${unit.floorNumber}`,
            kind: 'Unit layout',
          },
        ]
      : [],
  );

  const galleryImages = collectProjectUnits(project).flatMap((unit) =>
    unit.media
      .filter(isImageSource)
      .map((media, index) => ({
        id: `unit-${unit.id}-${index}`,
        src: media,
        title: `${unit.unitNumber} media ${index + 1}`,
        subtitle: `${unit.buildingName} - Floor ${unit.floorNumber}`,
        kind: 'Gallery view',
      })),
  );

  return [...floorImages, ...unitImages, ...galleryImages];
}

function getNearbyDestinations(project) {
  return (project?.nearbyDestinations || [])
    .slice()
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }

      return String(left.label || '').localeCompare(String(right.label || ''));
    });
}

function getProjectFacilities(project) {
  return (project?.projectFacilities || [])
    .slice()
    .sort((left, right) => {
      if ((left.sortOrder || 0) !== (right.sortOrder || 0)) {
        return (left.sortOrder || 0) - (right.sortOrder || 0);
      }

      return String(left.facility?.name || '').localeCompare(String(right.facility?.name || ''));
    });
}

function parseCoordinate(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getFacilityMapPoints(project, assignments) {
  const points = [];
  const projectLatitude = parseCoordinate(project?.latitude);
  const projectLongitude = parseCoordinate(project?.longitude);

  if (projectLatitude !== null && projectLongitude !== null) {
    points.push({
      id: `project-${project.id}`,
      label: project.projectName,
      kind: 'project',
      latitude: projectLatitude,
      longitude: projectLongitude,
    });
  }

  for (const assignment of assignments) {
    const latitude = parseCoordinate(assignment.facility?.latitude);
    const longitude = parseCoordinate(assignment.facility?.longitude);
    if (latitude === null || longitude === null) {
      continue;
    }

    points.push({
      id: assignment.id,
      label: assignment.facility?.name || 'Facility',
      kind: 'facility',
      latitude,
      longitude,
    });
  }

  return points;
}

function LocationMapPreview({ project, assignments }) {
  const points = getFacilityMapPoints(project, assignments);

  if (!points.length) {
    return <div className="location-map location-map--empty">Set coordinates to preview the project and facilities on the map.</div>;
  }

  return (
    <div className="location-map">
      <MapStoreStaticMap points={points} />
      <div className="location-map__legend">
        {points.map((marker) => (
          <div className="location-map__legend-item" key={marker.id}>
            <span className={`location-map__dot ${marker.kind === 'project' ? 'location-map__dot--project' : ''}`} />
            <span>{marker.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function createLeadForm(project, unit) {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: project?.country || '',
    city: project?.city || '',
    preferredLanguage: '',
    notes: '',
    visitRequested: false,
    preferredVisitAt: '',
    source: 'project-detail-enquiry',
    projectName: project?.projectName || '',
    unitNumber: unit?.unitNumber || '',
  };
}

function ProjectVisual({ project, counts }) {
  const location = joinNonEmpty([project.city, project.country]);

  return (
    <div className="hero-visual-card">
      <div className="hero-visual-card__top">
        <span className="eyebrow">Live snapshot</span>
        <strong>{project.projectType}</strong>
      </div>

      <div className="hero-visual-art" aria-hidden="true">
        <div className="hero-visual-art__tower hero-visual-art__tower--tall" />
        <div className="hero-visual-art__tower hero-visual-art__tower--medium" />
        <div className="hero-visual-art__tower hero-visual-art__tower--short" />
      </div>

      <div className="hero-visual-stack">
        <div>
          <span>Project code</span>
          <strong>{project.projectCode}</strong>
        </div>
        <div>
          <span>Location</span>
          <strong>{location || 'Location pending'}</strong>
        </div>
      </div>

      <div className="hero-visual-metrics">
        <div>
          <span>Buildings</span>
          <strong>{counts.buildings}</strong>
        </div>
        <div>
          <span>Floors</span>
          <strong>{counts.floors}</strong>
        </div>
        <div>
          <span>Units</span>
          <strong>{counts.units}</strong>
        </div>
      </div>
    </div>
  );
}

function GalleryCard({ title, copy, accent, footer }) {
  return (
    <article className="gallery-card">
      <div className={`gallery-card__art gallery-card__art--${accent}`} />
      <div className="gallery-card__body">
        <span className="eyebrow">{title}</span>
        <p>{copy}</p>
        {footer ? <small>{footer}</small> : null}
      </div>
    </article>
  );
}

function MediaCarousel({ items, title, description }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  if (!items.length) {
    return null;
  }

  const activeItem = items[activeIndex] || items[0];

  function step(direction) {
    setActiveIndex((current) => (current + direction + items.length) % items.length);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>

      <div className="media-carousel">
        <div className="media-carousel__stage">
          <button type="button" className="media-carousel__nav" onClick={() => step(-1)} aria-label="Previous image">
            Prev
          </button>
          <div className="media-carousel__frame">
            <img src={activeItem.src} alt={activeItem.title} />
          </div>
          <button type="button" className="media-carousel__nav" onClick={() => step(1)} aria-label="Next image">
            Next
          </button>
        </div>

        <div className="media-carousel__meta">
          <span className="eyebrow">{activeItem.kind}</span>
          <h4>{activeItem.title}</h4>
          <p>{activeItem.subtitle}</p>
          <small>
            {activeIndex + 1} of {items.length}
          </small>
        </div>

        <div className="media-carousel__thumbs">
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`media-carousel__thumb ${index === activeIndex ? 'media-carousel__thumb--active' : ''}`}
              onClick={() => setActiveIndex(index)}
            >
              <img src={item.src} alt={item.title} />
              <span>{item.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function UnitDetailCard({ unit, project, onEnquire }) {
  const floorAnchor = `#floor-${unit.floorId}`;

  return (
    <article className="unit-detail-card">
      <div className="unit-detail-card__header">
        <div>
          <span className="eyebrow">{unit.buildingName}</span>
          <h4>{unit.unitNumber}</h4>
          <p>{joinNonEmpty([unit.unitCode, unit.unitType, `Floor ${unit.floorNumber}`])}</p>
        </div>
        <div className="unit-detail-card__price">
          <strong>{formatMoney(unit.basePrice, unit.currency)}</strong>
          <span className="chip">{unit.status}</span>
        </div>
      </div>

      <div className="unit-detail-card__facts">
        <span>{unit.bedrooms} BR</span>
        <span>{unit.bathrooms} BA</span>
        <span>{unit.area ? `${unit.area} sqm` : 'Area pending'}</span>
        <span>{unit.viewType || 'View not set'}</span>
      </div>

      {isImageSource(unit.layoutPlan) ? (
        <div className="unit-detail-card__layout">
          <strong>Unit layout plan</strong>
          <img src={unit.layoutPlan} alt={`${unit.unitNumber} layout plan`} />
        </div>
      ) : null}

      {unit.mediaThumbs.length ? (
        <div className="unit-detail-card__thumbs">
          {unit.mediaThumbs.map((media, index) => (
            <img key={`${unit.id}-thumb-${index}`} src={media} alt={`${unit.unitNumber} media ${index + 1}`} />
          ))}
        </div>
      ) : (
        <div className="unit-detail-card__thumbs unit-detail-card__thumbs--empty">
          <span>No media uploaded yet</span>
        </div>
      )}

      <div className="unit-detail-card__amenities">
        {unit.amenitySnippets.length ? (
          unit.amenitySnippets.map((amenity) => (
            <span className="tag" key={`${unit.id}-${amenity}`}>
              {amenity}
            </span>
          ))
        ) : (
          <span className="tag">No amenities set</span>
        )}
      </div>

      <div className="unit-detail-card__actions">
        <button type="button" className="ghost unit-detail-card__action" onClick={() => onEnquire(unit)}>
          Enquire
        </button>
        <a className="ghost unit-detail-card__action" href={floorAnchor}>
          View floor plan
        </a>
      </div>
    </article>
  );
}

function NearbyDestinationCard({ destination }) {
  const routeLabel = `${destination.distanceKm} km | ${destination.travelMinutes} min`;
  const coordinates = joinNonEmpty([destination.latitude, destination.longitude]);

  return (
    <article className="route-card">
      <div className="route-card__header">
        <div>
          <span className="eyebrow">{destination.category}</span>
          <h4>{destination.label}</h4>
        </div>
        <span className="chip">{destination.mode}</span>
      </div>
      <strong>{routeLabel}</strong>
      {coordinates ? <small>POI coordinates: {coordinates}</small> : null}
      {destination.notes ? <p>{destination.notes}</p> : null}
    </article>
  );
}

function FacilityCard({ assignment }) {
  return (
    <article className="route-card">
      <div className="route-card__header">
        <div>
          <span className="eyebrow">{assignment.facility?.category}</span>
          <h4>{assignment.facility?.name}</h4>
        </div>
        <span className="chip">{assignment.mode}</span>
      </div>
      <strong>{assignment.distanceKm} km | {assignment.travelMinutes} min</strong>
      <p>{joinNonEmpty([assignment.facility?.address, assignment.notes]) || 'No additional notes available.'}</p>
      {assignment.facility?.description ? <p>{assignment.facility.description}</p> : null}
    </article>
  );
}

function EnquiryDrawer({ project, unit, onClose }) {
  const [leadForm, setLeadForm] = useState(() => createLeadForm(project, unit));
  const [submittingLead, setSubmittingLead] = useState(false);
  const [leadMessage, setLeadMessage] = useState('');
  const [leadError, setLeadError] = useState('');
  const enquiryEmail = project?.developer?.email || 'sales@example.com';
  const enquirySubject = `${project.projectName} - ${unit.unitNumber} enquiry`;
  const mailto = `mailto:${enquiryEmail}?subject=${encodeURIComponent(enquirySubject)}&body=${encodeURIComponent(
    `Hello, I am interested in ${project.projectName} ${unit.unitNumber}.\n\nUnit code: ${unit.unitCode}\nFloor: ${unit.floorNumber}\nPrice: ${formatMoney(unit.basePrice, unit.currency)}\n\nPlease share availability and next steps.`,
  )}`;

  useEffect(() => {
    setLeadForm(createLeadForm(project, unit));
    setLeadMessage('');
    setLeadError('');
  }, [project, unit]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmittingLead(true);
    setLeadError('');
    setLeadMessage('');

    try {
      await createLead({
        projectId: project.id,
        unitId: unit.id,
        source: leadForm.source || 'project-detail-enquiry',
        firstName: leadForm.firstName.trim(),
        lastName: leadForm.lastName.trim() || null,
        email: leadForm.email.trim() || null,
        phone: leadForm.phone.trim() || null,
        country: leadForm.country.trim() || null,
        city: leadForm.city.trim() || null,
        preferredLanguage: leadForm.preferredLanguage.trim() || null,
        notes: leadForm.notes.trim() || null,
        visitRequested: Boolean(leadForm.visitRequested),
        preferredVisitAt: leadForm.visitRequested && leadForm.preferredVisitAt ? leadForm.preferredVisitAt : null,
      });

      setLeadMessage('Thanks. Your enquiry has been sent to the sales team.');
      onLeadSubmitted?.();
      setLeadForm((current) => ({
        ...current,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        preferredLanguage: '',
        notes: '',
        visitRequested: false,
        preferredVisitAt: '',
      }));
    } catch (submitError) {
      setLeadError(submitError.payload?.message || submitError.message || 'Failed to submit enquiry');
    } finally {
      setSubmittingLead(false);
    }
  }

  return (
    <div className="enquiry-drawer" role="dialog" aria-modal="true" aria-label="Unit enquiry drawer">
      <button type="button" className="enquiry-drawer__backdrop" onClick={onClose} aria-label="Close enquiry drawer" />
      <aside className="enquiry-drawer__panel">
        <div className="enquiry-drawer__header">
          <div>
            <span className="eyebrow">Enquire now</span>
            <h3>{unit.unitNumber}</h3>
            <p>{joinNonEmpty([project.projectName, unit.unitCode, `Floor ${unit.floorNumber}`])}</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="enquiry-drawer__summary">
          <strong>{formatMoney(unit.basePrice, unit.currency)}</strong>
          <p>
            {unit.bedrooms} BR | {unit.bathrooms} BA | {unit.area ? `${unit.area} sqm` : 'Area pending'}
          </p>
          <p>{unit.viewType || 'View not set'}</p>
        </div>

        <div className="enquiry-drawer__contact">
          <span className="eyebrow">Contact</span>
          <h4>{project.developer?.companyName || 'Sales team'}</h4>
          <p>{enquiryEmail}</p>
          {project.developer?.phone ? <p>{project.developer.phone}</p> : null}
        </div>

        <div className="enquiry-drawer__body">
          {leadMessage ? <p className="success-text">{leadMessage}</p> : <p>This drawer captures a real lead and can optionally request a site visit.</p>}
          {leadError ? <p className="error-text">{leadError}</p> : null}
        </div>

        {!leadMessage ? (
          <form className="enquiry-form" onSubmit={handleSubmit}>
            <div className="split">
              <input
                required
                placeholder="First name"
                value={leadForm.firstName}
                onChange={(e) => setLeadForm((current) => ({ ...current, firstName: e.target.value }))}
              />
              <input
                placeholder="Last name"
                value={leadForm.lastName}
                onChange={(e) => setLeadForm((current) => ({ ...current, lastName: e.target.value }))}
              />
            </div>
            <div className="split">
              <input
                type="email"
                placeholder="Email"
                value={leadForm.email}
                onChange={(e) => setLeadForm((current) => ({ ...current, email: e.target.value }))}
              />
              <input
                placeholder="Phone"
                value={leadForm.phone}
                onChange={(e) => setLeadForm((current) => ({ ...current, phone: e.target.value }))}
              />
            </div>
            <div className="split">
              <input
                placeholder="Country"
                value={leadForm.country}
                onChange={(e) => setLeadForm((current) => ({ ...current, country: e.target.value }))}
              />
              <input
                placeholder="City"
                value={leadForm.city}
                onChange={(e) => setLeadForm((current) => ({ ...current, city: e.target.value }))}
              />
            </div>
            <div className="split">
              <input
                placeholder="Preferred language"
                value={leadForm.preferredLanguage}
                onChange={(e) => setLeadForm((current) => ({ ...current, preferredLanguage: e.target.value }))}
              />
              <input
                type="date"
                value={leadForm.preferredVisitAt}
                onChange={(e) => setLeadForm((current) => ({ ...current, preferredVisitAt: e.target.value }))}
                disabled={!leadForm.visitRequested}
              />
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={leadForm.visitRequested}
                onChange={(e) =>
                  setLeadForm((current) => ({
                    ...current,
                    visitRequested: e.target.checked,
                  }))
                }
              />
              Request a site visit
            </label>
            <textarea
              className="text-area"
              placeholder="Anything the sales team should know?"
              value={leadForm.notes}
              onChange={(e) => setLeadForm((current) => ({ ...current, notes: e.target.value }))}
            />

            <div className="enquiry-drawer__actions">
              <button type="submit" disabled={submittingLead}>
                {submittingLead ? 'Submitting...' : 'Submit enquiry'}
              </button>
              <a className="ghost" href={mailto}>
                Send email
              </a>
              {project.developer?.phone ? (
                <a className="ghost" href={`tel:${project.developer.phone}`}>
                  Call now
                </a>
              ) : null}
            </div>
          </form>
        ) : (
          <div className="enquiry-drawer__actions">
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function ProjectDetailV2({ project, onLeadSubmitted }) {
  const [enquiryUnit, setEnquiryUnit] = useState(null);
  const counts = getCounts(project);
  const floorPlans = getFloorPlans(project);
  const nearbyDestinations = getNearbyDestinations(project);
  const projectFacilities = getProjectFacilities(project);
  const projectGallery = collectProjectGallery(project);
  const carouselItems = collectMediaCarouselItems(project);
  const unitDetails = useMemo(
    () =>
      collectProjectUnits(project).map((unit) => ({
        ...unit,
        layoutPlanImage: isImageSource(unit.layoutPlan) ? unit.layoutPlan : '',
        mediaThumbs: unit.media.filter(isImageSource).slice(0, 3),
        amenitySnippets: unit.amenities.slice(0, 6),
      })),
    [project],
  );
  const galleryCards = [
    {
      title: 'Aerial view',
      copy: 'A composition tile for the skyline presence and overall project silhouette.',
      accent: 'gold',
      footer: joinNonEmpty([project?.city, project?.country]),
    },
    {
      title: 'Arrival sequence',
      copy: 'A premium visual treatment for the lobby and amenity experience.',
      accent: 'teal',
      footer: project?.developer?.companyName || 'Developer pending',
    },
    {
      title: 'Unit collection',
      copy: 'Highlights the mix of available homes across buildings and floors.',
      accent: 'slate',
      footer: `${counts.units} units configured`,
    },
  ];

  if (!project) {
    return (
      <div className="empty-state">
        <h3>Select a project</h3>
        <p>Pick a project from the list to inspect its detail page.</p>
      </div>
    );
  }

  return (
    <div className="detail-stack">
      <section className="detail-hero panel">
        <div className="detail-hero__copy">
          <p className="eyebrow">Project detail</p>
          <h2>{project.projectName}</h2>
          <p className="lead">{project.description || 'No description has been added yet.'}</p>
          <div className="tag-row">
            <span className="tag">{project.projectType}</span>
            <span className="tag">{project.status}</span>
            <span className="tag">{joinNonEmpty([project.city, project.country])}</span>
          </div>

          <div className="detail-facts">
            <div>
              <span>Developer</span>
              <strong>{project.developer?.companyName || 'N/A'}</strong>
            </div>
            <div>
              <span>Starting Price</span>
              <strong>{formatMoney(project.startingPrice, 'AED')}</strong>
            </div>
            <div>
              <span>Address</span>
              <strong>{project.address || 'Address pending'}</strong>
            </div>
            <div>
              <span>Structure</span>
              <strong>
                {counts.buildings} buildings | {counts.floors} floors | {counts.units} units
              </strong>
            </div>
          </div>
        </div>

        <ProjectVisual project={project} counts={counts} />
      </section>

      <MediaCarousel items={projectGallery} title="Project gallery" description="Uploaded project images from the admin editor." />

      <MediaCarousel
        items={carouselItems}
        title="Floor plans and unit media"
        description="Browse uploaded floor-plan images and unit visuals from the admin side."
      />

      <section className="panel">
        <div className="panel-head">
          <h3>Interactive route guidance</h3>
          <p>Nearby destinations are entered as POI coordinates, then the distance and travel time are calculated from the project location.</p>
        </div>

        <div className="route-guidance">
          {nearbyDestinations.map((destination) => (
            <NearbyDestinationCard key={destination.id} destination={destination} />
          ))}
          {!nearbyDestinations.length ? <div className="empty-inline">No nearby destinations have been added yet.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Project amenities and facilities</h3>
          <p>Facilities are assigned from the admin catalog and plotted from real coordinates.</p>
        </div>

        <div className="route-guidance">
          {projectFacilities.map((assignment) => (
            <FacilityCard key={assignment.id} assignment={assignment} />
          ))}
          {!projectFacilities.length ? <div className="empty-inline">No facilities have been assigned to this project yet.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Map-based location</h3>
          <p>A lightweight location map showing the project and assigned facilities from their coordinates.</p>
        </div>

        <LocationMapPreview project={project} assignments={projectFacilities} />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Gallery</h3>
          <p>These tiles give the project page a richer editorial feel while remaining data-driven.</p>
        </div>

        <div className="gallery-grid">
          {galleryCards.map((card) => (
            <GalleryCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Unit detail cards</h3>
          <p>Each unit now shows media previews, amenities, and quick actions for enquiry and floor-plan lookup.</p>
        </div>

        <div className="unit-detail-grid">
          {unitDetails.map((unit) => (
            <UnitDetailCard key={unit.id} unit={unit} project={project} onEnquire={setEnquiryUnit} />
          ))}
          {!unitDetails.length ? <div className="empty-inline">No units have been configured yet.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Floor plan cards</h3>
          <p>Each floor is presented as a dedicated card with its unit mix and key configuration details.</p>
        </div>

        <div className="floor-plan-grid">
          {floorPlans.map(({ id, buildingName, buildingCode, buildingType, buildingStatus, floor, floorLabel, planLabel, featuredUnit, unitCount }) => (
            <article className="floor-plan-card" key={id} id={`floor-${id}`}>
              <div className="floor-plan-card__header">
                <div>
                  <span className="eyebrow">{buildingName}</span>
                  <h4>{floorLabel}</h4>
                  <p>{joinNonEmpty([buildingCode, buildingType])}</p>
                </div>
                <span className="chip">{buildingStatus}</span>
              </div>

              <div className="floor-plan-card__plan">
                {isImageSource(floor.floorPlan) ? (
                  <div className="floor-plan-preview floor-plan-preview--public">
                    <img src={floor.floorPlan} alt={`${buildingName} floor ${floor.floorNumber} plan`} />
                  </div>
                ) : floor.floorPlan ? (
                  <a className="floor-plan-link" href={floor.floorPlan} target="_blank" rel="noreferrer">
                    Open floor plan
                  </a>
                ) : (
                  <div className="floor-plan-placeholder">
                    <div className="floor-plan-placeholder__shape floor-plan-placeholder__shape--main" />
                    <div className="floor-plan-placeholder__shape floor-plan-placeholder__shape--accent" />
                    <div className="floor-plan-placeholder__shape floor-plan-placeholder__shape--line" />
                  </div>
                )}

                <div className="floor-plan-card__meta">
                  <div>
                    <span>Plan</span>
                    <strong>{planLabel}</strong>
                  </div>
                  <div>
                    <span>Floor status</span>
                    <strong>{floor.status}</strong>
                  </div>
                  <div>
                    <span>Display order</span>
                    <strong>{floor.displayOrder ?? '0'}</strong>
                  </div>
                  <div>
                    <span>Units</span>
                    <strong>{unitCount}</strong>
                  </div>
                  <div>
                    <span>Featured unit</span>
                    <strong>{featuredUnit ? `${featuredUnit.unitNumber} ${formatMoney(featuredUnit.basePrice, featuredUnit.currency)}` : 'None set'}</strong>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {!floorPlans.length ? <div className="empty-inline">No floor plans have been configured yet.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Buildings, floors and units</h3>
          <p>Visitors can browse the exact nested inventory the admin team configured.</p>
        </div>

        <div className="structure-list">
          {(project.buildings || []).map((building) => (
            <article className="structure-card" key={building.id}>
              <div className="structure-card__header">
                <div>
                  <h4>{building.buildingName}</h4>
                  <p>{joinNonEmpty([building.buildingCode, building.buildingType])}</p>
                </div>
                <span className="chip">{building.status}</span>
              </div>

              <div className="floor-stack">
                {(building.floors || []).map((floor) => (
                  <div className="floor-card" key={floor.id}>
                    <div className="floor-card__header">
                      <div>
                        <strong>Floor {floor.floorNumber}</strong>
                        <p>{floor.floorName || 'Unnamed floor'}</p>
                      </div>
                      <span className="chip">{floor.status}</span>
                    </div>

                    <div className="unit-grid">
                      {(floor.units || []).map((unit) => (
                        <article className="unit-card" key={unit.id}>
                          <strong>{unit.unitNumber}</strong>
                          <span>{unit.unitCode}</span>
                          <small>
                            {unit.bedrooms} BR | {unit.bathrooms} BA
                          </small>
                          <small>{formatMoney(unit.basePrice, unit.currency)}</small>
                          <small>{unit.status}</small>
                          <small>{unit.media?.length ? `${unit.media.length} media item(s)` : 'No media set'}</small>
                          <small>{unit.amenities?.length ? `${unit.amenities.length} amenities` : 'No amenities set'}</small>
                        </article>
                      ))}
                      {!floor.units?.length ? <p className="empty-inline">No units yet.</p> : null}
                    </div>
                  </div>
                ))}
                {!building.floors?.length ? <p className="empty-inline">No floors yet.</p> : null}
              </div>
            </article>
          ))}

          {!project.buildings?.length ? <p className="empty-inline">This project has no buildings yet.</p> : null}
        </div>
      </section>

      {enquiryUnit ? <EnquiryDrawer project={project} unit={enquiryUnit} onClose={() => setEnquiryUnit(null)} /> : null}
    </div>
  );
}
