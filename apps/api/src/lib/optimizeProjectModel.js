export const MAX_STORED_MODEL_BYTES = 15 * 1024 * 1024;
export const MAX_UPLOAD_MODEL_BYTES = 80 * 1024 * 1024;

async function loadOptimizeLibraries() {
  try {
    const [{ NodeIO }, { ALL_EXTENSIONS }, functions] = await Promise.all([
      import('@gltf-transform/core'),
      import('@gltf-transform/extensions'),
      import('@gltf-transform/functions'),
    ]);

    let encoder;
    try {
      encoder = (await import('sharp')).default;
    } catch {
      encoder = null;
    }

    return { NodeIO, ALL_EXTENSIONS, functions, encoder };
  } catch {
    return null;
  }
}

async function applyStep(document, step) {
  try {
    await document.transform(step);
  } catch {
    // Skip transforms that do not apply to this asset.
  }
}

async function transformDocument(document, functions, encoder, { maxTextureSize, quality, convertMaterials }) {
  const { dedup, flatten, metalRough, prune, resample, textureCompress, textureResize, weld } = functions;

  if (convertMaterials) {
    await applyStep(document, metalRough());
  }

  await applyStep(document, dedup());
  await applyStep(document, weld());
  await applyStep(document, flatten());
  await applyStep(document, resample());
  await applyStep(document, prune());
  await applyStep(
    document,
    textureResize({
      size: [maxTextureSize, maxTextureSize],
    }),
  );

  if (encoder) {
    await applyStep(
      document,
      textureCompress({
        encoder,
        targetFormat: 'jpeg',
        quality,
        resize: [maxTextureSize, maxTextureSize],
      }),
    );
  }

  return document;
}

export async function optimizeProjectModelBuffer(buffer, { forceCompress = false } = {}) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (!source.length) {
    throw Object.assign(new Error('Empty 3D model file.'), { status: 400, code: 'VALIDATION_ERROR' });
  }

  if (source.length > MAX_UPLOAD_MODEL_BYTES) {
    throw Object.assign(
      new Error(`Model is larger than ${Math.round(MAX_UPLOAD_MODEL_BYTES / (1024 * 1024))} MB.`),
      { status: 413, code: 'PAYLOAD_TOO_LARGE' },
    );
  }

  const needsCompress = forceCompress || source.length > MAX_STORED_MODEL_BYTES;
  if (!needsCompress) {
    return {
      buffer: source,
      optimized: false,
      originalBytes: source.length,
      storedBytes: source.length,
    };
  }

  const libraries = await loadOptimizeLibraries();
  if (!libraries) {
    if (source.length > MAX_STORED_MODEL_BYTES) {
      throw Object.assign(
        new Error(
          `Model is ${(source.length / (1024 * 1024)).toFixed(1)} MB. Install @gltf-transform/core, @gltf-transform/functions, @gltf-transform/extensions, and sharp on the API to compress files over 15 MB.`,
        ),
        { status: 413, code: 'OPTIMIZE_UNAVAILABLE' },
      );
    }

    return {
      buffer: source,
      optimized: false,
      originalBytes: source.length,
      storedBytes: source.length,
    };
  }

  const { NodeIO, ALL_EXTENSIONS, functions, encoder } = libraries;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

  try {
    await io.readBinary(new Uint8Array(source));
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'The file is not a readable GLB.'), {
      status: 400,
      code: 'VALIDATION_ERROR',
    });
  }

  let maxTextureSize = 1024;
  let quality = 72;
  let output = source;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const working = await io.readBinary(new Uint8Array(source));
    await transformDocument(working, functions, encoder, {
      maxTextureSize,
      quality,
      convertMaterials: true,
    });
    const written = Buffer.from(await io.writeBinary(working));
    output = written;

    if (written.length <= MAX_STORED_MODEL_BYTES) {
      return {
        buffer: written,
        optimized: written.length < source.length || needsCompress,
        originalBytes: source.length,
        storedBytes: written.length,
      };
    }

    maxTextureSize = Math.max(256, Math.floor(maxTextureSize / 2));
    quality = Math.max(38, quality - 12);
  }

  throw Object.assign(
    new Error(
      `Could not reduce the model to ${Math.round(MAX_STORED_MODEL_BYTES / (1024 * 1024))} MB (ended at ${(output.length / (1024 * 1024)).toFixed(1)} MB). Decimate the mesh and shrink textures, then try again.`,
    ),
    { status: 413, code: 'MODEL_TOO_COMPLEX' },
  );
}
