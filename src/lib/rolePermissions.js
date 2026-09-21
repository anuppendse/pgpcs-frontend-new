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
  // Administrator and Supervisor deliberately do NOT include "Scan Now" -
  // that's Checking Officer's page. This isn't just a sidebar-visibility
  // choice: leaving it out here is what makes WebLayout actually BLOCK
  // Administrator/Supervisor from reaching /web/scan even by typing or
  // pasting the URL directly, not just hide the nav link.
  //
  // "Officer Management" removed - confirmed no impact, since the
  // Officers panel/route is gone, but DataContext's officers state
  // and actions (loadOfficers/addOfficer/updateOfficer/resetPassword)
  // are left untouched, since other modules (e.g. Shift/Route
  // assignment dropdowns) still depend on that same data.
  Administrator: [
    "Dashboard & Live Monitoring",
    "Guard Post Management",
    "QR Code Management",
    "Round & Route Management",
    "Shift Management",
    "Reports & Audit Trail",
    "User & Role Management",
  ],
  Supervisor: [
    "Dashboard & Live Monitoring",
    "Guard Post Management",
    "QR Code Management",
    "Round & Route Management",
    "Shift Management",
    "Reports & Audit Trail",
    "User & Role Management",
    // Supervisor still has view access to User & Role Management -
    // confirmed by manager: Supervisor can create/edit/deactivate
    // Checking Officer accounts (see canManageUsers/canManageRow in
    // UserRoles.jsx, which enforce that narrower CHECKING-OFFICER-ONLY
    // scope within the page itself). This module list only controls
    // whether the tab/page is reachable at all, not what Supervisor
    // can do once inside it.
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