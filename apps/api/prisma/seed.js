import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma-client/index.js';

const prisma = new PrismaClient();

const roles = [
  { name: 'super-administrator', isSystemRole: true, description: 'Full platform access' },
  { name: 'system-administrator', isSystemRole: true, description: 'Infrastructure and operations' },
  { name: 'developer', isSystemRole: true, description: 'Developer / Project Owner' },
  { name: 'sales-manager', isSystemRole: true, description: 'Sales team lead' },
  { name: 'sales-agent', isSystemRole: true, description: 'Sales agent / channel partner' },
  { name: 'content-maker', isSystemRole: true, description: 'Draft and prepare content' },
  { name: 'content-approver', isSystemRole: true, description: 'Approve and publish content' },
  { name: 'buyer', isSystemRole: true, description: 'Registered buyer' },
  { name: 'guest-visitor', isSystemRole: true, description: 'Public visitor' },
  { name: 'crm-administrator', isSystemRole: true, description: 'CRM integration and sync' },
];

const permissions = [
  { module: 'users', action: 'manage', description: 'Manage users and roles' },
  { module: 'projects', action: 'read', description: 'View projects' },
  { module: 'projects', action: 'write', description: 'Create and edit projects' },
  { module: 'projects', action: 'publish', description: 'Publish projects' },
  { module: 'units', action: 'read', description: 'View units and availability' },
  { module: 'units', action: 'write', description: 'Create and edit units' },
  { module: 'leads', action: 'read', description: 'View leads' },
  { module: 'leads', action: 'write', description: 'Create and edit leads' },
  { module: 'leads', action: 'assign', description: 'Assign leads to sales staff' },
  { module: 'bookings', action: 'write', description: 'Create and manage bookings' },
  { module: 'visits', action: 'write', description: 'Schedule and manage visits' },
  { module: 'cms', action: 'write', description: 'Edit CMS content' },
  { module: 'cms', action: 'publish', description: 'Publish CMS content' },
  { module: 'audit-logs', action: 'read', description: 'View audit logs' },
  { module: 'integrations', action: 'manage', description: 'Manage external integrations' },
];

const rolePermissionMap = {
  'super-administrator': permissions.map((permission) => permission),
  'system-administrator': permissions.filter((permission) =>
    ['users', 'audit-logs', 'integrations'].includes(permission.module)
  ),
  developer: permissions.filter((permission) =>
    ['projects', 'units', 'bookings', 'visits', 'leads'].includes(permission.module)
  ),
  'sales-manager': permissions.filter((permission) =>
    ['projects', 'units', 'leads', 'bookings', 'visits'].includes(permission.module)
  ),
  'sales-agent': permissions.filter((permission) =>
    ['projects', 'units', 'leads', 'bookings', 'visits'].includes(permission.module)
  ),
  'content-maker': permissions.filter((permission) => ['projects', 'cms'].includes(permission.module)),
  'content-approver': permissions.filter((permission) => ['projects', 'cms'].includes(permission.module)),
  buyer: permissions.filter((permission) => ['projects', 'units', 'bookings', 'visits', 'leads'].includes(permission.module)),
  'guest-visitor': permissions.filter((permission) => permission.module === 'projects' && permission.action === 'read'),
  'crm-administrator': permissions.filter((permission) => ['leads', 'integrations'].includes(permission.module)),
};

async function main() {
  const roleRecords = new Map();
  const permissionRecords = new Map();

  for (const role of roles) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        description: role.description,
        isSystemRole: role.isSystemRole,
      },
      create: role,
    });
    roleRecords.set(role.name, record);
  }

  for (const permission of permissions) {
    const record = await prisma.permission.upsert({
      where: {
        module_action: {
          module: permission.module,
          action: permission.action,
        },
      },
      update: {
        description: permission.description,
      },
      create: permission,
    });
    permissionRecords.set(`${permission.module}:${permission.action}`, record);
  }

  for (const [roleName, mappedPermissions] of Object.entries(rolePermissionMap)) {
    const role = roleRecords.get(roleName);
    for (const permission of mappedPermissions) {
      const mappedPermission = permissionRecords.get(`${permission.module}:${permission.action}`);
      if (!mappedPermission) {
        continue;
      }

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: mappedPermission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: mappedPermission.id,
        },
      });
    }
  }

  const adminRole = roleRecords.get('super-administrator');
  const adminEmail = 'admin@example.com';
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        firstName: 'System',
        lastName: 'Admin',
        email: adminEmail,
        password: await bcrypt.hash('Admin1234!', 10),
        roleId: adminRole.id,
      },
    });
  }

  const existingDeveloper = await prisma.developer.findFirst({
    where: { companyName: 'Default Developer Co' },
  });

  if (!existingDeveloper) {
    await prisma.developer.create({
      data: {
        companyName: 'Default Developer Co',
        country: 'UAE',
        city: 'Dubai',
        status: 'active',
        description: 'Seeded developer for initial project testing',
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completed successfully.');
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
