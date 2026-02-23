-- CreateTable
CREATE TABLE "TutorialData" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "sessionId" TEXT NOT NULL,
    "generalSettings" BOOLEAN NOT NULL,
    "createExperiment" BOOLEAN NOT NULL,
    "viewedListExperiment" BOOLEAN NOT NULL,
    "viewedReportsPage" BOOLEAN NOT NULL,
    "onSiteTracking" BOOLEAN NOT NULL,
    CONSTRAINT "TutorialData_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialData_sessionId_key" ON "TutorialData"("sessionId");
