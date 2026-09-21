/**
 * File: apps/api/src/routes/unitTour.js
 * Purpose: Upload shared Pannellum tours and link/unlink them on units.
 * Many units may share one tourConfigUrl. Upload stores under a tour UUID folder
 * (not unit id). DELETE only unlinks the unit; files stay for other linked units.
 *
 * Routes:
 *   GET    /projects/:projectId/virtual-tours
 *   POST   /units/:unitId/virtual-tour   multipart field "tour" (.zip) OR JSON { tourConfigUrl }
 *   DELETE /units/:unitId/virtual-tour   unlink only
 */
import { Router } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const unitTourRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 120 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    const name = String(file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.zip') ||
      file.mimetype === 'application/zip' ||
      file.mimetype === 'application/x-zip-compressed' ||
      file.mimetype === 'application/octet-stream';
    if (!ok) {
      cb(new Error('Upload a .zip file containing vt.json and panorama images.'));
      return;
    }
    cb(null, true);
  },
});

const urlSchema = z.object({
  tourConfigUrl: z.union([z.string().trim().min(1), z.null()]),
});

function sharedTourDir(tourId) {
  return path.join(process.cwd(), 'uploads', 'unit-tours', tourId);
}

function publicTourConfigUrl(tourId, relativeConfigPath) {
  const normalized = String(relativeConfigPath || 'vt.json').replace(/\\/g, '/').replace(/^\/+/, '');
  return `/uploads/unit-tours/${tourId}/${normalized}`;
}

function normalizeZipPath(entryName) {
  return String(entryName || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
}

function isSafeZipPath(entryName) {
  const normalized = normalizeZipPath(entryName);
  if (!normalized || normalized.includes('\0')) {
    return false;
  }
  if (normalized.split('/').some((part) => part === '..')) {
    return false;
  }
  return true;
}

function findConfigEntry(entries) {
  const candidates = entries
    .filter((entry) => !entry.isDirectory && isSafeZipPath(entry.entryName))
    .map((entry) => normalizeZipPath(entry.entryName))
    .filter((name) => /(^|\/)vt\.json$/i.test(name) || /(^|\/)tour\.json$/i.test(name) || /(^|\/)config\.json$/i.test(name));

  if (!candidates.length) {
    return null;
  }

  candidates.sort((left, right) => {
    const leftDepth = left.split('/').length;
    const rightDepth = right.split('/').length;
    if (leftDepth !== rightDepth) {
      return leftDepth - rightDepth;
    }
    if (/vt\.json$/i.test(left) && !/vt\.json$/i.test(right)) {
      return -1;
    }
    if (/vt\.json$/i.test(right) && !/vt\.json$/i.test(left)) {
      return 1;
    }
    return left.localeCompare(right);
  });

  return candidates[0];
}

async function extractZipSafely(buffer, targetDir) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();
  const configEntry = findConfigEntry(entries);

  if (!configEntry) {
    const error = new Error('ZIP must include a vt.json (or tour.json / config.json) Pannellum config file.');
    error.statusCode = 400;
    throw error;
  }

  await fs.mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    const relative = normalizeZipPath(entry.entryName);
    if (!isSafeZipPath(relative)) {
      continue;
    }

    const destination = path.join(targetDir, relative);
    if (!destination.startsWith(targetDir)) {
      continue;
    }

    if (entry.isDirectory) {
      await fs.mkdir(destination, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, entry.getData());
  }

  return configEntry;
}

function serializeUnitTour(unit) {
  return {
    id: unit.id,
    tourConfigUrl: unit.tourConfigUrl || null,
  };
}

function groupProjectTours(units) {
  const byUrl = new Map();

  for (const unit of units) {
    const url = unit.tourConfigUrl;
    if (!url) {
      continue;
    }

    if (!byUrl.has(url)) {
      byUrl.set(url, {
        tourConfigUrl: url,
        unitCount: 0,
        units: [],
      });
    }

    const entry = byUrl.get(url);
    entry.unitCount += 1;
    entry.units.push({
      id: unit.id,
      unitNumber: unit.unitNumber,
      unitCode: unit.unitCode,
    });
  }

  return [...byUrl.values()].sort((left, right) => left.tourConfigUrl.localeCompare(right.tourConfigUrl));
}

