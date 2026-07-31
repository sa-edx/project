import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { normalizeRoleName, publicUserFromRecord } from '../lib/roles.js';
import { signAccessToken } from '../lib/jwt.js';
import { authenticateRequest } from '../middleware/auth.js';

export const authRouter = Router();

const registerSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
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
        isSystemRole: roleName === 'buyer',
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
      include: { role: true },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role.name,
      roleId: user.role.id,
      email: user.email,
    });

    return res.status(201).json({
      user: publicUserFromRecord(user),
      accessToken,
    });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid registration payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid email or password.',
      });
    }

    const passwordOk = await bcrypt.compare(input.password, user.password);
    if (!passwordOk) {
      return res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid email or password.',
      });
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role.name,
      roleId: user.role.id,
      email: user.email,
    });

    return res.json({
      user: publicUserFromRecord(user),
      accessToken,
    });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid login payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

authRouter.get('/me', authenticateRequest, async (req, res) => {
  return res.json({
    user: publicUserFromRecord(req.user),
  });
});
