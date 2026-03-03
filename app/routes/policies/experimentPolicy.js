
export const EXPERIMENT_STATUS = {
  draft: "draft",
  active: "active",
  paused: "paused",
  completed: "completed",
  archived: "archived",
};

// Always allow renaming of experiments
export function canRenameExperiment(_status) {
  return true;
}

// Lock completed or archived experiments
export function isLockedStatus(status) {
  return (
    status === EXPERIMENT_STATUS.completed ||
    status === EXPERIMENT_STATUS.archived
  );
}

// Any unlocked experiment can be edited
export function canEditExperiment(status) {
  return !isLockedStatus(status);
}

// Fully editable structure only in draft
export function canEditStructure(status) {
  return status === EXPERIMENT_STATUS.draft;
}

// Editable schedule in draft, active, paused
export function canEditSchedule(status) {
  return (
    status === EXPERIMENT_STATUS.draft ||
    status === EXPERIMENT_STATUS.active ||
    status === EXPERIMENT_STATUS.paused
  );
}

// Which status-change intents are allowed from the current status
const STATUS_INTENTS = {
  [EXPERIMENT_STATUS.draft]: new Set(["start", "delete"]),
  [EXPERIMENT_STATUS.active]: new Set(["pause", "end"]),
  [EXPERIMENT_STATUS.paused]: new Set(["resume", "end"]),
  [EXPERIMENT_STATUS.completed]: new Set(["archive"]),
  [EXPERIMENT_STATUS.archived]: new Set([]),
};

export function allowedStatusIntents(status) {
  return STATUS_INTENTS[status] || new Set();
}

export function isIntentAllowed(status, intent) {
  return allowedStatusIntents(status).has(intent);
}