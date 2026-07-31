import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'node:fs';
import path from 'node:path';
import { Prisma } from './generated/prisma-client/index.js';
import { ZodError } from 'zod';

import { authRouter } from './routes/auth.js';
import { developersRouter } from './routes/developers.js';
import { amenitiesRouter } from './routes/amenities.js';
import { leadsRouter } from './routes/leads.js';
import { facilitiesRouter } from './routes/facilities.js';
import { healthRouter } from './routes/health.js';
import { getProjectHandler, listProjectsHandler, projectsRouter } from './routes/projects.js';
import { structureRouter } from './routes/structure.js';
import { usersRouter } from './routes/users.js';

export function createApp() {
  const app = express();
  const uploadsDir = path.join(process.cwd(), 'uploads');

  fs.mkdirSync(uploadsDir, { recursive: true });

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(morgan('dev'));
  app.use('/uploads', express.static(uploadsDir));

  app.use('/health', healthRouter);
  app.use('/auth', authRouter);
  app.use('/developers', developersRouter);
  app.use('/users', usersRouter);
  app.use('/', facilitiesRouter);
  app.use('/', amenitiesRouter);
  app.use('/leads', leadsRouter);

  app.get('/projects/public', listProjectsHandler);
  app.get('/projects/public/:id', getProjectHandler);
  app.get('/projects', listProjectsHandler);
  app.get('/projects/:id', getProjectHandler);

  app.use('/projects', projectsRouter);
  app.use('/', structureRouter);

  app.use((req, res) => {
    res.status(404).json({
      error: 'NOT_FOUND',
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  function getPrismaErrorResponse(err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      switch (err.code) {
        case 'P2002':
          return {
            statusCode: 409,
            error: 'CONFLICT',
            message: 'A record with the same value already exists.',
          };
        case 'P2003':
          return {
            statusCode: 400,
            error: 'VALIDATION_ERROR',
            message: 'Invalid reference provided. Please select an existing related record.',
          };
        case 'P2000':
          return {
            statusCode: 400,
            error: 'VALIDATION_ERROR',
            message: 'One of the values is too long for the database field.',
          };
        case 'P2011':
          return {
            statusCode: 400,
            error: 'VALIDATION_ERROR',
            message: 'A required field is missing or empty.',
          };
        case 'P2013':
          return {
            statusCode: 400,
            error: 'VALIDATION_ERROR',
            message: 'A required value was not provided.',
          };
        case 'P2025':
          return {
            statusCode: 404,
            error: 'NOT_FOUND',
            message: 'The requested record could not be found.',
          };
        default:
          return {
            statusCode: 400,
            error: 'VALIDATION_ERROR',
            message: 'The database rejected one of the values you submitted.',
          };
      }
    }

    if (err instanceof Prisma.PrismaClientValidationError) {
      return {
        statusCode: 400,
        error: 'VALIDATION_ERROR',
        message: 'Invalid data was submitted. Please check the form values and try again.',
      };
    }

    return null;
  }

  app.use((err, req, res, next) => {
    console.error(err);

    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request payload.',
        details: err.issues,
      });
    }

    const prismaResponse = getPrismaErrorResponse(err);
    if (prismaResponse) {
      return res.status(prismaResponse.statusCode).json({
        error: prismaResponse.error,
        message: prismaResponse.message,
      });
    }

    res.status(err.statusCode || 500).json({
      error: 'SERVER_ERROR',
      message: err.statusCode ? err.message : 'Unexpected server error',
    });
  });

  return app;
}
