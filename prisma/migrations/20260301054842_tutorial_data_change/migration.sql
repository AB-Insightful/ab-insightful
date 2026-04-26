/*
  Warnings:

  - You are about to drop the column `onSiteTracking` on the `TutorialData` table. All the data in the column will be lost.
  - You are about to drop the column `sessionId` on the `TutorialData` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TutorialData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "generalSettings" BOOLEAN NOT NULL,
    "createExperiment" BOOLEAN NOT NULL,
    "viewedListExperiment" BOOLEAN NOT NULL,
    "viewedReportsPage" BOOLEAN NOT NULL
);
INSERT INTO "new_TutorialData" ("createExperiment", "generalSettings", "id", "viewedListExperiment", "viewedReportsPage") SELECT "createExperiment", "generalSettings", "id", "viewedListExperiment", "viewedReportsPage" FROM "TutorialData";
DROP TABLE "TutorialData";
ALTER TABLE "new_TutorialData" RENAME TO "TutorialData";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
