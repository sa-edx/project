import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const amenitiesRouter = Router();

const amenitySchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  description: z.string().optional().nullable(),
  image: z.string().optional().nullable(),
  status: z.string().optional(),
});

const projectAmenitySchema = z.object({
  amenityId: z.string().uuid(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

function serializeAmenity(amenity) {
  return {
    ...amenity,
    image: amenity.image || null,
  };
}

function serializeProjectAmenity(projectAmenity) {
  return {
    ...projectAmenity,
    amenity: projectAmenity.amenity ? serializeAmenity(projectAmenity.amenity) : null,
  };
}

async function loadProjectForAssignment(projectId) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
}

amenitiesRouter.use(authenticateRequest);

amenitiesRouter.get('/amenities', requireRole('super-administrator', 'system-administrator', 'developer', 'crm-administrator'), async (req, res, next) => {
  try {
    const { q, category, status } = req.query;
    const search = String(q || '').trim();

    const amenities = await prisma.amenity.findMany({
      where: {
        ...(category ? { category: String(category) } : {}),
        ...(status ? { status: String(status) } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { category: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    res.json({ data: amenities.map(serializeAmenity) });
  } catch (error) {
    next(error);
  }
});

amenitiesRouter.post('/amenities', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = amenitySchema.parse(req.body);
    const amenity = await prisma.amenity.create({
      data: {
        name: input.name,
        category: input.category || 'other',
        description: input.description || null,
        image: input.image || null,
        status: input.status || 'active',
      },
    });

    res.status(201).json({ data: serializeAmenity(amenity) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid amenity payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

amenitiesRouter.put('/amenities/:amenityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = amenitySchema.partial().parse(req.body);
    const amenity = await prisma.amenity.update({
      where: { id: req.params.amenityId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.category !== undefined ? { category: input.category || 'other' } : {}),
        ...(input.description !== undefined ? { description: input.description || null } : {}),
        ...(input.image !== undefined ? { image: input.image || null } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    });

    res.json({ data: serializeAmenity(amenity) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid amenity payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

amenitiesRouter.delete('/amenities/:amenityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    await prisma.amenity.delete({
      where: { id: req.params.amenityId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

amenitiesRouter.get('/projects/:projectId/amenities', async (req, res, next) => {
  try {
    const assignments = await prisma.projectAmenity.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { amenity: true },
    });

    res.json({ data: assignments.map(serializeProjectAmenity) });
  } catch (error) {
    next(error);
  }
});

amenitiesRouter.post('/projects/:projectId/amenities', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectAmenitySchema.parse(req.body);
    const [project, amenity] = await Promise.all([
      loadProjectForAssignment(req.params.projectId),
      prisma.amenity.findUnique({ where: { id: input.amenityId } }),
    ]);

    if (!project) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Project not found.' });
    }

    if (!amenity) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Amenity not found.' });
    }

    const assignment = await prisma.projectAmenity.upsert({
      where: {
        projectId_amenityId: {
          projectId: req.params.projectId,
          amenityId: input.amenityId,
        },
      },
      update: {
        notes: input.notes || null,
        sortOrder: input.sortOrder || 0,
      },
      create: {
        projectId: req.params.projectId,
        amenityId: input.amenityId,
        notes: input.notes || null,
        sortOrder: input.sortOrder || 0,
      },
      include: { amenity: true },
    });

    res.status(201).json({ data: serializeProjectAmenity(assignment) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project amenity payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

amenitiesRouter.put('/project-amenities/:projectAmenityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectAmenitySchema.partial().parse(req.body);
    const assignment = await prisma.projectAmenity.update({
      where: { id: req.params.projectAmenityId },
      data: {
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: { amenity: true },
    });

    res.json({ data: serializeProjectAmenity(assignment) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project amenity payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

amenitiesRouter.delete('/project-amenities/:projectAmenityId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    await prisma.projectAmenity.delete({
      where: { id: req.params.projectAmenityId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
