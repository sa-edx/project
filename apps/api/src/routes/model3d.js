import express, { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';
import {
  optimizeProjectModelBuffer,
  MAX_STORED_MODEL_BYTES,
  MAX_UPLOAD_MODEL_BYTES,
} from '../lib/optimizeProjectModel.js';
import { serializeProject } from './projects.js';

export const MODEL_CHUNK_SIZE = 1 * 1024 * 1024;
export const model3dRouter = Router();

const writeRoles = ['super-administrator', 'system-administrator', 'developer'];
const sessionsRoot = () => path.join(process.cwd(), 'uploads', 'model-chunks');

function chunkPath(sessionDir, index) {
  return path.join(sessionDir, `chunk-${String(index).padStart(6, '0')}`);
}

async function readMeta(sessionDir) {
  const raw = await fs.readFile(path.join(sessionDir, 'meta.json'), 'utf8');
  return JSON.parse(raw);
}

async function writeMeta(sessionDir, meta) {
  await fs.writeFile(path.join(sessionDir, 'meta.json'), JSON.stringify(meta, null, 2));
}

async function listReceivedChunks(sessionDir, totalChunks) {
  const received = [];
  for (let index = 0; index < totalChunks; index += 1) {
    try {
      await fs.access(chunkPath(sessionDir, index));
      received.push(index);
    } catch {
      // missing chunk
    }
  }
  return received;
}

async function getProjectOr404(req, res) {
  const project = await prisma.project.findUnique({
    where: { id: req.params.id },
    select: { id: true, projectName: true, projectCode: true },
  });

  if (!project) {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Project not found.',
    });
    return null;
  }

  return project;
}

async function loadSession(req, res) {
  const sessionDir = path.join(sessionsRoot(), req.params.uploadId);
  try {
    const meta = await readMeta(sessionDir);
    if (meta.projectId !== req.params.id) {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Upload session not found for this project.',
      });
      return null;
    }
    return { sessionDir, meta };
  } catch {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: 'Upload session not found. Start a new chunked upload.',
    });
    return null;
  }
}

export async function saveProjectGlbBuffer(project, buffer, { optimize = true } = {}) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error('No 3D model file was uploaded.');
    error.status = 400;
    error.code = 'VALIDATION_ERROR';
    throw error;
  }

  if (buffer.length > MAX_UPLOAD_MODEL_BYTES) {
    const error = new Error(`Model is larger than ${Math.round(MAX_UPLOAD_MODEL_BYTES / (1024 * 1024))} MB.`);
    error.status = 413;
    error.code = 'PAYLOAD_TOO_LARGE';
    throw error;
  }

  let storedBuffer = Buffer.from(buffer);
  let optimizeMeta = {
    optimized: false,
    originalBytes: buffer.length,
    storedBytes: buffer.length,
  };

  try {
    const result = await optimizeProjectModelBuffer(storedBuffer, {
      forceCompress: optimize || buffer.length > MAX_STORED_MODEL_BYTES,
    });
    storedBuffer = result.buffer;
    optimizeMeta = {
      optimized: result.optimized,
      originalBytes: result.originalBytes,
      storedBytes: result.storedBytes,
    };
  } catch (optimizeError) {
    const error = new Error(optimizeError.message || 'Failed to optimize the 3D model.');
    error.status = optimizeError.status || 400;
    error.code = optimizeError.code || 'MODEL_OPTIMIZE_FAILED';
    throw error;
  }

  const fileName = `${project.projectCode || 'project'}-${project.id}-${crypto.randomUUID()}.glb`;
  const uploadDir = path.join(process.cwd(), 'uploads', 'project-models');
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, fileName), storedBuffer);

  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      model3dUrl: `/uploads/project-models/${fileName}`,
    },
    include: {
      developer: true,
    },
  });

  return {
    data: serializeProject(updated),
    meta: optimizeMeta,
  };
}

