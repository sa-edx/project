-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "address" TEXT,
    "icon" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFacility" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "facilityId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "travelMinutes" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'drive',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFacility_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectFacility_projectId_sortOrder_idx" ON "ProjectFacility"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFacility_projectId_facilityId_key" ON "ProjectFacility"("projectId", "facilityId");

-- AddForeignKey
ALTER TABLE "ProjectFacility" ADD CONSTRAINT "ProjectFacility_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFacility" ADD CONSTRAINT "ProjectFacility_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;
