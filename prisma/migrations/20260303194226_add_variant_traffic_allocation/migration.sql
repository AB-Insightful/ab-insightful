-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Variant" (
    "variant_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config_data" JSONB,
    "experiment_id" INTEGER NOT NULL,
    "trafficAllocation" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "Variant_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "Experiment" ("experiment_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Variant" ("config_data", "description", "experiment_id", "name", "variant_id") SELECT "config_data", "description", "experiment_id", "name", "variant_id" FROM "Variant";
DROP TABLE "Variant";
ALTER TABLE "new_Variant" RENAME TO "Variant";

-- BEGIN MANUAL MIGRATION SECTION
-- Backfill trafficAllocation from experiment trafficSplit
-- Control gets (1 - trafficSplit), each non-control variant gets trafficSplit / (N - 1)
UPDATE "Variant"
SET "trafficAllocation" = CASE
  WHEN "name" = 'Control' THEN
    1.0 - (
      SELECT e."traffic_split"
      FROM "Experiment" e
      WHERE e."experiment_id" = "Variant"."experiment_id"
    )
  ELSE
    (
      SELECT e."traffic_split"
      FROM "Experiment" e
      WHERE e."experiment_id" = "Variant"."experiment_id"
    ) / (
      (
        SELECT COUNT(*)
        FROM "Variant" v2
        WHERE v2."experiment_id" = "Variant"."experiment_id"
      ) - 1.0
    )
  END;

-- END MANUAL MIGRATION SECTION
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;