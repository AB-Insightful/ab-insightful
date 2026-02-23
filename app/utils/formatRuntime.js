export function formatRuntime(startDateISO, endDateISO, status) {
    
    // Handles non-started experiments
    if (status.toLowerCase() === "draft" || status.toLowerCase() === "scheduled" || !startDateISO) return "-";

    const startDate = new Date(startDateISO);
    let endDate;

    if (status.toLowerCase() === "active") endDate = new Date(); // currently running experiment
    else if (status.toLowerCase() === "completed" && endDateISO) endDate = new Date(endDateISO); // completed experiment
    else return "-"; // for any other status, return "-"
    
    // Check for invalid dates
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return "-";

    let diffMs = endDate.getTime() - startDate.getTime();

    // Prevent showing negative time if server/client clocks are misaligned 
    if (diffMs < 0) diffMs = 0;

    let totalMinutes = Math.floor(diffMs / 60000); // 1k ms * 60 secs

    // Human-readable formatting 
    if (totalMinutes < 1)return "< 1m";
    if (totalMinutes < 60) return `${totalMinutes}m`;
    

    const days = Math.floor(totalMinutes / (60*24));
    const hours = Math.floor((totalMinutes % (60*24)) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0){
        // ex: 3d 4h
        return `${days}d ${hours}h`;
    }
    // ex: 12h 30m
    return `${hours}h ${minutes}m`;

}