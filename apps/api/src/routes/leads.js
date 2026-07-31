import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../lib/prisma.js';
import { authenticateRequest, requireRole } from '../middleware/auth.js';

export const leadsRouter = Router();

const leadInputSchema = z.object({
  projectId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(),
  source: z.string().optional(),
  firstName: z.string().min(1),
  lastName: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  preferredLanguage: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedToName: z.string().optional().nullable(),
  visitRequested: z.boolean().optional(),
  preferredVisitAt: z.string().optional().nullable(),
});

const leadUpdateSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  assignedToName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  visitRequested: z.boolean().optional(),
  preferredVisitAt: z.string().optional().nullable(),
});

const bookingInputSchema = z.object({
  leadId: z.string().uuid(),
  projectId: z.string().uuid(),
  unitId: z.string().uuid().optional().nullable(),
  bookingReference: z.string().optional(),
  status: z.string().optional(),
  reservationAmount: z.number().optional().nullable(),
  currency: z.string().optional(),
  bookedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bookingUpdateSchema = z.object({
  status: z.string().optional(),
  reservationAmount: z.number().optional().nullable(),
  currency: z.string().optional(),
  bookedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

function serializeDate(value) {
  return value ? value.toISOString() : null;
}

function serializeLead(lead) {
  if (!lead) {
    return null;
  }

  return {
    ...lead,
    preferredVisitAt: serializeDate(lead.preferredVisitAt),
    createdAt: serializeDate(lead.createdAt),
    updatedAt: serializeDate(lead.updatedAt),
    project: lead.project
      ? {
          ...lead.project,
          startingPrice: lead.project.startingPrice?.toString?.() ?? null,
        }
      : null,
    unit: lead.unit
      ? {
          ...lead.unit,
          area: lead.unit.area?.toString?.() ?? null,
          basePrice: lead.unit.basePrice?.toString?.() ?? null,
          media: lead.unit.media || [],
          amenities: lead.unit.amenities || [],
        }
      : null,
    bookings: (lead.bookings || []).map(serializeBooking),
    siteVisits: (lead.siteVisits || []).map(serializeSiteVisit),
  };
}

function serializeSiteVisit(visit) {
  return {
    ...visit,
    preferredVisitAt: serializeDate(visit.preferredVisitAt),
    scheduledFor: serializeDate(visit.scheduledFor),
    createdAt: serializeDate(visit.createdAt),
    updatedAt: serializeDate(visit.updatedAt),
    project: visit.project
      ? {
          id: visit.project.id,
          projectName: visit.project.projectName,
          projectCode: visit.project.projectCode,
        }
      : null,
    unit: visit.unit
      ? {
          id: visit.unit.id,
          unitNumber: visit.unit.unitNumber,
          unitCode: visit.unit.unitCode,
        }
      : null,
  };
}

function serializeBooking(booking) {
  return {
    ...booking,
    reservationAmount: booking.reservationAmount?.toString?.() ?? null,
    bookedAt: serializeDate(booking.bookedAt),
    createdAt: serializeDate(booking.createdAt),
    updatedAt: serializeDate(booking.updatedAt),
    lead: booking.lead
      ? {
          id: booking.lead.id,
          firstName: booking.lead.firstName,
          lastName: booking.lead.lastName,
          email: booking.lead.email,
          phone: booking.lead.phone,
          status: booking.lead.status,
          priority: booking.lead.priority,
        }
      : null,
    project: booking.project
      ? {
          id: booking.project.id,
          projectName: booking.project.projectName,
          projectCode: booking.project.projectCode,
        }
      : null,
    unit: booking.unit
      ? {
          id: booking.unit.id,
          unitNumber: booking.unit.unitNumber,
          unitCode: booking.unit.unitCode,
        }
      : null,
  };
}

function toDateInput(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadLeadById(id) {
  return prisma.lead.findUnique({
    where: { id },
    include: {
      project: {
        include: {
          developer: {
            select: {
              id: true,
              companyName: true,
              email: true,
              phone: true,
            },
          },
        },
      },
      unit: true,
      bookings: {
        orderBy: { createdAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              status: true,
              priority: true,
            },
          },
          project: {
            select: {
              id: true,
              projectName: true,
              projectCode: true,
            },
          },
          unit: {
            select: {
              id: true,
              unitNumber: true,
              unitCode: true,
            },
          },
        },
      },
      siteVisits: {
        orderBy: { createdAt: 'desc' },
        include: {
          project: {
            select: {
              id: true,
              projectName: true,
              projectCode: true,
            },
          },
          unit: {
            select: {
              id: true,
              unitNumber: true,
              unitCode: true,
            },
          },
        },
      },
    },
  });
}

async function loadBookingById(id) {
  return prisma.booking.findUnique({
    where: { id },
    include: {
      lead: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          status: true,
          priority: true,
        },
      },
      project: {
        select: {
          id: true,
          projectName: true,
          projectCode: true,
        },
      },
      unit: {
        select: {
          id: true,
          unitNumber: true,
          unitCode: true,
        },
      },
    },
  });
}

leadsRouter.post('/', async (req, res, next) => {
  try {
    const input = leadInputSchema.parse(req.body);
    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }

    let unit = null;
    if (input.unitId) {
      unit = await prisma.unit.findUnique({
        where: { id: input.unitId },
        select: { id: true, projectId: true },
      });

      if (!unit) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Unit not found.',
        });
      }

      if (unit.projectId !== input.projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Selected unit does not belong to the selected project.',
        });
      }
    }

    const preferredVisitAt = toDateInput(input.preferredVisitAt);
    const lead = await prisma.lead.create({
      data: {
        projectId: input.projectId,
        unitId: unit?.id || null,
        source: input.source || 'public-enquiry',
        firstName: input.firstName,
        lastName: input.lastName || null,
        email: input.email || null,
        phone: input.phone || null,
        country: input.country || null,
        city: input.city || null,
        preferredLanguage: input.preferredLanguage || null,
        notes: input.notes || null,
        status: input.status || 'new',
        priority: input.priority || 'normal',
        assignedToName: input.assignedToName || null,
        visitRequested: Boolean(input.visitRequested || preferredVisitAt),
        preferredVisitAt,
      },
    });

    if (lead.visitRequested || preferredVisitAt) {
      await prisma.siteVisit.create({
        data: {
          leadId: lead.id,
          projectId: input.projectId,
          unitId: unit?.id || null,
          preferredVisitAt,
          status: 'requested',
          notes: input.notes || null,
        },
      });
    }

    const record = await loadLeadById(lead.id);
    res.status(201).json({ data: serializeLead(record) || serializeLead(lead) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid lead payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

leadsRouter.use(authenticateRequest);

leadsRouter.get('/', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const { status, projectId, q } = req.query;
    const search = String(q || '').trim();
    const leads = await prisma.lead.findMany({
      where: {
        ...(status ? { status: String(status) } : {}),
        ...(projectId ? { projectId: String(projectId) } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { country: { contains: search, mode: 'insensitive' } },
                { notes: { contains: search, mode: 'insensitive' } },
                {
                  project: {
                    projectName: { contains: search, mode: 'insensitive' },
                  },
                },
                {
                  unit: {
                    unitNumber: { contains: search, mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          include: {
            developer: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        unit: true,
        siteVisits: {
          orderBy: { createdAt: 'desc' },
          include: {
            project: {
              select: { id: true, projectName: true, projectCode: true },
            },
            unit: {
              select: { id: true, unitNumber: true, unitCode: true },
            },
          },
        },
      },
    });

    res.json({ data: leads.map(serializeLead) });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get('/site-visits', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const visits = await prisma.siteVisit.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            priority: true,
          },
        },
        project: {
          select: {
            id: true,
            projectName: true,
            projectCode: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            unitCode: true,
          },
        },
      },
    });

    res.json({ data: visits.map(serializeSiteVisit) });
  } catch (error) {
    next(error);
  }
});

leadsRouter.get('/bookings', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            status: true,
            priority: true,
          },
        },
        project: {
          select: {
            id: true,
            projectName: true,
            projectCode: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            unitCode: true,
          },
        },
      },
    });

    res.json({ data: bookings.map(serializeBooking) });
  } catch (error) {
    next(error);
  }
});

