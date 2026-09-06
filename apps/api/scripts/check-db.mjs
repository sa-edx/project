import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma-client/index.js';

const prisma = new PrismaClient();

try {
  await prisma.$connect();
  const count = await prisma.project.count();
  console.log(`db_ok project_count=${count}`);
} catch (error) {
  const firstLine = String(error.message || error).split('\n')[0];
  console.log(`db_fail ${error.name}: ${firstLine}`);
  if (error.message?.includes("Can't reach database server")) {
    console.log('hint: DATABASE_URL host/port unreachable');
  }
  if (error.message?.includes('Authentication failed') || error.message?.includes('P1000')) {
    console.log('hint: bad username/password for this Postgres instance');
  }
} finally {
  await prisma.$disconnect();
}
