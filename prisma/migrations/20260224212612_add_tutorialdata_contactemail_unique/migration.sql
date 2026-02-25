/*
  Warnings:

  - A unique constraint covering the columns `[email,project_id]` on the table `ContactEmail` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ContactEmail_email_project_id_key" ON "ContactEmail"("email", "project_id");