leadsRouter.post('/bookings', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const input = bookingInputSchema.parse(req.body);
    const lead = await prisma.lead.findUnique({
      where: { id: input.leadId },
      select: { id: true, projectId: true, unitId: true, status: true },
    });

    if (!lead) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Lead not found.',
      });
    }

    const project = await prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });

    if (!project) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Project not found.',
      });
    }

    if (lead.projectId !== input.projectId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Booking project must match the lead project.',
      });
    }

    const unitId = input.unitId || lead.unitId || null;
    if (unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: unitId },
        select: { id: true, projectId: true },
      });

      if (!unit || unit.projectId !== input.projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Selected unit does not belong to the selected project.',
        });
      }
    }

    const booking = await prisma.booking.create({
      data: {
        leadId: input.leadId,
        projectId: input.projectId,
        unitId,
        bookingReference: input.bookingReference || `BK-${Date.now()}`,
        status: input.status || 'reserved',
        reservationAmount: input.reservationAmount ?? null,
        currency: input.currency || 'AED',
        bookedAt: toDateInput(input.bookedAt),
        notes: input.notes || null,
      },
    });

    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        status: input.status === 'booked' ? 'booked' : 'reservation-pending',
      },
    });

    const record = await loadBookingById(booking.id);
    res.status(201).json({ data: serializeBooking(record) || serializeBooking(booking) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid booking payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

leadsRouter.put('/bookings/:id', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const input = bookingUpdateSchema.partial().parse(req.body);
    const existing = await prisma.booking.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Booking not found.',
      });
    }

    const booking = await prisma.booking.update({
      where: { id: req.params.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.reservationAmount !== undefined ? { reservationAmount: input.reservationAmount } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.bookedAt !== undefined ? { bookedAt: toDateInput(input.bookedAt) } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    if (input.status) {
      await prisma.lead.update({
        where: { id: existing.leadId },
        data: {
          status: input.status === 'booked' ? 'booked' : existing.status === 'booked' ? 'booked' : 'reservation-pending',
        },
      });
    }

    const record = await loadBookingById(booking.id);
    res.json({ data: serializeBooking(record) || serializeBooking(booking) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid booking payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});

leadsRouter.put('/:id', requireRole('super-administrator', 'system-administrator', 'developer', 'sales-manager', 'sales-agent', 'crm-administrator'), async (req, res, next) => {
  try {
    const input = leadUpdateSchema.partial().parse(req.body);
    const existing = await prisma.lead.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Lead not found.',
      });
    }

    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assignedToName !== undefined ? { assignedToName: input.assignedToName } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.visitRequested !== undefined ? { visitRequested: input.visitRequested } : {}),
        ...(input.preferredVisitAt !== undefined ? { preferredVisitAt: toDateInput(input.preferredVisitAt) } : {}),
      },
    });

    const record = await loadLeadById(lead.id);
    res.json({ data: serializeLead(record) || serializeLead(lead) });
  } catch (error) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid lead payload.',
        details: error.issues,
      });
    }

    next(error);
  }
});
