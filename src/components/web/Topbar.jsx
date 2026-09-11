import React from "react";
import { Bell, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDataState } from "../../context/DataContext";

export default function Topbar({ crumb, title, right }) {
  const navigate = useNavigate();
  const { alerts } = useDataState();
  const openAlerts = alerts.filter((a) => a.status === "open").length;

  return (
    <div className="flex h-16 flex-none items-center justify-between border-b border-border bg-white px-6">
      <div>
        <div className="text-[11.5px] font-medium text-inkSoft">{crumb}</div>
        <h1 className="text-[17px] font-bold text-navy">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        {right}
        <button
          onClick={() => navigate("/web/alerts")}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-status-grayBg text-inkSoft hover:text-navy"
          title="Alerts"
        >
          <Bell size={17} />
          {openAlerts > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-red text-[9px] font-bold text-white">
              {openAlerts}
            </span>
          )}
        </button>
        <button
          onClick={() => navigate("/web/settings")}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-grayBg text-inkSoft hover:text-navy"
          title="Settings"
        >
          <SettingsIcon size={17} />
        </button>
      </div>
    </div>
  );
}
