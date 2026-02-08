/*
  Warnings:

  - The primary key for the `ExperimentHistory` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `histroy_id` on the `ExperimentHistory` table. All the data in the column will be lost.
  - Added the required column `history_id` to the `ExperimentHistory` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ExperimentHistory" (
    "history_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "prev_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "changed_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "experiment_id" INTEGER NOT NULL,
    CONSTRAINT "ExperimentHistory_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "Experiment" ("experiment_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ExperimentHistory" ("changed_at", "experiment_id", "new_status", "prev_status") SELECT "changed_at", "experiment_id", "new_status", "prev_status" FROM "ExperimentHistory";
DROP TABLE "ExperimentHistory";
ALTER TABLE "new_ExperimentHistory" RENAME TO "ExperimentHistory";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
