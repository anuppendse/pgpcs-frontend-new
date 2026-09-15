import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useData } from "../../context/DataContext";
import { ShieldAlert } from "lucide-react";

// Maps each permission-table module name to the route that represents it,
// in priority order. When a role can't view the module it landed on, this
// is used to find the first module (in this order) the role CAN view, so
// we can send it there instead of ever rendering an "Access restricted"
// screen.
const MODULE_ROUTES = [
  { module: "Dashboard & Live Monitoring", path: "/web/dashboard" },
  { module: "Guard Post Management", path: "/web/posts" },
  { module: "QR Code Management", path: "/web/qr" },
  { module: "Officer Management", path: "/web/officers" },
  { module: "Round & Route Management", path: "/web/rounds" },
  { module: "Round & Route Management", path: "/web/routes" },
  { module: "Round & Route Management", path: "/web/round-schedules" },
  { module: "Round & Route Management", path: "/web/round-instances" },
  { module: "Shift Management", path: "/web/shifts" },
  { module: "Alerts & Exceptions", path: "/web/alerts" },
  { module: "Reports & Audit Trail", path: "/web/reports" },
  { module: "User & Role Management", path: "/web/roles" },
  { module: "Settings", path: "/web/settings" },
];

// Wraps every /web/* screen: enforces login, renders the shared chrome, and
// (when requiredModule is given) enforces that the signed-in role has "view"
// permission on that module per the User Roles & Access Control matrix.
export default function WebLayout({ crumb, title, right, requiredModule, children }) {
  const { webSession, permissions } = useData();
  const location = useLocation();

  if (!webSession) return <Navigate to="/web/login" replace />;

  // TEMPORARY: Supervisor gets the same full-access bypass as
  // Administrator. permissions is never actually seeded for any
  // non-Administrator role today (the only seeding effect, in
  // UserRoles.jsx, only writes "Administrator" and only when an admin
  // visits that page) - so without this, Supervisor always lands on
  // "No modules available". Remove this bypass once permissions are
  // properly granted via User Roles & Access Control (or seeded some
  // other reliable way) instead of bypassed here.
  const hasFullAccess =
    webSession.role === "Administrator" || webSession.role === "Supervisor";

  const canView =
    hasFullAccess ||
    !requiredModule ||
    permissions[webSession.role]?.[requiredModule]?.view;

  // Previously this rendered a visible "Access restricted" block whenever
  // canView was false - so a Supervisor (or any non-Administrator role)
  // could still land on a page they don't have permission for (via direct
  // URL, a bookmark, an old tab, or a sidebar link that shouldn't even be
  // there) and see that page's shell with a warning message instead.
  //
  // Now, instead of showing anything from this page at all, we look up the
  // first module (in MODULE_ROUTES order) this role DOES have view access
  // to and redirect there immediately - so a restricted page is never
  // shown, not even briefly.
  if (!canView) {
    const fallback = MODULE_ROUTES.find(
      ({ module, path }) =>
        path !== location.pathname &&
        (hasFullAccess || permissions[webSession.role]?.[module]?.view)
    );

    if (fallback) {
      return <Navigate to={fallback.path} replace />;
    }

    // Edge case: this role has no view permission on ANY module at all.
    // There is nowhere safe to redirect to, so show a minimal, page-less
    // message instead of any restricted page's content.
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-surface">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          <ShieldAlert className="text-status-amber" size={40} />
          <div className="text-lg font-bold text-navy">No modules available</div>
          <p className="text-sm text-inkSoft">
            Your role ({webSession.role}) does not have view access to any module yet. Ask an
            Administrator to grant access from User Roles &amp; Access Control.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar crumb={crumb} title={title} right={right} />
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}