model3dRouter.post(
  '/:id/model-3d/sessions',
  authenticateRequest,
  requireRole(...writeRoles),
  async (req, res, next) => {
    try {
      const project = await getProjectOr404(req, res);
      if (!project) {
        return;
      }

      const fileName = String(req.body?.fileName || 'model.glb');
      const totalBytes = Number(req.body?.totalBytes);
      const chunkSize = Number(req.body?.chunkSize) || MODEL_CHUNK_SIZE;
      const optimize = req.body?.optimize !== false;

      if (!Number.isFinite(totalBytes) || totalBytes <= 0 || totalBytes > MAX_UPLOAD_MODEL_BYTES) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `File size must be between 1 byte and ${Math.round(MAX_UPLOAD_MODEL_BYTES / (1024 * 1024))} MB.`,
        });
      }

      if (chunkSize !== MODEL_CHUNK_SIZE) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Chunk size must be ${MODEL_CHUNK_SIZE} bytes.`,
        });
      }

      const totalChunks = Math.ceil(totalBytes / chunkSize);
      const uploadId = crypto.randomUUID();
      const sessionDir = path.join(sessionsRoot(), uploadId);
      await fs.mkdir(sessionDir, { recursive: true });

      const meta = {
        uploadId,
        projectId: project.id,
        fileName,
        totalBytes,
        chunkSize,
        totalChunks,
        optimize,
        createdAt: new Date().toISOString(),
      };
      await writeMeta(sessionDir, meta);

      return res.status(201).json({
        data: {
          ...meta,
          receivedChunks: [],
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

model3dRouter.get(
  '/:id/model-3d/sessions/:uploadId',
  authenticateRequest,
  requireRole(...writeRoles),
  async (req, res, next) => {
    try {
      const session = await loadSession(req, res);
      if (!session) {
        return;
      }

      const receivedChunks = await listReceivedChunks(session.sessionDir, session.meta.totalChunks);
      return res.json({
        data: {
          ...session.meta,
          receivedChunks,
          complete: receivedChunks.length === session.meta.totalChunks,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

model3dRouter.put(
  '/:id/model-3d/sessions/:uploadId/chunks/:index',
  authenticateRequest,
  requireRole(...writeRoles),
  express.raw({
    type: ['application/octet-stream', 'application/gltf-buffer', 'model/gltf-binary', '*/*'],
    limit: '2mb',
  }),
  async (req, res, next) => {
    try {
      const session = await loadSession(req, res);
      if (!session) {
        return;
      }

      const index = Number(req.params.index);
      if (!Number.isInteger(index) || index < 0 || index >= session.meta.totalChunks) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid chunk index.',
        });
      }

      const body = req.body;
      if (!Buffer.isBuffer(body) || !body.length) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Chunk body was empty.',
        });
      }

      const isLast = index === session.meta.totalChunks - 1;
      const expected = isLast
        ? session.meta.totalBytes - session.meta.chunkSize * (session.meta.totalChunks - 1)
        : session.meta.chunkSize;

      if (body.length !== expected) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Chunk ${index} must be ${expected} bytes (received ${body.length}).`,
        });
      }

      await fs.writeFile(chunkPath(session.sessionDir, index), body);
      const receivedChunks = await listReceivedChunks(session.sessionDir, session.meta.totalChunks);

      return res.json({
        data: {
          index,
          received: true,
          receivedChunks,
          totalChunks: session.meta.totalChunks,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

model3dRouter.post(
  '/:id/model-3d/sessions/:uploadId/complete',
  authenticateRequest,
  requireRole(...writeRoles),
  async (req, res, next) => {
    try {
      const project = await getProjectOr404(req, res);
      if (!project) {
        return;
      }

      const session = await loadSession(req, res);
      if (!session) {
        return;
      }

      const receivedChunks = await listReceivedChunks(session.sessionDir, session.meta.totalChunks);
      if (receivedChunks.length !== session.meta.totalChunks) {
        const missing = [];
        for (let index = 0; index < session.meta.totalChunks; index += 1) {
          if (!receivedChunks.includes(index)) {
            missing.push(index);
          }
        }
        return res.status(409).json({
          error: 'UPLOAD_INCOMPLETE',
          message: `Missing ${missing.length} chunk(s). Retry those parts, then complete again.`,
          details: { missingChunks: missing, receivedChunks },
        });
      }

      const parts = [];
      for (let index = 0; index < session.meta.totalChunks; index += 1) {
        parts.push(await fs.readFile(chunkPath(session.sessionDir, index)));
      }

      const assembled = Buffer.concat(parts);
      if (assembled.length !== session.meta.totalBytes) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Assembled file size did not match the declared upload size.',
        });
      }

      const saved = await saveProjectGlbBuffer(project, assembled, { optimize: session.meta.optimize !== false });
      await fs.rm(session.sessionDir, { recursive: true, force: true });
      return res.json(saved);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.code || 'MODEL_OPTIMIZE_FAILED',
          message: error.message,
        });
      }
      next(error);
    }
  },
);

model3dRouter.delete(
  '/:id/model-3d/sessions/:uploadId',
  authenticateRequest,
  requireRole(...writeRoles),
  async (req, res, next) => {
    try {
      const session = await loadSession(req, res);
      if (!session) {
        return;
      }
      await fs.rm(session.sessionDir, { recursive: true, force: true });
      return res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);

model3dRouter.put(
  '/:id/model-3d',
  authenticateRequest,
  requireRole(...writeRoles),
  express.raw({
    type: ['application/octet-stream', 'model/gltf-binary', 'model/gltf+json', '*/*'],
    limit: '80mb',
  }),
  async (req, res, next) => {
    try {
      const project = await getProjectOr404(req, res);
      if (!project) {
        return;
      }

      const optimizeFlag = String(req.get('x-optimize-model') || '1').toLowerCase();
      const saved = await saveProjectGlbBuffer(project, req.body, {
        optimize: optimizeFlag !== '0' && optimizeFlag !== 'false',
      });
      return res.json(saved);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.code || 'MODEL_OPTIMIZE_FAILED',
          message: error.message,
        });
      }
      next(error);
    }
  },
);
