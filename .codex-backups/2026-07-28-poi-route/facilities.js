import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';
import { projectDistancePayload } from '../lib/geo.js';

export const facilitiesRouter = Router();

const facilitySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  address: z.string().optional().nullable(),
  icon: z.string().optional().nullable(),
  status: z.string().optional(),
});

const projectFacilitySchema = z.object({
  facilityId: z.string().uuid(),
  mode: z.string().optional(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

function serializeDecimal(value) {
  return value?.toString?.() ?? null;
}

function serializeFacility(facility) {
  return {
    ...facility,
    latitude: serializeDecimal(facility.latitude),
    longitude: serializeDecimal(facility.longitude),
  };
}

function serializeProjectFacility(projectFacility) {
  return {
    ...projectFacility,
    facility: projectFacility.facility ? serializeFacility(projectFacility.facility) : null,
  };
}

async function loadProjectForAssignment(projectId) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      latitude: true,
      longitude: true,
    },
  });
}

facilitiesRouter.use(authenticateRequest);

facilitiesRouter.get('/facilities', requireRole('super-administrator', 'system-administrator', 'developer', 'crm-administrator'), async (req, res, next) => {
  try {
    const { q, category, status } = req.query;
    const search = String(q || '').trim();

    const facilities = await prisma.facility.findMany({
      where: {
        ...(category ? { category: String(category) } : {}),
        ...(status ? { status: String(status) } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({ data: facilities.map(serializeFacility) });
  } catch (error) {
    next(error);
  }
});

facilitiesRouter.post('/facilities', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = facilitySchema.parse(req.body);
    const facility = await prisma.facility.create({
      data: {
        name: input.name,
        category: input.category || 'other',
        description: input.description || null,
        latitude: input.latitude === undefined ? null : input.latitude,
        longitude: input.longitude === undefined ? null : input.longitude,
        address: input.address || null,
        icon: input.icon || null,
        status: input.status || 'active',
      },
    });

    res.status(201).json({ data: serializeFacility(facility) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid facility payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

facilitiesRouter.put('/facilities/:facilityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = facilitySchema.partial().parse(req.body);
    const facility = await prisma.facility.update({
      where: { id: req.params.facilityId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category || 'other' } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
        ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
        ...(input.address !== undefined ? { address: input.address || null } : {}),
        ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    res.json({ data: serializeFacility(facility) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid facility payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

facilitiesRouter.delete('/facilities/:facilityId', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.facility.delete({
      where: { id: req.params.facilityId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

facilitiesRouter.get('/projects/:projectId/facilities', async (req, res, next) => {
  try {
    const assignments = await prisma.projectFacility.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { facility: true },
    });

    res.json({ data: assignments.map(serializeProjectFacility) });
  } catch (error) {
    next(error);
  }
});

facilitiesRouter.post('/projects/:projectId/facilities', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectFacilitySchema.parse(req.body);
    const [project, facility] = await Promise.all([
      loadProjectForAssignment(req.params.projectId),
      prisma.facility.findUnique({ where: { id: input.facilityId } }),
    ]);

    if (!project) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Project not found.' });
    }

    if (!facility) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Facility not found.' });
    }

    const distancePayload = projectDistancePayload(project, facility, input.mode || 'drive');
    if (!distancePayload) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Project and facility coordinates are required to calculate distance.',
      });
    }

    const assignment = await prisma.projectFacility.upsert({
      where: {
        projectId_facilityId: {
          projectId: req.params.projectId,
          facilityId: input.facilityId,
        },
      },
      update: {
        mode: input.mode || 'drive',
        notes: input.notes || null,
        sortOrder: input.sortOrder || 0,
        distanceKm: distancePayload.distanceKm,
        travelMinutes: distancePayload.travelMinutes,
      },
      create: {
        projectId: req.params.projectId,
        facilityId: input.facilityId,
        mode: input.mode || 'drive',
        notes: input.notes || null,
        sortOrder: input.sortOrder || 0,
        distanceKm: distancePayload.distanceKm,
        travelMinutes: distancePayload.travelMinutes,
      },
      include: { facility: true },
    });

    res.status(201).json({ data: serializeProjectFacility(assignment) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project facility payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

facilitiesRouter.put('/project-facilities/:projectFacilityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectFacilitySchema.partial().parse(req.body);
    const current = await prisma.projectFacility.findUnique({
      where: { id: req.params.projectFacilityId },
      include: { facility: true, project: true },
    });

    if (!current) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Project facility not found.' });
    }

    const distancePayload = projectDistancePayload(current.project, current.facility, input.mode || current.mode);

    const assignment = await prisma.projectFacility.update({
      where: { id: req.params.projectFacilityId },
      data: {
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        ...(distancePayload ? { distanceKm: distancePayload.distanceKm, travelMinutes: distancePayload.travelMinutes } : {}),
      },
      include: { facility: true },
    });

    res.json({ data: serializeProjectFacility(assignment) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project facility payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

facilitiesRouter.delete('/project-facilities/:projectFacilityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    await prisma.projectFacility.delete({
      where: { id: req.params.projectFacilityId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
