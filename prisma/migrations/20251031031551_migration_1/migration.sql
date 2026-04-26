/*
  Warnings:

  - You are about to drop the column `experimentName` on the `Experiment` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Experiment" (
    "experiment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "traffic_split" DECIMAL NOT NULL,
    "start_date" DATETIME,
    "end_date" DATETIME,
    "endCondition" TEXT,
    "sectionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "project_id" INTEGER NOT NULL,
    CONSTRAINT "Experiment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Experiment" ("createdAt", "description", "endCondition", "end_date", "experiment_id", "name", "project_id", "sectionId", "start_date", "status", "traffic_split") SELECT "createdAt", "description", "endCondition", "end_date", "experiment_id", "name", "project_id", "sectionId", "start_date", "status", "traffic_split" FROM "Experiment";
DROP TABLE "Experiment";
ALTER TABLE "new_Experiment" RENAME TO "Experiment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
