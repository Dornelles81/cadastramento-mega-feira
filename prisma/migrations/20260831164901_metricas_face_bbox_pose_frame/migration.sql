-- AlterTable
ALTER TABLE "participants" ADD COLUMN     "faceBbox" JSONB,
ADD COLUMN     "faceFrameH" INTEGER,
ADD COLUMN     "faceFrameW" INTEGER,
ADD COLUMN     "facePose" JSONB;
