import React, { useEffect, useMemo, useState } from 'react';

function isImageSource(value) {
  return typeof value === 'string' && (value.startsWith('data:image/') || /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(value));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function reorderList(items, fromIndex, toIndex) {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function getPreferredCover(gallery, coverImage) {
  if (coverImage && gallery.includes(coverImage)) {
    return coverImage;
  }

  return gallery[0] || '';
}

export default function ProjectAdminEditorV2({ project, developers, token, onSave, onDelete, busy, onDeveloperChange }) {
  const [form, setForm] = useState({
    developerId: '',
    projectCode: '',
    projectName: '',
    projectType: 'Residential',
    description: '',
    country: '',
    city: '',
    address: '',
    latitude: '',
    longitude: '',
    startingPrice: '',
    status: 'draft',
    gallery: [],
    coverImage: '',
  });
  const [galleryUrl, setGalleryUrl] = useState('');
  const [dragIndex, setDragIndex] = useState(null);

  useEffect(() => {
    if (!project) {
      return;
    }

    const gallery = Array.isArray(project.gallery) ? project.gallery : [];
    const coverImage = getPreferredCover(gallery, project.coverImage || '');

    setForm({
      developerId: project.developerId || '',
      projectCode: project.projectCode || '',
      projectName: project.projectName || '',
      projectType: project.projectType || 'Residential',
      description: project.description || '',
      country: project.country || '',
      city: project.city || '',
      address: project.address || '',
      latitude: project.latitude ?? '',
      longitude: project.longitude ?? '',
      startingPrice: project.startingPrice ?? '',
      status: project.status || 'draft',
      gallery,
      coverImage,
    });
    setGalleryUrl('');
  }, [project]);

  const activeCoverImage = useMemo(() => getPreferredCover(form.gallery, form.coverImage), [form.gallery, form.coverImage]);

  async function handleGalleryFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      return;
    }

    const images = await Promise.all(files.map((file) => readFileAsDataUrl(file)));
    setForm((current) => {
      const nextGallery = [...current.gallery, ...images];
      return {
        ...current,
        gallery: nextGallery,
        coverImage: getPreferredCover(nextGallery, current.coverImage),
      };
    });
  }

  function addGalleryUrl() {
    const nextUrl = galleryUrl.trim();
    if (!nextUrl) {
      return;
    }

    setForm((current) => {
      const nextGallery = [...current.gallery, nextUrl];
      return {
        ...current,
        gallery: nextGallery,
        coverImage: getPreferredCover(nextGallery, current.coverImage),
      };
    });
    setGalleryUrl('');
  }

  function removeGalleryItem(index) {
    setForm((current) => {
      const nextGallery = current.gallery.filter((_, itemIndex) => itemIndex !== index);
      const nextCover = current.coverImage === current.gallery[index] ? getPreferredCover(nextGallery, '') : current.coverImage;
      return {
        ...current,
        gallery: nextGallery,
        coverImage: getPreferredCover(nextGallery, nextCover),
      };
    });
  }

  function moveGalleryItem(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= form.gallery.length || fromIndex === toIndex) {
      return;
    }

    setForm((current) => {
      const nextGallery = reorderList(current.gallery, fromIndex, toIndex);
      return {
        ...current,
        gallery: nextGallery,
        coverImage: getPreferredCover(nextGallery, current.coverImage),
      };
    });
  }

  if (!project) {
    return (
      <section className="panel project-admin-editor">
        <div className="panel-head">
          <p className="eyebrow">Project editor</p>
          <h3>Select a project to edit</h3>
          <p>Choose a project card below to unlock the update form.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel project-admin-editor">
      <div className="panel-head">
        <p className="eyebrow">Project editor</p>
        <h3>Update selected project</h3>
        <p>Edit the project metadata that powers the public listing and detail page.</p>
      </div>

      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(project.id, {
            developerId: form.developerId || undefined,
            projectCode: form.projectCode,
            projectName: form.projectName,
            projectType: form.projectType,
            description: form.description || null,
            country: form.country,
            city: form.city,
            address: form.address,
            latitude: form.latitude === '' ? null : Number(form.latitude),
            longitude: form.longitude === '' ? null : Number(form.longitude),
            startingPrice: form.startingPrice === '' ? null : Number(form.startingPrice),
            gallery: form.gallery,
            coverImage: form.coverImage || null,
            status: form.status,
          });
        }}
      >
        <select
          value={form.developerId}
          onChange={(e) => {
            const nextDeveloperId = e.target.value;
            setForm((current) => ({ ...current, developerId: nextDeveloperId }));
            onDeveloperChange?.(nextDeveloperId);
          }}
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
            placeholder="Project Code"
            value={form.projectCode}
            onChange={(e) => setForm((current) => ({ ...current, projectCode: e.target.value }))}
            required
          />
          <input
            placeholder="Project Name"
            value={form.projectName}
            onChange={(e) => setForm((current) => ({ ...current, projectName: e.target.value }))}
            required
          />
        </div>
        <div className="split">
          <input
            placeholder="Project Type"
            value={form.projectType}
            onChange={(e) => setForm((current) => ({ ...current, projectType: e.target.value }))}
            required
          />
          <input
            placeholder="Status"
            value={form.status}
            onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
          />
        </div>
        <textarea
          className="text-area"
          placeholder="Description"
          rows="4"
          value={form.description}
          onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
        />
        <input
          placeholder="Address"
          value={form.address}
          onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))}
          required
        />
        <div className="split">
          <input
            placeholder="Country"
            value={form.country}
            onChange={(e) => setForm((current) => ({ ...current, country: e.target.value }))}
            required
          />
          <input
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm((current) => ({ ...current, city: e.target.value }))}
            required
          />
        </div>
        <div className="split">
          <input
            type="number"
            placeholder="Latitude"
            value={form.latitude}
            onChange={(e) => setForm((current) => ({ ...current, latitude: e.target.value }))}
          />
          <input
            type="number"
            placeholder="Longitude"
            value={form.longitude}
            onChange={(e) => setForm((current) => ({ ...current, longitude: e.target.value }))}
          />
        </div>
        <input
          type="number"
          placeholder="Starting Price"
          value={form.startingPrice}
          onChange={(e) => setForm((current) => ({ ...current, startingPrice: e.target.value }))}
        />

        <div className="media-upload">
          <div className="panel-head panel-head--compact">
            <h4>Main image and gallery</h4>
            <p>Upload, reorder, and pick the main image for the public project detail page.</p>
          </div>

          <div className="media-upload__controls">
            <input
              type="text"
              placeholder="Paste image URL and add it"
              value={galleryUrl}
              onChange={(e) => setGalleryUrl(e.target.value)}
            />
            <button type="button" className="ghost" onClick={addGalleryUrl}>
              Add URL
            </button>
          </div>

          <input
            type="file"
            accept="image/*"
            multiple
            onChange={async (e) => {
              const files = e.target.files;
              if (files?.length) {
                await handleGalleryFiles(files);
                e.target.value = '';
              }
            }}
          />

          {activeCoverImage ? (
            <div className="project-cover-preview">
              <div className="project-cover-preview__head">
                <strong>Selected main image</strong>
                <small>Shown on project cards and as the hero fallback.</small>
              </div>
              <img src={activeCoverImage} alt="Project cover preview" />
            </div>
          ) : null}

          <div className="media-upload__grid">
            {form.gallery.map((item, index) => {
              const selected = item === activeCoverImage;
              return (
                <article
                  className={`media-upload__tile ${selected ? 'media-upload__tile--selected' : ''}`}
                  key={`${item}-${index}`}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex !== null) {
                      moveGalleryItem(dragIndex, index);
                      setDragIndex(null);
                    }
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  {isImageSource(item) ? <img src={item} alt={`Gallery item ${index + 1}`} /> : <span>Image link</span>}
                  <div className="media-upload__tile-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => setForm((current) => ({ ...current, coverImage: item }))}
                    >
                      {selected ? 'Main image' : 'Set main image'}
                    </button>
                    <button type="button" className="ghost" onClick={() => moveGalleryItem(index, index - 1)}>
                      Up
                    </button>
                    <button type="button" className="ghost" onClick={() => moveGalleryItem(index, index + 1)}>
                      Down
                    </button>
                    <button type="button" className="ghost danger" onClick={() => removeGalleryItem(index)}>
                      Remove
                    </button>
                  </div>
                  <span className="media-upload__tile-label">Drag to reorder</span>
                </article>
              );
            })}
            {!form.gallery.length ? <p className="empty-inline">No gallery images added yet.</p> : null}
          </div>
        </div>

        <div className="action-row">
          <button type="submit" disabled={busy}>
            Save Project
          </button>
          <button type="button" className="ghost danger" disabled={busy} onClick={() => onDelete?.(project.id)}>
            Delete Project
          </button>
        </div>
      </form>
    </section>
  );
}
