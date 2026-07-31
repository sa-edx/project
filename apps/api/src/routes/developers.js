import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const developersRouter = Router();

const developerInputSchema = z.object({
  companyName: z.string().min(1),
  registrationNumber: z.string().optional().nullable(),
  contactPerson: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  logo: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  ownerUserId: z.string().uuid().optional().nullable(),
});

developersRouter.use(authenticateRequest);

developersRouter.get('/', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const developers = await prisma.developer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        ownerUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            roleId: true,
          },
        },
      },
    });

    res.json({ data: developers });
  } catch (error) {
    next(error);
  }
});

developersRouter.post('/', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    const input = developerInputSchema.parse(req.body);
    const developer = await prisma.developer.create({
      data: input,
      include: {
        ownerUser: true,
      },
    });

    res.status(201).json({ data: developer });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid developer payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

developersRouter.get('/:id', requireRole('super-administrator', 'system-administrator', 'developer'), async (req, res, next) => {
  try {
    const developer = await prisma.developer.findUnique({
      where: { id: req.params.id },
      include: {
        ownerUser: true,
        projects: true,
      },
    });

    if (!developer) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Developer not found.',
      });
    }

    res.json({ data: developer });
  } catch (error) {
    next(error);
  }
});

developersRouter.put('/:id', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    const input = developerInputSchema.partial().parse(req.body);
    const developer = await prisma.developer.update({
      where: { id: req.params.id },
      data: input,
      include: {
        ownerUser: true,
      },
    });

    res.json({ data: developer });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid developer payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

developersRouter.delete('/:id', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    await prisma.developer.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
