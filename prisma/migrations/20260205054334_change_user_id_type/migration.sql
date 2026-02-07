/*
  Warnings:

  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Allocation" (
    "assignment_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "assigned_when" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_type" TEXT,
    "user_id" TEXT NOT NULL,
    "experiment_id" INTEGER NOT NULL,
    "variant_id" INTEGER NOT NULL,
    CONSTRAINT "Allocation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Allocation_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "Experiment" ("experiment_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Allocation_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "Variant" ("variant_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Allocation" ("assigned_when", "assignment_id", "device_type", "experiment_id", "user_id", "variant_id") SELECT "assigned_when", "assignment_id", "device_type", "experiment_id", "user_id", "variant_id" FROM "Allocation";
DROP TABLE "Allocation";
ALTER TABLE "new_Allocation" RENAME TO "Allocation";
CREATE UNIQUE INDEX "Allocation_user_id_experiment_id_key" ON "Allocation"("user_id", "experiment_id");
CREATE TABLE "new_Conversion" (
    "conversion_id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "converted_when" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "device_type" TEXT,
    "money_value" DECIMAL,
    "user_id" TEXT NOT NULL,
    "variant_id" INTEGER NOT NULL,
    "goal_id" INTEGER NOT NULL,
    "experiment_id" INTEGER NOT NULL,
    CONSTRAINT "Conversion_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("user_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversion_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "Variant" ("variant_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversion_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "Goal" ("goal_id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversion_experiment_id_fkey" FOREIGN KEY ("experiment_id") REFERENCES "Experiment" ("experiment_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Conversion" ("conversion_id", "converted_when", "device_type", "experiment_id", "goal_id", "money_value", "user_id", "variant_id") SELECT "conversion_id", "converted_when", "device_type", "experiment_id", "goal_id", "money_value", "user_id", "variant_id" FROM "Conversion";
DROP TABLE "Conversion";
ALTER TABLE "new_Conversion" RENAME TO "Conversion";
CREATE UNIQUE INDEX "Conversion_experiment_id_goal_id_user_id_key" ON "Conversion"("experiment_id", "goal_id", "user_id");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" DATETIME,
    "accessToken" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "webPixelId" TEXT
);
INSERT INTO "new_Session" ("accessToken", "accountOwner", "collaborator", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "scope", "shop", "state", "userId", "webPixelId") SELECT "accessToken", "accountOwner", "collaborator", "email", "emailVerified", "expires", "firstName", "id", "isOnline", "lastName", "locale", "scope", "shop", "state", "userId", "webPixelId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE TABLE "new_User" (
    "user_id" TEXT NOT NULL PRIMARY KEY,
    "shopify_customer_id" TEXT,
    "first_seen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latest_session" DATETIME NOT NULL,
    "device_type" TEXT
);
INSERT INTO "new_User" ("device_type", "first_seen", "latest_session", "shopify_customer_id", "user_id") SELECT "device_type", "first_seen", "latest_session", "shopify_customer_id", "user_id" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_shopify_customer_id_key" ON "User"("shopify_customer_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
