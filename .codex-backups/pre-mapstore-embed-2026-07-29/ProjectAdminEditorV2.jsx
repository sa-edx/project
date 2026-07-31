import React, { useEffect, useMemo, useState } from 'react';
import { uploadProjectModel3d } from '../api.js';
import Project3DViewer from './Project3DViewer.jsx';

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

export default function ProjectAdminEditorV2({ project, developers, token, onSave, busy, onDeveloperChange }) {
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
    model3dUrl: '',
  });
  const [galleryUrl, setGalleryUrl] = useState('');
  const [modelUrl, setModelUrl] = useState('');
  const [modelUploadState, setModelUploadState] = useState('');
  const [modelUploadError, setModelUploadError] = useState('');
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
      model3dUrl: project.model3dUrl || '',
    });
    setGalleryUrl('');
    setModelUrl('');
    setModelUploadState('');
    setModelUploadError('');
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

  async function handleModelUpload(file, previewUrl) {
    if (!file || !project?.id) {
      return;
    }

    setModelUploadState('Uploading 3D model...');
    setModelUploadError('');

    try {
      const response = await uploadProjectModel3d(token, project.id, file);
      const uploadedUrl = response?.data?.model3dUrl || '';
      if (!uploadedUrl) {
        throw new Error('Upload completed but no file URL was returned.');
      }

      setForm((current) => ({ ...current, model3dUrl: uploadedUrl }));
      setModelUploadState('3D model uploaded and attached to this project.');
    } catch (uploadError) {
      setModelUploadError(uploadError.payload?.message || uploadError.message || 'Failed to upload 3D model.');
      setModelUploadState('');
    } finally {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    }
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
            model3dUrl: form.model3dUrl || null,
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
            <h4>Project 3D model</h4>
            <p>Attach a `.glb` or `.gltf` file to show the building in the public detail page.</p>
          </div>

          <div className="media-upload__controls">
            <input
              type="text"
              placeholder="Paste 3D model URL or data URL"
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
          {modelUploadState ? <p className="success-text">{modelUploadState}</p> : null}
          {modelUploadError ? <p className="error-text">{modelUploadError}</p> : null}

          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) {
                return;
              }

              const previewUrl = URL.createObjectURL(file);
              setForm((current) => ({ ...current, model3dUrl: previewUrl }));
              await handleModelUpload(file, previewUrl);
              e.target.value = '';
            }}
          />

          <div className="project-admin-editor__viewer">
            <Project3DViewer
              src={form.model3dUrl}
              title="Project 3D preview"
              description="This preview uses the same asset that will appear on the public project page."
              compact
            />
            {!form.model3dUrl ? <p className="empty-inline">No 3D model attached yet.</p> : null}
          </div>
        </div>

        <div className="media-upload">
          <div className="panel-head panel-head--compact">
            <h4>Project gallery</h4>
            <p>Upload, reorder, and pick the hero image for the public project detail page.</p>
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
                <strong>Selected cover image</strong>
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
                      {selected ? 'Cover' : 'Set cover'}
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

        <button type="submit" disabled={busy}>
          Save Project
        </button>
      </form>
    </section>
  );
}