unitTourRouter.use(authenticateRequest);

unitTourRouter.get(
  '/projects/:projectId/virtual-tours',
  requireRole('super-administrator', 'system-administrator', 'developer'),
  async (req, res, next) => {
    try {
      const units = await prisma.unit.findMany({
        where: {
          projectId: req.params.projectId,
          tourConfigUrl: { not: null },
        },
        select: {
          id: true,
          unitNumber: true,
          unitCode: true,
          tourConfigUrl: true,
        },
        orderBy: { unitNumber: 'asc' },
      });

      res.json({ data: groupProjectTours(units) });
    } catch (error) {
      next(error);
    }
  },
);

const linkDefaultSchema = z.object({
  tourConfigUrl: z.string().trim().min(1),
  mode: z.enum(['missing', 'all']).optional().default('missing'),
});

unitTourRouter.post(
  '/projects/:projectId/virtual-tours/link-default',
  requireRole('super-administrator', 'system-administrator', 'developer'),
  async (req, res, next) => {
    try {
      const input = linkDefaultSchema.parse(req.body || {});
      const where = {
        projectId: req.params.projectId,
        ...(input.mode === 'missing' ? { tourConfigUrl: null } : {}),
      };

      const result = await prisma.unit.updateMany({
        where,
        data: { tourConfigUrl: input.tourConfigUrl },
      });

      res.json({
        data: {
          updatedCount: result.count,
          tourConfigUrl: input.tourConfigUrl,
          mode: input.mode,
        },
        message:
          input.mode === 'all'
            ? `Linked ${result.count} unit(s) to the selected tour.`
            : `Linked ${result.count} unit(s) that had no tour.`,
      });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid link-default payload.',
          details: error.issues,
        });
      }
      next(error);
    }
  },
);

unitTourRouter.post(
  '/units/:unitId/virtual-tour',
  requireRole('super-administrator', 'system-administrator', 'developer'),
  (req, res, next) => {
    if (String(req.headers['content-type'] || '').includes('multipart/form-data')) {
      return upload.single('tour')(req, res, (error) => {
        if (error) {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: error.message || 'Invalid tour upload.',
          });
        }
        return next();
      });
    }
    return next();
  },
  async (req, res, next) => {
    try {
      const unitId = req.params.unitId;
      const existing = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { id: true },
      });

      if (!existing) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Unit not found.',
        });
      }

      if (req.file) {
        // Shared tour package — not tied to this unit id so other units can link it.
        const tourId = crypto.randomUUID();
        const targetDir = sharedTourDir(tourId);
        const configEntry = await extractZipSafely(req.file.buffer, targetDir);
        const tourConfigUrl = publicTourConfigUrl(tourId, configEntry);
        const unit = await prisma.unit.update({
          where: { id: unitId },
          data: { tourConfigUrl },
        });

        return res.json({
          data: serializeUnitTour(unit),
          message: 'Virtual tour uploaded and linked to this unit. Other units can reuse the same tour.',
        });
      }

      const input = urlSchema.parse(req.body || {});
      const unit = await prisma.unit.update({
        where: { id: unitId },
        data: { tourConfigUrl: input.tourConfigUrl },
      });

      return res.json({
        data: serializeUnitTour(unit),
        message: input.tourConfigUrl ? 'Unit linked to virtual tour.' : 'Unit unlinked from virtual tour.',
      });
    } catch (error) {
      if (error?.name === 'ZodError') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Invalid tour payload.',
          details: error.issues,
        });
      }
      if (error?.statusCode === 400) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.message,
        });
      }
      next(error);
    }
  },
);

unitTourRouter.delete(
  '/units/:unitId/virtual-tour',
  requireRole('super-administrator', 'system-administrator', 'developer'),
  async (req, res, next) => {
    try {
      const unitId = req.params.unitId;
      const existing = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { id: true },
      });

      if (!existing) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Unit not found.',
        });
      }

      // Unlink only — keep files so other units sharing this tour keep working.
      const unit = await prisma.unit.update({
        where: { id: unitId },
        data: { tourConfigUrl: null },
      });

      res.json({
        data: serializeUnitTour(unit),
        message: 'Unit unlinked from virtual tour.',
      });
    } catch (error) {
      next(error);
    }
  },
);
