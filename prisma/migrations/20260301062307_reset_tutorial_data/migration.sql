/*
  Warnings:

  - Added the required column `onSiteTracking` to the `TutorialData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sessionId` to the `TutorialData` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TutorialData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "generalSettings" BOOLEAN NOT NULL,
    "createExperiment" BOOLEAN NOT NULL,
    "viewedListExperiment" BOOLEAN NOT NULL,
    "viewedReportsPage" BOOLEAN NOT NULL,
    "onSiteTracking" BOOLEAN NOT NULL,
    CONSTRAINT "TutorialData_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TutorialData" ("createExperiment", "generalSettings", "id", "viewedListExperiment", "viewedReportsPage") SELECT "createExperiment", "generalSettings", "id", "viewedListExperiment", "viewedReportsPage" FROM "TutorialData";
DROP TABLE "TutorialData";
ALTER TABLE "new_TutorialData" RENAME TO "TutorialData";
CREATE UNIQUE INDEX "TutorialData_sessionId_key" ON "TutorialData"("sessionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
