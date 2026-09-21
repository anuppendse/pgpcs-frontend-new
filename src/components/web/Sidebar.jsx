import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Radar,
  ShieldCheck,
  QrCode,
  Route,
  Clock,
  BarChart3,
  History,
  UserCog,
  LogOut,
} from "lucide-react";
import { useData } from "../../context/DataContext";
import { canViewModule } from "../../lib/rolePermissions";
import { cn } from "../../lib/utils";

const NAV = [
  { to: "/web/scan", label: "Scan Now", icon: QrCode, module: "Scan Now", section: "Monitoring" },
  { to: "/web/dashboard", label: "Control Room Overview", icon: LayoutDashboard, module: "Dashboard & Live Monitoring", section: "Monitoring" },
  { to: "/web/monitoring", label: "Live Round Monitoring", icon: Radar, module: "Dashboard & Live Monitoring", section: "Monitoring" },
  { to: "/web/posts", label: "Guard Post Management", icon: ShieldCheck, module: "Guard Post Management", section: "Configuration" },
  { to: "/web/qr", label: "QR Code Management", icon: QrCode, module: "QR Code Management", section: "Configuration" },
  { to: "/web/routes", label: "Routes", icon: Route, module: "Round & Route Management", section: "Configuration" },
  { to: "/web/round-schedules", label: "Round Schedules", icon: Route, module: "Round & Route Management", section: "Configuration" },
  { to: "/web/round-instances", label: "Round Instances", icon: Route, module: "Round & Route Management", section: "Configuration" },
  { to: "/web/shifts", label: "Shift Management", icon: Clock, module: "Shift Management", section: "Configuration" },
  { to: "/web/reports", label: "Reports", icon: BarChart3, module: "Reports & Audit Trail", section: "Reporting" },
  { to: "/web/audit-trail", label: "Guard Post History", icon: History, module: "Reports & Audit Trail", section: "Reporting" },
  { to: "/web/roles", label: "User Roles & Access", icon: UserCog, module: "User & Role Management", section: "Reporting" },
];

// Roles that should never see the "Scan Now" nav item in the sidebar,
// regardless of the module-permission table (Scan Now doesn't go through
// that system at all - see WebLayout.jsx - so it has to be hidden here
// explicitly, by role, rather than via canViewModule/perms).
const SCAN_NOW_HIDDEN_FOR = ["administrator", "supervisor"];

export default function Sidebar() {
  const { webSession, permissions, actions } = useData();
  const navigate = useNavigate();
  const perms = permissions[webSession?.role] || {};

  // Same normalization pattern used elsewhere (trim + lowercase) so this
  // is robust regardless of exact casing/whitespace coming from the API.
  const normalizedRole = String(webSession?.role || "").trim().toLowerCase();
  const scanNowHidden = SCAN_NOW_HIDDEN_FOR.includes(normalizedRole);

  const visible = NAV.filter((item) => {
    if (item.to === "/web/scan" && scanNowHidden) return false;

    return (
      canViewModule(webSession?.role, item.module) || perms[item.module]?.view
    );
  });

  let lastSection = null;

  return (
    <div className="flex h-full w-60 flex-none flex-col bg-gradient-to-b from-navy-dark to-[#0B1D33] py-5 text-[#CBD9E8]">
      <div className="mb-2.5 flex items-center gap-2.5 border-b border-white/10 px-5 pb-5">
        <div>
          <div className="text-[13.5px] font-bold leading-tight text-white">PerimeterGuard</div>
          <div className="text-[10.5px] text-[#8CA3B8]">Guard Post Checking System</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5">
        {visible.map((item) => {
          const showLabel = item.section !== lastSection;
          lastSection = item.section;
          const Icon = item.icon;
          return (
            <React.Fragment key={item.to}>
              {showLabel && (
                <div className="px-3 pb-1.5 pt-3.5 text-[10px] font-bold uppercase tracking-wider text-[#5F7488]">{item.section}</div>
              )}
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium",
                    isActive ? "bg-accent font-bold text-[#052934]" : "text-[#B8C7D6] hover:bg-white/5"
                  )
                }
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{item.label}</span>
              </NavLink>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="mt-2 flex items-center gap-2.5 border-t border-white/10 px-5 pt-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-lighter text-[12px] font-bold text-white">
          {webSession?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?"}
        </div>
        <div className="flex-1">
          <div className="text-[12.5px] font-semibold text-white">{webSession?.name}</div>
          <div className="text-[10.5px] text-[#8CA3B8]">{webSession?.role}</div>
        </div>
        <button
          title="Log out"
          onClick={() => {
            actions.webLogout();
            navigate("/web/login");
          }}
          className="rounded-md p-1.5 text-[#8CA3B8] hover:bg-white/10 hover:text-white"
        >
          <LogOut size={16} />
        </button>
      </div>
    </div>
  );
}