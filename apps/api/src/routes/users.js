import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { normalizeRoleName, publicUserFromRecord } from '../lib/roles.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const usersRouter = Router();

const userInputSchema = z.object({
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.string().trim().optional(),
});

const passwordResetSchema = z.object({
  password: z.string().min(8),
});

function normalizeUserRecord(user) {
  return {
    ...publicUserFromRecord(user),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

usersRouter.use(authenticateRequest);

usersRouter.get('/', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        role: true,
      },
    });

    res.json({ data: users.map(normalizeUserRecord) });
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    const input = userInputSchema.parse(req.body);
    const roleName = normalizeRoleName(input.role);
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'DUPLICATE_RECORD',
        message: 'A user with this email already exists.',
      });
    }

    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: {
        name: roleName,
        description: roleName === 'buyer' ? 'Default buyer role' : null,
        isSystemRole: roleName.includes('administrator'),
      },
    });

    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: passwordHash,
        roleId: role.id,
      },
      include: {
        role: true,
      },
    });

    res.status(201).json({ data: normalizeUserRecord(user) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid user payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

usersRouter.put('/:id/password', requireRole('super-administrator', 'system-administrator'), async (req, res, next) => {
  try {
    const input = passwordResetSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 10);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        password: passwordHash,
      },
      include: {
        role: true,
      },
    });

    res.json({
      data: normalizeUserRecord(user),
    });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid password payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});
