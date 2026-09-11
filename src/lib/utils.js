// Shared helpers used across both the web dashboard and the handheld app.

let idCounter = 1000;
export function generateId(prefix = "id") {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

// Produces a clean sequential ID (e.g. PST-009) matching the seed data's
// naming convention, by finding the highest existing numeric suffix for the
// given prefix and incrementing it — used for guard posts & officers, whose
// IDs are shown prominently in tables.
export function nextSequentialId(existingIds, prefix, pad = 3) {
  let max = 0;
  existingIds.forEach((id) => {
    const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  });
  return `${prefix}-${String(max + 1).padStart(pad, "0")}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatShortTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso) {
  if (!iso) return "—";
  return `${formatDate(iso)} ${formatShortTime(iso)}`;
}

export function minutesBetween(isoA, isoB) {
  return Math.round((new Date(isoB).getTime() - new Date(isoA).getTime()) / 60000);
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// Given a scheduled time and an actual scan time, classify the scan.
// lateThresholdMinutes is the grace period after which a scan counts as "late" rather than "on_time".
export function classifyScan(scheduledIso, actualIso, lateThresholdMinutes) {
  const delay = minutesBetween(scheduledIso, actualIso);
  if (delay <= lateThresholdMinutes) return { status: "on_time", delayMinutes: Math.max(0, delay) };
  return { status: "late", delayMinutes: delay };
}

export function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}

// --- File export helpers -------------------------------------------------

export function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportToCSV(rows, columns, filename) {
  const header = columns.map((c) => csvEscape(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvEscape(c.value(row))).join(","))
    .join("\n");
  downloadBlob(`${header}\n${body}`, filename, "text/csv;charset=utf-8;");
}

export function exportToJSON(data, filename) {
  downloadBlob(JSON.stringify(data, null, 2), filename, "application/json");
}
