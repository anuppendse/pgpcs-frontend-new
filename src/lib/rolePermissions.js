// Which modules each role can see at all. This is the single source
// of truth for tab/page VISIBILITY - both Sidebar.jsx (which nav
// items render) and WebLayout.jsx (which pages actually load vs.
// redirect) read from this, so they can't drift apart.
//
// This is distinct from EDIT permissions within a page (e.g.
// GuardPosts.jsx's own canEdit check) - a module listed here just
// means "this role can open this tab at all", not "can change
// anything in it". Round & Route Management is one module covering
// three pages (Routes, Round Schedules, Round Instances) that all
// share the same visibility, even though their edit rules differ
// page-by-page (see each page's own canEdit).
export const ROLE_MODULES = {
  Administrator: [
    "Scan Now",
    "Dashboard & Live Monitoring",
    "Guard Post Management",
    "QR Code Management",
    "Officer Management",
    "Round & Route Management",
    "Shift Management",
    "Reports & Audit Trail",
    "User & Role Management",
  ],
  Supervisor: [
    "Scan Now",
    "Dashboard & Live Monitoring",
    "Guard Post Management",
    "QR Code Management",
    "Round & Route Management",
    "Shift Management",
    "Reports & Audit Trail",
    // Deliberately NOT Officer Management or User & Role Management -
    // account-level control and permission governance stay
    // Administrator-only.
  ],
  "Checking Officer": [
    "Scan Now",
    // Nothing else - Scan Now is their entire job in this system.
  ],
};

export function canViewModule(role, module) {
  if (!module) return true; // pages with no requiredModule are open to any authenticated role
  return (ROLE_MODULES[role] || []).includes(module);
}
