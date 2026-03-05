import { ExperimentStatus } from "@prisma/client";

// Always allow renaming of experiments
export function canRenameExperiment(_status) {
  return true;
}

// Lock completed or archived experiments
export function isLockedStatus(status) {
  return (
    status === ExperimentStatus.completed ||
    status === ExperimentStatus.archived
  );
}

// Any unlocked experiment can be edited
export function canEditExperiment(status) {
  return !isLockedStatus(status);
}

// Fully editable structure only in draft
export function canEditStructure(status) {
  return status === ExperimentStatus.draft;
}

// Editable schedule in draft, active, paused
export function canEditSchedule(status) {
  return (
    status === ExperimentStatus.draft ||
    status === ExperimentStatus.active ||
    status === ExperimentStatus.paused
  );
}

// Which status-change intents are allowed from the current status
const STATUS_INTENTS = {
  [ExperimentStatus.draft]: new Set(["start", "delete"]),
  [ExperimentStatus.active]: new Set(["pause", "end"]),
  [ExperimentStatus.paused]: new Set(["resume", "end"]),
  [ExperimentStatus.completed]: new Set(["archive"]),
  [ExperimentStatus.archived]: new Set([]),
};

export function allowedStatusIntents(status) {
  return STATUS_INTENTS[status] || new Set();
}

export function isIntentAllowed(status, intent) {
  return allowedStatusIntents(status).has(intent);
}