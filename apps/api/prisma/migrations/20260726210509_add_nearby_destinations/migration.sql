-- CreateTable
CREATE TABLE "NearbyDestination" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "distanceKm" DOUBLE PRECISION NOT NULL,
    "travelMinutes" INTEGER NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'drive',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NearbyDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NearbyDestination_projectId_sortOrder_idx" ON "NearbyDestination"("projectId", "sortOrder");

-- AddForeignKey
ALTER TABLE "NearbyDestination" ADD CONSTRAINT "NearbyDestination_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
