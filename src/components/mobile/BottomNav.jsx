import React from "react";
import { useNavigate } from "react-router-dom";
import { Route as RouteIcon, ScanLine, History, RefreshCw, User } from "lucide-react";

const TABS = [
  { key: "rounds", label: "Rounds", icon: RouteIcon, to: "/mobile/rounds" },
  { key: "scan", label: "Scan", icon: ScanLine, to: "/mobile/scan" },
  { key: "history", label: "History", icon: History, to: "/mobile/completion" },
  { key: "sync", label: "Sync", icon: RefreshCw, to: "/mobile/sync" },
  { key: "profile", label: "Profile", icon: User, to: "/mobile/login" },
];

export default function BottomNav({ active }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-none border-t border-dark-border bg-[#0E1D2E] pb-4 pt-2.5">
      {TABS.map((t) => {
        const Icon = t.icon;
        const isActive = t.key === active;
        return (
          <button key={t.key} onClick={() => navigate(t.to)} className={`flex flex-1 flex-col items-center gap-1 text-[9.5px] font-bold ${isActive ? "text-accent" : "text-[#5F7488]"}`}>
            <Icon size={19} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
