import { MODEL_CHUNK_SIZE } from './modelLimits.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

async function request(path, { token, ...options } = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(data?.message || 'Request failed');
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  return data;
}

export async function login(email, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(token) {
  return request('/auth/me', {
    token,
  });
}

export async function listDevelopers(token) {
  return request('/developers', { token });
}

export async function createDeveloper(token, payload) {
  return request('/developers', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteDeveloper(token, developerId) {
  return request(`/developers/${developerId}`, {
    token,
    method: 'DELETE',
  });
}

export async function listUsers(token) {
  return request('/users', { token });
}

export async function createUser(token, payload) {
  return request('/users', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetUserPassword(token, userId, payload) {
  return request(`/users/${userId}/password`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function listProjects(tokenOrOptions, maybeOptions = {}) {
  const isTokenString = typeof tokenOrOptions === 'string' || tokenOrOptions === undefined || tokenOrOptions === null;
  const token = isTokenString ? tokenOrOptions : tokenOrOptions?.token;
  const options = isTokenString ? maybeOptions : tokenOrOptions || {};

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (key === 'token' || value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return request(`/projects${query ? `?${query}` : ''}`, { token });
}

export async function listPublicProjects(options = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return request(`/projects/public${query ? `?${query}` : ''}`);
}

export async function getProject(id, token) {
  return request(`/projects/${id}`, { token });
}

export async function getPublicProject(id) {
  return request(`/projects/public/${id}`);
}

export async function createProject(token, payload) {
  return request('/projects', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

/** Never resend embedded gallery/cover bytes — that hangs Save on production. */
export function buildSlimProjectUpdate(payload = {}) {
  const body = { ...payload };

  if (Array.isArray(body.gallery)) {
    const keepers = body.gallery.filter((item) => typeof item === 'string' && item && !isDataUrl(item));
    if (keepers.length === body.gallery.length) {
      body.gallery = keepers;
    } else {
      delete body.gallery;
    }
  }

  for (const key of ['coverImage', 'mapMarkerImage']) {
    if (isDataUrl(body[key])) {
      delete body[key];
    }
  }

  return body;
}

/** Map pose only — small PUT to existing /projects/:id (no new route required). */
export async function updateProjectPlacement(token, projectId, payload) {
  return request(`/projects/${projectId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify({
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      model3dHeading: payload.model3dHeading ?? 0,
      model3dScale: payload.model3dScale ?? 1,
    }),
  });
}

export async function updateProject(token, projectId, payload) {
  return request(`/projects/${projectId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(buildSlimProjectUpdate(payload)),
  });
}

export async function uploadProjectModel3d(token, projectId, file, { optimize = true, onProgress } = {}) {
  const chunkSize = MODEL_CHUNK_SIZE;
  const totalBytes = file.size;
  const totalChunks = Math.max(1, Math.ceil(totalBytes / chunkSize));
  const resumeKey = `model-upload:${projectId}:${file.name}:${file.size}:${file.lastModified}`;

  const report = (percent, message) => {
    if (typeof onProgress === 'function') {
      onProgress({ percent, message, totalBytes, totalChunks });
    }
  };

  async function apiJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;
    if (!response.ok) {
      const error = new Error(data?.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  async function putChunk(uploadId, index, blob, attempt = 1) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/projects/${projectId}/model-3d/sessions/${uploadId}/chunks/${index}`,
        {
          method: 'PUT',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/octet-stream',
          },
          body: blob,
        },
      );
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (!response.ok) {
        const error = new Error(data?.message || `Chunk ${index} failed (${response.status})`);
        error.status = response.status;
        error.payload = data;
        throw error;
      }
      return data;
    } catch (error) {
      const status = Number(error?.status);
      const retryable = !status || status >= 500 || status === 408 || status === 429;
      if (!retryable || attempt >= 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
      return putChunk(uploadId, index, blob, attempt + 1);
    }
  }

  report(1, 'Starting chunked upload...');

  let uploadId = '';
  let received = new Set();

  try {
    const saved = JSON.parse(window.localStorage.getItem(resumeKey) || 'null');
    if (saved?.uploadId) {
      try {
        const existing = await apiJson(`/projects/${projectId}/model-3d/sessions/${saved.uploadId}`);
        uploadId = existing?.data?.uploadId || '';
        received = new Set((existing?.data?.receivedChunks || []).map(Number));
      } catch {
        window.localStorage.removeItem(resumeKey);
      }
    }
  } catch {
    window.localStorage.removeItem(resumeKey);
  }

  if (!uploadId) {
    const created = await apiJson(`/projects/${projectId}/model-3d/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name || 'model.glb',
        totalBytes,
        chunkSize,
        optimize,
      }),
    });
    uploadId = created?.data?.uploadId;
    if (!uploadId) {
      throw new Error('The server did not return an upload session id.');
    }
    window.localStorage.setItem(resumeKey, JSON.stringify({ uploadId }));
  }

  if (received.size) {
    report(Math.round((received.size / totalChunks) * 90), `Resuming upload (${received.size}/${totalChunks} chunks already on the server)...`);
  }

  for (let index = 0; index < totalChunks; index += 1) {
    if (received.has(index)) {
      report(Math.round(((index + 1) / totalChunks) * 90), `Skipped uploaded chunk ${index + 1}/${totalChunks}`);
      continue;
    }

    const start = index * chunkSize;
    const end = Math.min(start + chunkSize, totalBytes);
    await putChunk(uploadId, index, file.slice(start, end));
    received.add(index);
    report(Math.round(((index + 1) / totalChunks) * 90), `Uploaded chunk ${index + 1}/${totalChunks}`);
  }

  report(92, 'Assembling model on the server...');
  const completed = await completeUpload(uploadId, 1);
  window.localStorage.removeItem(resumeKey);
  report(100, 'Upload complete.');
  return completed;

  function isNetworkFailure(error) {
    const message = String(error?.message || '');
    return !error?.status && /failed to fetch|networkerror|load failed|fetch failed/i.test(message);
  }

  async function completeUpload(id, attempt) {
    try {
      return await apiJson(`/projects/${projectId}/model-3d/sessions/${id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch (error) {
      if (isNetworkFailure(error) && attempt < 3) {
        report(94, `Server dropped while assembling. Retrying (${attempt + 1}/3)...`);
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
        return completeUpload(id, attempt + 1);
      }
      if (isNetworkFailure(error)) {
        const wrapped = new Error(
          'The API closed the connection while assembling the model. Chunks are already on the server — choose the same .glb again to retry. Restart `npm run dev:api` if the API process crashed.',
        );
        wrapped.payload = { message: wrapped.message };
        throw wrapped;
      }
      throw error;
    }
  }
}

export async function deleteProject(token, projectId) {
  return request(`/projects/${projectId}`, {
    token,
    method: 'DELETE',
  });
}

export async function listBuildings(projectId, token) {
  return request(`/projects/${projectId}/buildings`, { token });
}

export async function createBuilding(token, projectId, payload) {
  return request(`/projects/${projectId}/buildings`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBuilding(token, buildingId, payload) {
  return request(`/buildings/${buildingId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteBuilding(token, buildingId) {
  return request(`/buildings/${buildingId}`, {
    token,
    method: 'DELETE',
  });
}

export async function createFloor(token, buildingId, payload) {
  return request(`/buildings/${buildingId}/floors`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFloor(token, floorId, payload) {
  return request(`/floors/${floorId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFloor(token, floorId) {
  return request(`/floors/${floorId}`, {
    token,
    method: 'DELETE',
  });
}

export async function createUnit(token, floorId, payload) {
  return request(`/floors/${floorId}/units`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUnit(token, unitId, payload) {
  return request(`/units/${unitId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function listNearbyDestinations(token, projectId) {
  return request(`/projects/${projectId}/nearby-destinations`, { token });
}

export async function createNearbyDestination(token, projectId, payload) {
  return request(`/projects/${projectId}/nearby-destinations`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateNearbyDestination(token, destinationId, payload) {
  return request(`/nearby-destinations/${destinationId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteNearbyDestination(token, destinationId) {
  return request(`/nearby-destinations/${destinationId}`, {
    token,
    method: 'DELETE',
  });
}

export async function listFacilities(token, options = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return request(`/facilities${query ? `?${query}` : ''}`, { token });
}

export async function createFacility(token, payload) {
  return request('/facilities', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFacility(token, facilityId, payload) {
  return request(`/facilities/${facilityId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFacility(token, facilityId) {
  return request(`/facilities/${facilityId}`, {
    token,
    method: 'DELETE',
  });
}

export async function listAmenities(token, options = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return request(`/amenities${query ? `?${query}` : ''}`, { token });
}

export async function createAmenity(token, payload) {
  return request('/amenities', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAmenity(token, amenityId, payload) {
  return request(`/amenities/${amenityId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteAmenity(token, amenityId) {
  return request(`/amenities/${amenityId}`, {
    token,
    method: 'DELETE',
  });
}

export async function assignAmenityToProject(token, projectId, payload) {
  return request(`/projects/${projectId}/amenities`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectAmenity(token, assignmentId, payload) {
  return request(`/project-amenities/${assignmentId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectAmenity(token, assignmentId) {
  return request(`/project-amenities/${assignmentId}`, {
    token,
    method: 'DELETE',
  });
}

export async function assignFacilityToProject(token, projectId, payload) {
  return request(`/projects/${projectId}/facilities`, {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateProjectFacility(token, assignmentId, payload) {
  return request(`/project-facilities/${assignmentId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteProjectFacility(token, assignmentId) {
  return request(`/project-facilities/${assignmentId}`, {
    token,
    method: 'DELETE',
  });
}

export async function deleteUnit(token, unitId) {
  return request(`/units/${unitId}`, {
    token,
    method: 'DELETE',
  });
}

export async function createLead(payload) {
  return request('/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listLeads(token, options = {}) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return request(`/leads${query ? `?${query}` : ''}`, { token });
}

export async function listSiteVisits(token) {
  return request('/leads/site-visits', { token });
}

export async function updateLead(token, leadId, payload) {
  return request(`/leads/${leadId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function listBookings(token) {
  return request('/leads/bookings', { token });
}

export async function createBooking(token, payload) {
  return request('/leads/bookings', {
    token,
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBooking(token, bookingId, payload) {
  return request(`/leads/bookings/${bookingId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
