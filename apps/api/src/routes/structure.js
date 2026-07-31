import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { projectDistancePayload } from '../lib/geo.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const structureRouter = Router();

const buildingSchema = z.object({
  buildingCode: z.string().min(1),
  buildingName: z.string().min(1),
  buildingType: z.string().min(1),
  status: z.string().optional(),
});

const floorSchema = z.object({
  floorNumber: z.number().int(),
  floorName: z.string().optional().nullable(),
  floorPlan: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
  status: z.string().optional(),
});

const unitSchema = z.object({
  unitNumber: z.string().min(1),
  unitCode: z.string().min(1),
  unitType: z.string().min(1),
  bedrooms: z.number().int().optional(),
  bathrooms: z.number().int().optional(),
  area: z.number().optional().nullable(),
  basePrice: z.number().optional().nullable(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Currency code must be a 3-letter ISO code.')
    .optional(),
  status: z.string().optional(),
  featured: z.boolean().optional(),
  viewType: z.string().optional().nullable(),
  layoutPlan: z.string().optional().nullable(),
  media: z.array(z.string()).optional(),
  amenities: z.array(z.string()).optional(),
});

const nearbyDestinationSchema = z.object({
  label: z.string().min(1),
  category: z.string().optional(),
  latitude: z.number(),
  longitude: z.number(),
  mode: z.string().optional(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

function serializeNumber(value) {
  return value?.toString?.() ?? null;
}

function normalizeJsonArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }
    } catch {
      return [trimmed];
    }

    return [trimmed];
  }

  return [];
}

