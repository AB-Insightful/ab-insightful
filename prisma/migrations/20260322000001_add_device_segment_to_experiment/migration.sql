-- AlterTable
-- Adds the device_segment column to Experiment so experiments can target a
-- specific device type (mobile / desktop). Defaults to 'all' so every
-- existing experiment continues to target all devices without any data change.
ALTER TABLE "Experiment" ADD COLUMN "device_segment" TEXT NOT NULL DEFAULT 'all';
