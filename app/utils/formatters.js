// Guards against null/undefined so we can perform rounding on valid numbers
export const formatImprovement = (val) =>{
    if (val == null) return "N/A";
    const sign = val > 0 ? "+": "";
    return `${sign}${val.toFixed(2)}%`;
};

// Transforms valid numbers into percentages
export const formatProbability = (val) => {
    if (val == null) return "N/A";
    return `${(val * 100).toFixed(1)}%`;
}

// Ensures we don't end up with a weird string like null / 100
export const formatRatio = (conversions, users) =>{
    if (conversions == null || users == null) return "N/A";
    return `${conversions}/${users}`;
}