function toDecimalInput(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function serializeUnit(unit) {
  return {
    ...unit,
    area: serializeNumber(unit.area),
    basePrice: serializeNumber(unit.basePrice),
    media: normalizeJsonArray(unit.media),
    amenities: normalizeJsonArray(unit.amenities),
  };
}

function serializeFloor(floor) {
  return {
    ...floor,
    units: (floor.units || []).map(serializeUnit),
  };
}

function serializeBuilding(building) {
  return {
    ...building,
    floors: (building.floors || []).map(serializeFloor),
  };
}

function serializeProjectStructure(project) {
  return {
    ...project,
    startingPrice: serializeNumber(project.startingPrice),
    latitude: serializeNumber(project.latitude),
    longitude: serializeNumber(project.longitude),
    buildings: (project.buildings || []).map(serializeBuilding),
    nearbyDestinations: (project.nearbyDestinations || []).map((destination) => ({
      ...destination,
      latitude: serializeNumber(destination.latitude),
      longitude: serializeNumber(destination.longitude),
      distanceKm: destination.distanceKm,
      travelMinutes: destination.travelMinutes,
    })),
  };
}

async function loadProjectStructure(projectId) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      developer: true,
      buildings: {
        orderBy: { createdAt: 'asc' },
        include: {
          floors: {
            orderBy: [{ displayOrder: 'asc' }, { floorNumber: 'asc' }],
            include: {
              units: {
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
      },
      nearbyDestinations: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
}

structureRouter.get('/projects/:projectId/structure', async (req, res, next) => {
  try {
    const project = await loadProjectStructure(req.params.projectId);
    if (!project) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }

    res.json({ data: serializeProjectStructure(project) });
  } catch (error) {
    next(error);
  }
});

structureRouter.use(authenticateRequest);

structureRouter.get('/projects/:projectId/nearby-destinations', async (req, res, next) => {
  try {
    const destinations = await prisma.nearbyDestination.findMany({
      where: { projectId: req.params.projectId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    res.json({ data: destinations });
  } catch (error) {
    next(error);
  }
});

structureRouter.post('/projects/:projectId/nearby-destinations', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = nearbyDestinationSchema.parse(req.body);
    const project = await loadProjectStructure(req.params.projectId);
    if (!project) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Project not found.' });
    }

    const distancePayload = projectDistancePayload(
      project,
      {
        latitude: input.latitude,
        longitude: input.longitude,
      },
      input.mode || 'drive',
    );

    if (!distancePayload) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Project and POI coordinates are required to calculate distance.',
      });
    }

    const destination = await prisma.nearbyDestination.create({
      data: {
        projectId: req.params.projectId,
        label: input.label,
        category: input.category || 'other',
        latitude: toDecimalInput(input.latitude),
        longitude: toDecimalInput(input.longitude),
        distanceKm: distancePayload.distanceKm,
        travelMinutes: distancePayload.travelMinutes,
        mode: input.mode || 'drive',
        notes: input.notes || null,
        sortOrder: input.sortOrder || 0,
      },
    });

    res.status(201).json({ data: destination });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid nearby destination payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.put('/nearby-destinations/:destinationId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = nearbyDestinationSchema.partial().parse(req.body);
    const current = await prisma.nearbyDestination.findUnique({
      where: { id: req.params.destinationId },
      include: { project: true },
    });

    if (!current) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Nearby destination not found.' });
    }

    const nextLatitude = input.latitude !== undefined ? input.latitude : current.latitude?.toString?.() ?? null;
    const nextLongitude = input.longitude !== undefined ? input.longitude : current.longitude?.toString?.() ?? null;
    const nextMode = input.mode !== undefined ? input.mode : current.mode;
    const distancePayload = projectDistancePayload(
      current.project,
      {
        latitude: nextLatitude,
        longitude: nextLongitude,
      },
      nextMode || 'drive',
    );

    if (!distancePayload) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Project and POI coordinates are required to calculate distance.',
      });
    }

    const destination = await prisma.nearbyDestination.update({
      where: { id: req.params.destinationId },
      data: {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.category !== undefined ? { category: input.category || 'other' } : {}),
        ...(input.latitude !== undefined ? { latitude: toDecimalInput(input.latitude) } : {}),
        ...(input.longitude !== undefined ? { longitude: toDecimalInput(input.longitude) } : {}),
        ...(input.mode !== undefined ? { mode: input.mode || 'drive' } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        distanceKm: distancePayload.distanceKm,
        travelMinutes: distancePayload.travelMinutes,
      },
    });

    res.json({ data: destination });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid nearby destination payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.delete('/nearby-destinations/:destinationId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    await prisma.nearbyDestination.delete({
      where: { id: req.params.destinationId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

structureRouter.get('/projects/:projectId/buildings', async (req, res, next) => {
  try {
    const buildings = await prisma.building.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        floors: {
          orderBy: [{ displayOrder: 'asc' }, { floorNumber: 'asc' }],
          include: { units: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    res.json({ data: buildings.map(serializeBuilding) });
  } catch (error) {
    next(error);
  }
});

structureRouter.post('/projects/:projectId/buildings', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = buildingSchema.parse(req.body);
    const building = await prisma.building.create({
      data: {
        projectId: req.params.projectId,
        buildingCode: input.buildingCode,
        buildingName: input.buildingName,
        buildingType: input.buildingType,
        status: input.status || 'active',
      },
      include: {
        floors: { include: { units: true } },
      },
    });

    res.status(201).json({ data: serializeBuilding(building) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid building payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.put('/buildings/:buildingId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = buildingSchema.partial().parse(req.body);
    const building = await prisma.building.update({
      where: { id: req.params.buildingId },
      data: input,
      include: {
        floors: { include: { units: true } },
      },
    });

    res.json({ data: serializeBuilding(building) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid building payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.delete('/buildings/:buildingId', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.building.delete({
      where: { id: req.params.buildingId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

structureRouter.get('/buildings/:buildingId/floors', async (req, res, next) => {
  try {
    const floors = await prisma.floor.findMany({
      where: { buildingId: req.params.buildingId },
      orderBy: [{ displayOrder: 'asc' }, { floorNumber: 'asc' }],
      include: { units: { orderBy: { createdAt: 'asc' } } },
    });

    res.json({ data: floors.map(serializeFloor) });
  } catch (error) {
    next(error);
  }
});

structureRouter.post('/buildings/:buildingId/floors', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = floorSchema.parse(req.body);
    const building = await prisma.building.findUnique({
      where: { id: req.params.buildingId },
      select: { projectId: true },
    });

    if (!building) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Building not found.',
      });
    }

    const floor = await prisma.floor.create({
      data: {
        projectId: building.projectId,
        buildingId: req.params.buildingId,
        floorNumber: input.floorNumber,
        floorName: input.floorName || null,
        floorPlan: input.floorPlan || null,
        displayOrder: input.displayOrder || 0,
        status: input.status || 'active',
      },
      include: { units: true },
    });

    await prisma.building.update({
      where: { id: req.params.buildingId },
      data: {
        floorsCount: {
          increment: 1,
        },
      },
    });

    res.status(201).json({ data: serializeFloor(floor) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid floor payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.put('/floors/:floorId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = floorSchema.partial().parse(req.body);
    const floor = await prisma.floor.update({
      where: { id: req.params.floorId },
      data: {
        ...(input.floorNumber !== undefined ? { floorNumber: input.floorNumber } : {}),
        ...(input.floorName !== undefined ? { floorName: input.floorName } : {}),
        ...(input.floorPlan !== undefined ? { floorPlan: input.floorPlan } : {}),
        ...(input.displayOrder !== undefined ? { displayOrder: input.displayOrder } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      include: { units: true },
    });

    res.json({ data: serializeFloor(floor) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid floor payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.delete('/floors/:floorId', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.floor.delete({
      where: { id: req.params.floorId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

structureRouter.get('/floors/:floorId/units', async (req, res, next) => {
  try {
    const units = await prisma.unit.findMany({
      where: { floorId: req.params.floorId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ data: units.map(serializeUnit) });
  } catch (error) {
    next(error);
  }
});

structureRouter.post('/floors/:floorId/units', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = unitSchema.parse(req.body);
    const floor = await prisma.floor.findUnique({
      where: { id: req.params.floorId },
      select: { projectId: true, buildingId: true },
    });

    if (!floor) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Floor not found.',
      });
    }

    const unit = await prisma.unit.create({
      data: {
        projectId: floor.projectId,
        buildingId: floor.buildingId,
        floorId: req.params.floorId,
        unitNumber: input.unitNumber,
        unitCode: input.unitCode,
        unitType: input.unitType,
        bedrooms: input.bedrooms || 0,
        bathrooms: input.bathrooms || 0,
        area: toDecimalInput(input.area),
        basePrice: toDecimalInput(input.basePrice),
        currency: input.currency || 'AED',
        status: input.status || 'available',
        featured: input.featured || false,
        viewType: input.viewType || null,
        layoutPlan: input.layoutPlan || null,
        media: input.media || [],
        amenities: input.amenities || [],
      },
    });

    await prisma.building.update({
      where: { id: floor.buildingId },
      data: {
        unitsCount: {
          increment: 1,
        },
      },
    });

    res.status(201).json({ data: serializeUnit(unit) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid unit payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.put('/units/:unitId', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = unitSchema.partial().parse(req.body);
    const unit = await prisma.unit.update({
      where: { id: req.params.unitId },
      data: {
        ...(input.unitNumber !== undefined ? { unitNumber: input.unitNumber } : {}),
        ...(input.unitCode !== undefined ? { unitCode: input.unitCode } : {}),
        ...(input.unitType !== undefined ? { unitType: input.unitType } : {}),
        ...(input.bedrooms !== undefined ? { bedrooms: input.bedrooms } : {}),
        ...(input.bathrooms !== undefined ? { bathrooms: input.bathrooms } : {}),
        ...(input.area !== undefined ? { area: toDecimalInput(input.area) } : {}),
        ...(input.basePrice !== undefined ? { basePrice: toDecimalInput(input.basePrice) } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.featured !== undefined ? { featured: input.featured } : {}),
        ...(input.viewType !== undefined ? { viewType: input.viewType } : {}),
        ...(input.layoutPlan !== undefined ? { layoutPlan: input.layoutPlan } : {}),
        ...(input.media !== undefined ? { media: input.media } : {}),
        ...(input.amenities !== undefined ? { amenities: input.amenities } : {}),
      },
    });

    res.json({ data: serializeUnit(unit) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid unit payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

structureRouter.delete('/units/:unitId', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.unit.delete({
      where: { id: req.params.unitId },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
