-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Project" (
    "project_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_goal" TEXT NOT NULL DEFAULT 'completedCheckout'
);
INSERT INTO "new_Project" ("created_at", "name", "project_id", "shop") SELECT "created_at", "name", "project_id", "shop" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_shop_key" ON "Project"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
