CREATE TABLE "Developer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "ownerUserId" TEXT,
  "companyName" TEXT NOT NULL,
  "registrationNumber" TEXT,
  "contactPerson" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "website" TEXT,
  "address" TEXT,
  "country" TEXT,
  "city" TEXT,
  "logo" TEXT,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Developer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Project" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "developerId" TEXT NOT NULL,
  "projectCode" TEXT NOT NULL,
  "projectName" TEXT NOT NULL,
  "projectType" TEXT NOT NULL,
  "description" TEXT,
  "country" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "latitude" NUMERIC(10, 8),
  "longitude" NUMERIC(11, 8),
  "startingPrice" NUMERIC(18, 2),
  "status" TEXT NOT NULL DEFAULT 'draft',
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Developer_ownerUserId_key" ON "Developer"("ownerUserId");
CREATE UNIQUE INDEX "Project_projectCode_key" ON "Project"("projectCode");
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

ALTER TABLE "Developer"
ADD CONSTRAINT "Developer_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project"
ADD CONSTRAINT "Project_developerId_fkey"
FOREIGN KEY ("developerId") REFERENCES "Developer"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
