-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Analysis" (
    "result_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "calculated_when" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "days_analyzed" INTEGER NOT NULL,
    "total_users" INTEGER NOT NULL,
    "total_conversions" INTEGER NOT NULL,
    "conversion_rate" REAL NOT NULL,
    "probability_of_being_best" REAL,
    "expected_loss" REAL,
    "cred_interval_lift" JSONB NOT NULL,
    "post_alpha" REAL NOT NULL,
    "post_beta" REAL NOT NULL,
    "device_segment" TEXT NOT NULL DEFAULT 'all',
    "experiment_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "goal_id" INTEGER NOT NULL,
    CONSTRAINT "Analysis_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "Experiment" ("experiment_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Analysis_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "Variant" ("variant_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Analysis_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "Goal" ("goal_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Analysis" ("calculated_when", "conversion_rate", "cred_interval_lift", "days_analyzed", "expected_loss", "experiment_id", "goal_id", "post_alpha", "post_beta", "probability_of_being_best", "result_id", "total_conversions", "total_users", "variant_id") SELECT "calculated_when", "conversion_rate", "cred_interval_lift", "days_analyzed", "expected_loss", "experiment_id", "goal_id", "post_alpha", "post_beta", "probability_of_being_best", "result_id", "total_conversions", "total_users", "variant_id" FROM "Analysis";
DROP TABLE "Analysis";
ALTER TABLE "new_Analysis" RENAME TO "Analysis";
CREATE INDEX "Analysis_experiment_id_goal_id_variant_id_device_segment_calculated_when_idx" ON "Analysis"("experiment_id", "goal_id", "variant_id", "device_segment", "calculated_when");
CREATE TABLE "new_Project" (
    "project_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_goal" TEXT NOT NULL DEFAULT 'completedCheckout',
    "emailNotifEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enableExperimentStart" BOOLEAN NOT NULL DEFAULT false,
    "enableExperimentEnd" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Project" ("created_at", "default_goal", "enableExperimentEnd", "enableExperimentStart", "name", "project_id", "shop") SELECT "created_at", "default_goal", "enableExperimentEnd", "enableExperimentStart", "name", "project_id", "shop" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_shop_key" ON "Project"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
