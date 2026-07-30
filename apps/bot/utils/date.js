// ../utils/date.js
export function getTodayISODate() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function formatTimeAgo(date) {
  // Your implementation of formatTimeAgo, e.g.:
  const now = new Date();
  const diff = now - new Date(date);
  // Add logic to format the time difference (e.g., "5 minutes ago")
  return "some formatted string"; // Replace with actual logic
}