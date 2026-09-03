import express, { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { buildProjectSlug } from '../lib/slug.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const projectsRouter = Router();

const projectInputSchema = z.object({
  developerId: z.string().uuid().optional(),
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  projectType: z.string().min(1),
  description: z.string().optional().nullable(),
  country: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  startingPrice: z.number().optional().nullable(),
  gallery: z.array(z.string()).optional(),
  coverImage: z.string().optional().nullable(),
  mapMarkerImage: z.string().optional().nullable(),
  status: z.string().optional(),
});

function serializeProject(project) {
  return {
    ...project,
    startingPrice: project.startingPrice?.toString?.() ?? null,
    latitude: project.latitude?.toString?.() ?? null,
    longitude: project.longitude?.toString?.() ?? null,
    gallery: project.gallery || [],
    coverImage: project.coverImage || null,
    mapMarkerImage: project.mapMarkerImage || null,
    nearbyDestinations: (project.nearbyDestinations || []).map((destination) => ({
      ...destination,
      latitude: destination.latitude?.toString?.() ?? null,
      longitude: destination.longitude?.toString?.() ?? null,
      distanceKm: destination.distanceKm,
      travelMinutes: destination.travelMinutes,
    })),
    projectFacilities: (project.projectFacilities || []).map((assignment) => ({
      ...assignment,
      distanceKm: assignment.distanceKm,
      travelMinutes: assignment.travelMinutes,
      facility: assignment.facility
        ? {
            ...assignment.facility,
            latitude: assignment.facility.latitude?.toString?.() ?? null,
            longitude: assignment.facility.longitude?.toString?.() ?? null,
            image: assignment.facility.image || null,
          }
        : null,
    })),
    projectAmenities: (project.projectAmenities || []).map((assignment) => ({
      ...assignment,
      amenity: assignment.amenity
        ? {
            ...assignment.amenity,
            image: assignment.amenity.image || null,
          }
        : null,
    })),
  };
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

async function resolveDeveloperIdForWrite(req, developerId) {
  if (developerId) {
    return developerId;
  }

  if (req.auth?.role === 'developer') {
    const developer = await prisma.developer.findUnique({
      where: { ownerUserId: req.auth.userId },
      select: { id: true },
    });

    if (!developer) {
      const error = new Error('Developer profile not found for current user.');
      error.statusCode = 400;
      throw error;
    }

    return developer.id;
  }

  return null;
}

export async function listProjectsHandler(req, res, next) {
  try {
    const { status, country, city, q } = req.query;
    const search = String(q || '').trim();
    const projects = await prisma.project.findMany({
      where: {
        ...(status ? { status: String(status) } : {}),
        ...(country ? { country: String(country) } : {}),
        ...(city ? { city: String(city) } : {}),
        ...(search
          ? {
              OR: [
                { projectName: { contains: search, mode: 'insensitive' } },
                { projectCode: { contains: search, mode: 'insensitive' } },
                { projectType: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                {
                  developer: {
                    companyName: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        developer: {
          select: {
            id: true,
            companyName: true,
            country: true,
            city: true,
          },
        },
      },
    });

    res.json({ data: projects.map(serializeProject) });
  } catch (error) {
    next(error);
  }
}

export async function getProjectHandler(req, res, next) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        developer: true,
        nearbyDestinations: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        projectFacilities: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            facility: true,
          },
        },
        projectAmenities: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: {
            amenity: true,
          },
        },
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
      },
    });

    if (!project) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }

    res.json({
      data: {
        ...serializeProject(project),
        buildings: (project.buildings || []).map((building) => ({
          ...building,
          floors: (building.floors || []).map((floor) => ({
            ...floor,
            units: (floor.units || []).map((unit) => ({
              ...unit,
              area: unit.area?.toString?.() ?? null,
              basePrice: unit.basePrice?.toString?.() ?? null,
              media: normalizeJsonArray(unit.media),
              amenities: normalizeJsonArray(unit.amenities),
            })),
          })),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

projectsRouter.get('/public', listProjectsHandler);
projectsRouter.get('/', listProjectsHandler);

projectsRouter.get('/public/:id', getProjectHandler);
projectsRouter.get('/:id', getProjectHandler);

projectsRouter.post('/', authenticateRequest, requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectInputSchema.parse(req.body);
    const developerId = await resolveDeveloperIdForWrite(req, input.developerId);

    if (!developerId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'developerId is required for this user.',
      });
    }

    const project = await prisma.project.create({
      data: {
        developerId,
        projectCode: input.projectCode,
        projectName: input.projectName,
        projectType: input.projectType,
        description: input.description || null,
        country: input.country,
        city: input.city,
        address: input.address,
        latitude: toDecimalInput(input.latitude),
        longitude: toDecimalInput(input.longitude),
        startingPrice: toDecimalInput(input.startingPrice),
        gallery: input.gallery || [],
        coverImage: input.coverImage || null,
        mapMarkerImage: input.mapMarkerImage || null,
        status: input.status || 'draft',
        slug: buildProjectSlug(input.projectName, input.projectCode),
      },
      include: {
        developer: true,
      },
    });

    res.status(201).json({ data: serializeProject(project) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

projectsRouter.put('/:id', authenticateRequest, requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const input = projectInputSchema.partial().parse(req.body);
    const existing = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        ...(input.developerId ? { developerId: input.developerId } : {}),
        ...(input.projectCode ? { projectCode: input.projectCode } : {}),
        ...(input.projectName ? { projectName: input.projectName } : {}),
        ...(input.projectType ? { projectType: input.projectType } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.country ? { country: input.country } : {}),
        ...(input.city ? { city: input.city } : {}),
        ...(input.address ? { address: input.address } : {}),
        ...(input.latitude !== undefined ? { latitude: toDecimalInput(input.latitude) } : {}),
        ...(input.longitude !== undefined ? { longitude: toDecimalInput(input.longitude) } : {}),
        ...(input.startingPrice !== undefined ? { startingPrice: toDecimalInput(input.startingPrice) } : {}),
        ...(input.gallery !== undefined ? { gallery: input.gallery } : {}),
        ...(input.coverImage !== undefined ? { coverImage: input.coverImage } : {}),
        ...(input.mapMarkerImage !== undefined ? { mapMarkerImage: input.mapMarkerImage } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.projectName || input.projectCode
          ? { slug: buildProjectSlug(input.projectName || existing.projectName, input.projectCode || existing.projectCode) }
          : {}),
      },
      include: {
        developer: true,
      },
    });

    res.json({ data: serializeProject(project) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid project payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

projectsRouter.delete('/:id', authenticateRequest, requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.project.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
