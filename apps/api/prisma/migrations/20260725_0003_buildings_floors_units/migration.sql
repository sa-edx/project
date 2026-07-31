CREATE TABLE "Building" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "buildingCode" TEXT NOT NULL,
  "buildingName" TEXT NOT NULL,
  "buildingType" TEXT NOT NULL,
  "floorsCount" INTEGER NOT NULL DEFAULT 0,
  "unitsCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Floor" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "floorNumber" INTEGER NOT NULL,
  "floorName" TEXT,
  "floorPlan" TEXT,
  "displayOrder" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "projectId" TEXT NOT NULL,
  "buildingId" TEXT NOT NULL,
  "floorId" TEXT NOT NULL,
  "unitNumber" TEXT NOT NULL,
  "unitCode" TEXT NOT NULL,
  "unitType" TEXT NOT NULL,
  "bedrooms" INTEGER NOT NULL DEFAULT 0,
  "bathrooms" INTEGER NOT NULL DEFAULT 0,
  "area" NUMERIC(10, 2),
  "basePrice" NUMERIC(18, 2),
  "currency" TEXT NOT NULL DEFAULT 'AED',
  "status" TEXT NOT NULL DEFAULT 'available',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "viewType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Building_projectId_buildingCode_key" ON "Building"("projectId", "buildingCode");
CREATE UNIQUE INDEX "Floor_buildingId_floorNumber_key" ON "Floor"("buildingId", "floorNumber");
CREATE UNIQUE INDEX "Unit_floorId_unitNumber_key" ON "Unit"("floorId", "unitNumber");
CREATE UNIQUE INDEX "Unit_projectId_unitCode_key" ON "Unit"("projectId", "unitCode");

ALTER TABLE "Building"
ADD CONSTRAINT "Building_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Floor"
ADD CONSTRAINT "Floor_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Floor"
ADD CONSTRAINT "Floor_buildingId_fkey"
FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unit"
ADD CONSTRAINT "Unit_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unit"
ADD CONSTRAINT "Unit_buildingId_fkey"
FOREIGN KEY ("buildingId") REFERENCES "Building"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Unit"
ADD CONSTRAINT "Unit_floorId_fkey"
FOREIGN KEY ("floorId") REFERENCES "Floor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
