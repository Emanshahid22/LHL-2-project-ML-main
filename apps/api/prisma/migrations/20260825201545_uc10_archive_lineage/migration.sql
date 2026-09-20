-- AlterTable
ALTER TABLE "FormDraft" ADD COLUMN "amendedFromId" TEXT;
ALTER TABLE "FormDraft" ADD COLUMN "lineageId" TEXT;

-- CreateTable
CREATE TABLE "ArchivedVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lineageId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "draftId" TEXT NOT NULL,
    "formCode" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "documentId" TEXT NOT NULL,
    "docxDocumentId" TEXT,
    "contentHash" TEXT NOT NULL,
    "caseId" TEXT,
    "userId" TEXT NOT NULL,
    "generatedByName" TEXT NOT NULL,
    "valuesSnapshotJson" TEXT NOT NULL,
    "containsSensitive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ArchivedVersion_caseId_idx" ON "ArchivedVersion"("caseId");

-- CreateIndex
CREATE INDEX "ArchivedVersion_userId_formCode_idx" ON "ArchivedVersion"("userId", "formCode");

-- CreateIndex
CREATE UNIQUE INDEX "ArchivedVersion_lineageId_versionNumber_key" ON "ArchivedVersion"("lineageId", "versionNumber");

-- CreateIndex
CREATE INDEX "FormDraft_lineageId_idx" ON "FormDraft"("lineageId");
