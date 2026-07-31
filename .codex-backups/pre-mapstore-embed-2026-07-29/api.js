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

export async function updateProject(token, projectId, payload) {
  return request(`/projects/${projectId}`, {
    token,
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function uploadProjectModel3d(token, projectId, file) {
  const response = await fetch(`${API_BASE_URL}/projects/${projectId}/model-3d`, {
    method: 'PUT',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': file.type || 'application/octet-stream',
      'x-file-name': file.name || 'model.glb',
    },
    body: file,
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
