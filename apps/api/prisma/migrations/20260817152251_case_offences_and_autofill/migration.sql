-- AlterTable
ALTER TABLE "Case" ADD COLUMN "cpsReference" TEXT;
ALTER TABLE "Case" ADD COLUMN "defendantAddress" TEXT;
ALTER TABLE "Case" ADD COLUMN "defendantDob" DATETIME;
ALTER TABLE "Case" ADD COLUMN "officerInCase" TEXT;

-- CreateTable
CREATE TABLE "CaseOffence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caseId" TEXT NOT NULL,
    "offenceDate" DATETIME NOT NULL,
    "chargeWording" TEXT NOT NULL,
    CONSTRAINT "CaseOffence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FormDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "formCode" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "valuesJson" TEXT NOT NULL DEFAULT '{}',
    "autoFillJson" TEXT NOT NULL DEFAULT '{}',
    "userId" TEXT NOT NULL,
    "caseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FormDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FormDraft_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FormDraft" ("caseId", "createdAt", "formCode", "id", "status", "templateVersion", "updatedAt", "userId", "valuesJson", "version") SELECT "caseId", "createdAt", "formCode", "id", "status", "templateVersion", "updatedAt", "userId", "valuesJson", "version" FROM "FormDraft";
DROP TABLE "FormDraft";
ALTER TABLE "new_FormDraft" RENAME TO "FormDraft";
CREATE INDEX "FormDraft_userId_status_idx" ON "FormDraft"("userId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CaseOffence_caseId_idx" ON "CaseOffence"("caseId");
