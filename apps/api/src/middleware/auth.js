import jwt from 'jsonwebtoken';

import { prisma } from '../lib/prisma.js';

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

export async function authenticateRequest(req, res, next) {
  try {
    const isPublicProjectRead =
      req.method === 'GET' &&
      (req.originalUrl === '/projects' ||
        req.originalUrl.startsWith('/projects/public') ||
        /^\/projects\/[^/]+$/.test(req.originalUrl));

    if (isPublicProjectRead) {
      return next();
    }

    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Missing bearer token.',
      });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({
        error: 'AUTH_FAILED',
        message: 'Invalid token subject.',
      });
    }

    req.auth = {
      userId: user.id,
      email: user.email,
      roleId: user.roleId,
      role: user.role?.name || null,
    };
    req.user = user;

    return next();
  } catch (error) {
    return res.status(401).json({
      error: 'AUTH_FAILED',
      message: 'Invalid or expired token.',
    });
  }
}

export function requireRole(...allowedRoles) {
  const normalized = allowedRoles.map((role) => String(role).trim().toLowerCase());

  return (req, res, next) => {
    const currentRole = String(req.auth?.role || '').trim().toLowerCase();
    if (!currentRole || !normalized.includes(currentRole)) {
      return res.status(403).json({
        error: 'ACCESS_DENIED',
        message: 'You do not have permission to access this resource.',
      });
    }

    return next();
  };
}
