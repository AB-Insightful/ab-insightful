import { ExperimentStatus } from "./experimentConstants.js";

//calculate active runtime by subtracting paused intervals from total elapsed time (uses experiment history to determine pauses).
export function formatRuntime(startDateISO, endDateISO, status, history = []) {

    if (status.toLowerCase() === ExperimentStatus.draft || status.toLowerCase() === "scheduled" || !startDateISO) return "-";

    const startDate = new Date(startDateISO);
    let endDate;

    if (status.toLowerCase() === ExperimentStatus.active || status.toLowerCase() === ExperimentStatus.paused) {
        endDate = new Date();
    } else if (status.toLowerCase() === ExperimentStatus.completed && endDateISO) {
        endDate = new Date(endDateISO);
    } else {
        return "-";
    }

    //error handling
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "-";

    let diffMs = Math.max(0, endDate.getTime() - startDate.getTime());

    //subtract paused intervals
    diffMs -= calcPausedMs(history, endDate, status);

    let totalMinutes = Math.floor(diffMs / 60000);

    //less than one minute
    if (totalMinutes < 1) return "< 1m";
    //less than one hour
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;
    //more than one day
    if (days > 0) return `${days}d ${hours}h`;
    //1hr<x<1day
    return `${hours}h ${minutes}m`;
}

//Sums up all paused durations from ExperimentHistory transitions.
function calcPausedMs(history, endDate, status) {
    //sort ascending by changedAt
    const sorted = [...history].sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

    //track paused intervals
    let pausedMs = 0;
    let pauseStart = null;

    //loop through status changes
    for (const entry of sorted) {
        const prev = entry.prevStatus.toLowerCase();
        const next = entry.newStatus.toLowerCase();
        const at = new Date(entry.changedAt);

        //if experiment has been paused
        if (prev === ExperimentStatus.active && next === ExperimentStatus.paused) {
            pauseStart = at;
        //if experiment resumes (calculate difference, add to total)
        } else if (prev === ExperimentStatus.paused && next === ExperimentStatus.active && pauseStart) {
            pausedMs += at.getTime() - pauseStart.getTime(); // resumed — close the interval
            pauseStart = null;
        }
    }

    //if currently paused, count up to current time
    if (pauseStart && status.toLowerCase() === ExperimentStatus.paused) {
        pausedMs += endDate.getTime() - pauseStart.getTime();
    }

    return Math.max(0, pausedMs);
}