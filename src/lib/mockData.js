// Seed / demo data for the PerimeterGuard frontend.
// In production this would come from the local server's REST API; here it
// simply initializes the in-memory DataContext store so every screen has
// realistic, interconnected data to operate on.

export const ZONES = [
  "Zone A — Entrance",
  "Zone B — Perimeter",
  "Zone C — Storage",
  "Zone D — Interior",
];

export const REMARK_OPTIONS = [
  "Gate locked",
  "Fence damaged",
  "Suspicious activity",
  "Light not working",
  "CCTV unavailable",
  "Guard absent",
  "Equipment problem",
  "Other",
];

export const EMERGENCY_CATEGORIES = [
  "Intrusion",
  "Fire",
  "Medical Emergency",
  "Suspicious Person",
  "Equipment Failure",
];

export const MODULES = [
  "Dashboard & Live Monitoring",
  "Guard Post Management",
  "QR Code Management",
  "Officer Management",
  "Round & Route Management",
  "Alerts & Exceptions",
  "Reports & Audit Trail",
  "User & Role Management",
  "Settings",
];

// All demo accounts use PIN "1234" (handheld) / password "password" (web) —
// this is a frontend-only demo with no real auth backend.
export const initialPosts = [
  { id: "PST-001", name: "Main Gate", zone: ZONES[0], location: "Primary vehicle & pedestrian entrance", gps: "28.6139, 77.2090", notes: "Round start/end point.", active: true, qrGenerated: true, qrCodeId: "QR-2025-0001", qrPrintStatus: "Printed", createdAt: "2025-01-01T06:00:00Z" },
  { id: "PST-002", name: "North Boundary", zone: ZONES[1], location: "North perimeter fence line", gps: "28.6151, 77.2093", notes: "", active: true, qrGenerated: true, qrCodeId: "QR-2025-0002", qrPrintStatus: "Printed", createdAt: "2025-01-01T06:00:00Z" },
  { id: "PST-003", name: "Warehouse Post", zone: ZONES[2], location: "Behind Warehouse 2, near loading dock", gps: "28.6142, 77.2101", notes: "High-priority post; adjacent to fuel storage.", active: true, qrGenerated: true, qrCodeId: "QR-2025-0003", qrPrintStatus: "Printed", createdAt: "2025-01-03T06:00:00Z" },
  { id: "PST-004", name: "Gate-3 (Service)", zone: ZONES[0], location: "Rear service entrance", gps: "28.6135, 77.2085", notes: "", active: true, qrGenerated: true, qrCodeId: "QR-2025-0004", qrPrintStatus: "Not Printed", createdAt: "2025-01-03T06:00:00Z" },
  { id: "PST-005", name: "East Fence Line", zone: ZONES[1], location: "Eastern perimeter, near transformer yard", gps: "28.6144, 77.2110", notes: "", active: true, qrGenerated: true, qrCodeId: "QR-2025-0005", qrPrintStatus: "Printed", createdAt: "2025-01-05T06:00:00Z" },
  { id: "PST-006", name: "Admin Building", zone: ZONES[3], location: "Main administrative block, ground floor", gps: "28.6140, 77.2095", notes: "", active: true, qrGenerated: false, qrCodeId: null, qrPrintStatus: "Not Generated", createdAt: "2025-02-10T06:00:00Z" },
  { id: "PST-007", name: "South Boundary", zone: ZONES[1], location: "South perimeter fence line", gps: "28.6128, 77.2092", notes: "", active: true, qrGenerated: true, qrCodeId: "QR-2025-0007", qrPrintStatus: "Printed", createdAt: "2025-02-10T06:00:00Z" },
  { id: "PST-008", name: "Interior Yard", zone: ZONES[3], location: "Central storage yard", gps: "28.6141, 77.2099", notes: "", active: true, qrGenerated: true, qrCodeId: "QR-2025-0008", qrPrintStatus: "Printed", createdAt: "2025-02-12T06:00:00Z" },
];

