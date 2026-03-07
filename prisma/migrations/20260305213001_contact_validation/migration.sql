-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ContactEmail" (
    "email_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "project_id" INTEGER NOT NULL,
    CONSTRAINT "ContactEmail_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContactEmail" ("created_at", "email", "email_id", "project_id") SELECT "created_at", "email", "email_id", "project_id" FROM "ContactEmail";
DROP TABLE "ContactEmail";
ALTER TABLE "new_ContactEmail" RENAME TO "ContactEmail";
CREATE UNIQUE INDEX "ContactEmail_email_project_id_key" ON "ContactEmail"("email", "project_id");
CREATE TABLE "new_ContactPhone" (
    "phone_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "phone_number" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "project_id" INTEGER NOT NULL,
    CONSTRAINT "ContactPhone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "Project" ("project_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ContactPhone" ("created_at", "phone_id", "phone_number", "project_id") SELECT "created_at", "phone_id", "phone_number", "project_id" FROM "ContactPhone";
DROP TABLE "ContactPhone";
ALTER TABLE "new_ContactPhone" RENAME TO "ContactPhone";
CREATE TABLE "new_Project" (
    "project_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "default_goal" TEXT NOT NULL DEFAULT 'completedCheckout',
    "enableExperimentStart" BOOLEAN NOT NULL DEFAULT true,
    "enableExperimentEnd" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Project" ("created_at", "default_goal", "name", "project_id", "shop") SELECT "created_at", "default_goal", "name", "project_id", "shop" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_shop_key" ON "Project"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
