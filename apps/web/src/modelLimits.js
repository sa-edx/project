export const MODEL_CHUNK_SIZE = 1 * 1024 * 1024;
export const MAX_STORED_MODEL_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_MODEL_BYTES = 80 * 1024 * 1024;

export function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) {
    return '0 B';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function isGlbOrGltfFile(file) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.type || '').toLowerCase();
  return name.endsWith('.glb') || name.endsWith('.gltf') || type.includes('gltf');
}

export function validateModelFile(file, { allowOptimize = true } = {}) {
  if (!file) {
    return { ok: false, code: 'MISSING', message: 'Choose a .glb or .gltf file.' };
  }

  if (!isGlbOrGltfFile(file)) {
    return { ok: false, code: 'TYPE', message: 'Only .glb or .gltf files can be uploaded.' };
  }

  if (file.size > MAX_UPLOAD_MODEL_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE_SOURCE',
      message: `${file.name} is ${formatBytes(file.size)}. Reduce it below ${formatBytes(MAX_UPLOAD_MODEL_BYTES)} before upload (target ${formatBytes(MAX_STORED_MODEL_BYTES)} on the map).`,
    };
  }

  if (file.size > MAX_STORED_MODEL_BYTES && !allowOptimize) {
    return {
      ok: false,
      code: 'NEEDS_OPTIMIZE',
      message: `${file.name} is ${formatBytes(file.size)}. Enable “Optimize to 15 MB” or export a smaller GLB.`,
    };
  }

  return {
    ok: true,
    needsOptimize: file.size > MAX_STORED_MODEL_BYTES,
    message: file.size > MAX_STORED_MODEL_BYTES
      ? `${file.name} is ${formatBytes(file.size)}. It will be compressed toward ${formatBytes(MAX_STORED_MODEL_BYTES)} for Cesium.`
      : '',
  };
}

export const MODEL_OPTIMIZATION_TIPS = [
  'Export as binary GLB, not ASCII glTF plus loose textures.',
  'Resize color textures to 1024px (512px for huge facades) and use JPEG/WebP instead of PNG.',
  'Use one metallic-roughness PBR workflow. Avoid spec-gloss, huge atlases, and dozens of unique materials.',
  'Decimate dense CAD meshes (Blender Decimate, MeshLab, or gltf-transform simplify) before upload.',
  'Remove unused nodes, cameras, lights, and hidden CAD layers. Draco compression helps after mesh cleanup.',
];