export const initialOfficers = [
  { id: "OFC-014", name: "Vikram Rao", role: "Checking Officer", shift: "Night", contact: "+91 98xxxxx231", status: "Active", deviceId: "HH-DEV-03", pin: "1234" },
  { id: "OFC-015", name: "Sunil Meher", role: "Checking Officer", shift: "Night", contact: "+91 98xxxxx117", status: "Active", deviceId: "HH-DEV-07", pin: "1234" },
  { id: "OFC-021", name: "Priya Nair", role: "Security Officer", shift: "Day", contact: "+91 98xxxxx402", status: "Active", deviceId: null, pin: "1234" },
  { id: "OFC-016", name: "Anil Gupta", role: "Checking Officer", shift: "Night", contact: "+91 98xxxxx884", status: "Active", deviceId: "HH-DEV-02", pin: "1234" },
  { id: "OFC-009", name: "D. Verma", role: "Checking Officer", shift: "Evening", contact: "+91 98xxxxx559", status: "On Leave", deviceId: "HH-DEV-05", pin: "1234" },
];

export const initialRounds = [
  {
    id: "RND-N3",
    name: "Night Round 3",
    shift: "Night",
    scheduledStart: "02:00",
    frequencyMinutes: 60,
    lateThresholdMinutes: 10,
    officerIds: ["OFC-014"],
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    routePostIds: ["PST-001", "PST-002", "PST-003", "PST-004", "PST-005", "PST-007", "PST-008", "PST-001"],
  },
  {
    id: "RND-PS2",
    name: "Perimeter Sweep 2",
    shift: "Night",
    scheduledStart: "02:15",
    frequencyMinutes: 90,
    lateThresholdMinutes: 15,
    officerIds: ["OFC-015"],
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    routePostIds: ["PST-001", "PST-002", "PST-005", "PST-007", "PST-001"],
  },
  {
    id: "RND-WH1",
    name: "Warehouse Round",
    shift: "All Shifts",
    scheduledStart: "01:45",
    frequencyMinutes: 45,
    lateThresholdMinutes: 5,
    officerIds: ["OFC-016"],
    activeDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    routePostIds: ["PST-003", "PST-006", "PST-008"],
  },
];

export const initialAlerts = [
  { id: "ALT-1001", type: "missed", postId: "PST-008", officerId: "OFC-014", roundId: "RND-N3", scheduledTime: "2026-09-01T01:15:00Z", actualTime: null, status: "resolved", remark: "", createdAt: "2026-09-01T01:30:00Z" },
  { id: "ALT-1002", type: "late", postId: "PST-003", officerId: "OFC-014", roundId: "RND-N3", scheduledTime: "2026-09-02T02:15:00Z", actualTime: "2026-09-02T02:31:00Z", status: "acknowledged", remark: "", createdAt: "2026-09-02T02:31:00Z" },
];

export const initialUsers = [
  { id: "USR-01", username: "r.sharma", name: "R. Sharma", role: "Administrator", officerId: null, lastLogin: "2026-09-02T09:14:00Z", status: "Active" },
  { id: "USR-02", username: "p.nair", name: "Priya Nair", role: "Security Officer", officerId: "OFC-021", lastLogin: "2026-09-02T08:02:00Z", status: "Active" },
  { id: "USR-03", username: "k.iyer", name: "K. Iyer", role: "Supervisor", officerId: null, lastLogin: "2026-09-01T19:40:00Z", status: "Active" },
  { id: "USR-04", username: "v.rao", name: "Vikram Rao", role: "Checking Officer", officerId: "OFC-014", lastLogin: "2026-09-02T02:00:00Z", status: "Active" },
];

// Module-level permission matrix per role. Administrator always has full access.
export const initialPermissions = {
  Administrator: Object.fromEntries(MODULES.map((m) => [m, { view: true, edit: true }])),
  "Security Officer": Object.fromEntries(
    MODULES.map((m) => [
      m,
      { view: true, edit: ["Dashboard & Live Monitoring", "Reports & Audit Trail"].includes(m) },
    ])
  ),
  Supervisor: Object.fromEntries(
    MODULES.map((m) => [m, { view: m === "Reports & Audit Trail", edit: false }])
  ),
  "Checking Officer": Object.fromEntries(MODULES.map((m) => [m, { view: false, edit: false }])),
};

