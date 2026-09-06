import React, { useEffect, useMemo, useState } from 'react';
import { uploadProjectModel3d } from '../api.js';
import { resolveMediaUrl } from '../mediaUrl.js';
import Project3DViewer from './Project3DViewer.jsx';
import {
  formatBytes,
  MAX_STORED_MODEL_BYTES,
  MODEL_OPTIMIZATION_TIPS,
  validateModelFile,
} from '../modelLimits.js';

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

function toOptionalNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
    mapMarkerImage: '',
    model3dUrl: '',
    model3dHeading: '0',
    model3dScale: '1',
  });
  const [galleryUrl, setGalleryUrl] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [modelUploadState, setModelUploadState] = useState('');
  const [modelUploadError, setModelUploadError] = useState('');
  const [optimizeLargeModel, setOptimizeLargeModel] = useState(true);
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
      mapMarkerImage: project.mapMarkerImage || '',
      model3dUrl: project.model3dUrl || '',
      model3dHeading: project.model3dHeading ?? '0',
      model3dScale: project.model3dScale ?? '1',
    });
    setGalleryUrl('');
    setModelUrl('');
    setModelUploadState('');
    setModelUploadError('');
  }, [project]);

  const activeCoverImage = useMemo(() => getPreferredCover(form.gallery, form.coverImage), [form.gallery, form.coverImage]);
  const previewModelUrl = useMemo(() => resolveMediaUrl(form.model3dUrl), [form.model3dUrl]);

  async function handleModelUpload(file) {
    if (!file || !project?.id) {
      return;
    }

    const check = validateModelFile(file, { allowOptimize: optimizeLargeModel });
    if (!check.ok) {
      setModelUploadError(check.message);
      setModelUploadState('');
      return;
    }

    setModelUploadState(
      check.needsOptimize
        ? `Optimizing ${file.name} (${formatBytes(file.size)}) toward ${formatBytes(MAX_STORED_MODEL_BYTES)}...`
        : `Uploading ${file.name} (${formatBytes(file.size)})...`,
    );
    setModelUploadError('');

    try {
      const response = await uploadProjectModel3d(token, project.id, file, { optimize: optimizeLargeModel || check.needsOptimize });
      const uploadedUrl = response?.data?.model3dUrl || '';
      if (!uploadedUrl) {
        throw new Error('Upload completed but no file URL was returned.');
      }

      setForm((current) => ({ ...current, model3dUrl: uploadedUrl }));
      const stored = response?.meta?.storedBytes;
      const original = response?.meta?.originalBytes;
      const sizeNote = stored && original && stored !== original
        ? ` Reduced ${formatBytes(original)} → ${formatBytes(stored)}.`
        : '';
      setModelUploadState(`3D model ready for Cesium.${sizeNote} Save heading/scale if you changed them, then open the public map.`);
    } catch (uploadError) {
      setModelUploadError(uploadError.payload?.message || uploadError.message || 'Failed to upload 3D model.');
      setModelUploadState('');
    }
  }

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
            latitude: toOptionalNumber(form.latitude),
            longitude: toOptionalNumber(form.longitude),
            startingPrice: toOptionalNumber(form.startingPrice),
            gallery: form.gallery,
            coverImage: form.coverImage || null,
            mapMarkerImage: form.mapMarkerImage || null,
            model3dUrl: form.model3dUrl || null,
            model3dHeading: toOptionalNumber(form.model3dHeading) ?? 0,
            model3dScale: toOptionalNumber(form.model3dScale) ?? 1,
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
        <div className="media-upload">
          <div className="panel-head panel-head--compact">
            <h4>Map building image</h4>
            <p>Optional still used when no GLB is attached. Cesium prefers the 3D model below.</p>
          </div>
          <div className="map-building-upload">
            <img
              className="map-building-upload__preview"
              src={form.mapMarkerImage || '/map-building-default.svg'}
              alt="Map building marker preview"
            />
            <div className="map-building-upload__actions">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const image = await readFileAsDataUrl(file);
                  setForm((current) => ({ ...current, mapMarkerImage: image }));
                  e.target.value = '';
                }}
              />
              {form.mapMarkerImage ? (
                <button type="button" className="ghost" onClick={() => setForm((current) => ({ ...current, mapMarkerImage: '' }))}>
                  Use default building
                </button>
              ) : (
                <small>Default building shown until an image is saved.</small>
              )}
            </div>
          </div>
        </div>

        <div className="media-upload">
          <div className="panel-head panel-head--compact">
            <h4>Project 3D model (Cesium)</h4>
            <p>
              Upload a `.glb` (preferred) or `.gltf`. Stored size must be ≤ {formatBytes(MAX_STORED_MODEL_BYTES)}.
              Files up to 80 MB can be compressed on the server. Oversized CAD exports often fail Cesium fragment shaders.
            </p>
          </div>

          <div className="media-upload__controls">
            <input
              type="text"
              placeholder="Paste 3D model URL"
              value={modelUrl}
              onChange={(e) => setModelUrl(e.target.value)}
            />
            <button
              type="button"
              className="ghost"
              onClick={() => {
                const nextUrl = modelUrl.trim();
                if (!nextUrl) {
                  return;
                }
                setForm((current) => ({ ...current, model3dUrl: nextUrl }));
                setModelUrl('');
              }}
            >
              Add URL
            </button>
          </div>

          <div className="split">
            <input
              type="number"
              step="1"
              placeholder="Heading degrees"
              value={form.model3dHeading}
              onChange={(e) => setForm((current) => ({ ...current, model3dHeading: e.target.value }))}
            />
            <input
              type="number"
              step="0.1"
              min="0.01"
              placeholder="Model scale"
              value={form.model3dScale}
              onChange={(e) => setForm((current) => ({ ...current, model3dScale: e.target.value }))}
            />
          </div>

          {modelUploadState ? <p className="success-text">{modelUploadState}</p> : null}
          {modelUploadError ? <p className="error-text">{modelUploadError}</p> : null}

          <label className="check-row">
            <input
              type="checkbox"
              checked={optimizeLargeModel}
              onChange={(event) => setOptimizeLargeModel(event.target.checked)}
            />
            <span>Optimize on upload (target ≤ {formatBytes(MAX_STORED_MODEL_BYTES)}, Cesium-safe materials)</span>
          </label>

          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) {
                return;
              }
              await handleModelUpload(file);
              e.target.value = '';
            }}
          />

          <details className="hint">
            <summary>How to shrink a ~60 MB GLB</summary>
            <ul className="bullet-list">
              {MODEL_OPTIMIZATION_TIPS.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </details>

          {form.model3dUrl ? (
            <button type="button" className="ghost" onClick={() => setForm((current) => ({ ...current, model3dUrl: '' }))}>
              Remove 3D model
            </button>
          ) : null}

          <div className="project-admin-editor__viewer">
            <Project3DViewer
              src={previewModelUrl}
              title="Project 3D preview"
              description="Same asset Cesium places on the public map at the saved coordinates."
              compact
            />
            {!form.model3dUrl ? <p className="empty-inline">No 3D model attached yet.</p> : null}
          </div>
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
