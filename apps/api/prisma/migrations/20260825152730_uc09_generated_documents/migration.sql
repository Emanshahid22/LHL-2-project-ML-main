-- CreateTable
CREATE TABLE "GeneratedDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "caseId" TEXT,
    "formCode" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "cipher" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "archiveStatus" TEXT NOT NULL DEFAULT 'pending-uc10',
    "renderedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PdfJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "draftId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "documentId" TEXT,
    "docxDocumentId" TEXT,
    "failureReason" TEXT,
    "retryable" BOOLEAN NOT NULL DEFAULT true,
    "requestedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "GeneratedDocument_storageKey_idx" ON "GeneratedDocument"("storageKey");

-- CreateIndex
CREATE INDEX "GeneratedDocument_draftId_idx" ON "GeneratedDocument"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedDocument_draftId_storageKey_key" ON "GeneratedDocument"("draftId", "storageKey");

-- CreateIndex
CREATE INDEX "PdfJob_draftId_createdAt_idx" ON "PdfJob"("draftId", "createdAt");