export const initialShifts = [
  { id: "SHF-1", name: "Morning", start: "06:00", end: "14:00", roundsPerShift: 4 },
  { id: "SHF-2", name: "Afternoon", start: "14:00", end: "18:00", roundsPerShift: 2 },
  { id: "SHF-3", name: "Evening", start: "18:00", end: "00:00", roundsPerShift: 3 },
  { id: "SHF-4", name: "Night", start: "00:00", end: "06:00", roundsPerShift: 8 },
];

export const initialDeviceSync = [
  { deviceId: "HH-DEV-03", officerName: "Vikram Rao", lastSync: "2026-09-02T06:04:00Z", pendingCount: 0, status: "Synced" },
  { deviceId: "HH-DEV-07", officerName: "Sunil Meher", lastSync: "2026-09-02T06:10:00Z", pendingCount: 0, status: "Synced" },
  { deviceId: "HH-DEV-02", officerName: "Anil Gupta", lastSync: "2026-09-01T23:58:00Z", pendingCount: 5, status: "Pending" },
];

export const initialSettings = {
  serverAddress: "192.168.1.10:8080",
  serverLabel: "Main Gate Control Room",
  syncMethod: "Ethernet (Docking Station)",
  autoSync: true,
  backupSchedule: "Daily at 07:00 AM",
  backupDestination: "Local Backup Server",
};

// A handful of already-completed round sessions so Reports / Audit Trail /
// Dashboard have history to summarize on first load.
export const initialHistory = [
  {
    id: "SESSION-9001",
    roundId: "RND-N3",
    officerId: "OFC-014",
    startedAt: "2026-09-01T02:00:00Z",
    endedAt: "2026-09-01T03:04:00Z",
    status: "completed",
    scans: [
      { postId: "PST-001", scheduledTime: "2026-09-01T02:00:00Z", actualTime: "2026-09-01T02:00:00Z", status: "on_time", remark: "" },
      { postId: "PST-002", scheduledTime: "2026-09-01T02:10:00Z", actualTime: "2026-09-01T02:13:00Z", status: "on_time", remark: "" },
      { postId: "PST-003", scheduledTime: "2026-09-01T02:20:00Z", actualTime: "2026-09-01T02:36:00Z", status: "late", remark: "" },
      { postId: "PST-004", scheduledTime: "2026-09-01T02:30:00Z", actualTime: "2026-09-01T02:41:00Z", status: "on_time", remark: "" },
      { postId: "PST-005", scheduledTime: "2026-09-01T02:40:00Z", actualTime: "2026-09-01T02:44:00Z", status: "on_time", remark: "" },
      { postId: "PST-007", scheduledTime: "2026-09-01T02:50:00Z", actualTime: "2026-09-01T02:52:00Z", status: "on_time", remark: "" },
      { postId: "PST-008", scheduledTime: "2026-09-01T03:00:00Z", actualTime: null, status: "missed", remark: "" },
      { postId: "PST-001", scheduledTime: "2026-09-01T03:05:00Z", actualTime: "2026-09-01T03:04:00Z", status: "on_time", remark: "" },
    ],
  },
  {
    id: "SESSION-9002",
    roundId: "RND-WH1",
    officerId: "OFC-016",
    startedAt: "2026-09-01T01:45:00Z",
    endedAt: "2026-09-01T02:14:00Z",
    status: "completed",
    scans: [
      { postId: "PST-003", scheduledTime: "2026-09-01T01:45:00Z", actualTime: "2026-09-01T01:45:00Z", status: "on_time", remark: "" },
      { postId: "PST-006", scheduledTime: "2026-09-01T01:55:00Z", actualTime: "2026-09-01T01:58:00Z", status: "on_time", remark: "Light not working" },
      { postId: "PST-008", scheduledTime: "2026-09-01T02:05:00Z", actualTime: "2026-09-01T02:14:00Z", status: "late", remark: "" },
    ],
  },
];