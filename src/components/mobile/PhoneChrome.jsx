import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { TriangleAlert } from "lucide-react";
import { useData } from "../../context/DataContext";
import BottomNav from "./BottomNav";

// Shared shell for every /mobile/* screen: enforces the officer is logged
// in, renders the dark "handheld device" chrome (title bar + sync pill),
// the bottom tab bar, and the persistent emergency button.
export default function PhoneChrome({ title, syncOk = true, activeTab, showEmergency = true, children }) {
  const { fieldSession } = useData();
  const navigate = useNavigate();

  if (!fieldSession) return <Navigate to="/mobile/login" replace />;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#050B12]">
      <div className="relative flex h-[844px] max-h-screen w-[390px] max-w-full flex-col overflow-hidden bg-dark-bg text-white shadow-2xl sm:rounded-[36px]">
        <div className="h-3.5 flex-none" />
        <div className="flex flex-none items-center justify-between px-5 pb-3.5">
          <div className="text-[16px] font-extrabold">{title}</div>
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#8CA3B8]">
            <span className={`h-1.5 w-1.5 rounded-full ${syncOk ? "bg-status-green" : "bg-status-gray"}`} />
            {syncOk ? "LOCAL SYNC READY" : "OFFLINE · QUEUED"}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {showEmergency && (
          <button
            onClick={() => navigate("/mobile/emergency")}
            className="absolute bottom-24 right-[18px] z-10 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-status-red shadow-[0_8px_18px_rgba(214,69,69,0.5)]"
            title="Emergency Alert"
          >
            <TriangleAlert size={20} />
          </button>
        )}

        {activeTab && <BottomNav active={activeTab} />}
      </div>
    </div>
  );
}
