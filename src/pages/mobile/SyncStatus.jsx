import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData } from "../../context/DataContext";
import { formatDateTime } from "../../lib/utils";

export default function SyncStatus() {
  const { fieldSession, deviceSync, actions } = useData();
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState(0);

  const device = deviceSync.find((d) => d.deviceId === fieldSession.deviceId) || {
    deviceId: fieldSession.deviceId || "—",
    officerName: fieldSession.name,
    lastSync: null,
    pendingCount: 0,
    status: "Synced",
  };

  function handleSync() {
    if (syncing || device.pendingCount === 0) return;
    setSyncing(true);
    setProgress(0);
    const start = Date.now();
    const duration = 1600;
    const timer = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - start) / duration) * 100));
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        actions.syncDevice(device.deviceId);
        setSyncing(false);
      }
    }, 80);
  }

  const isOffline = device.pendingCount > 0 && !syncing;

  return (
    <PhoneChrome title="Sync Status" activeTab="sync" syncOk={!isOffline} showEmergency={false}>
      <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-5 text-center">
        <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#1E3350] text-accent ${syncing ? "animate-spin" : ""}`}>
          <RefreshCw size={22} />
        </div>
        <div className="text-[15px] font-extrabold">{syncing ? "Syncing…" : "Ethernet Connection Detected"}</div>
        <div className="mt-0.5 text-[11.5px] text-[#8CA3B8]">Docking Station · Main Gate Control Room</div>
      </div>

      {syncing && (
        <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
          <div className="mb-2.5 flex justify-between text-[12px]">
            <span className="text-[#8CA3B8]">Syncing records</span>
            <span className="num font-extrabold">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#0E1D2E]">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
        <Row label="Device" value={device.deviceId} />
        <Row label="Records Pending Sync" value={device.pendingCount} valueClass={device.pendingCount ? "text-[#F1C87A]" : "text-[#3FCB80]"} />
        <Row label="Last Successful Sync" value={device.lastSync ? formatDateTime(device.lastSync) : "Never"} last />
      </div>

      <button
        onClick={handleSync}
        disabled={syncing || device.pendingCount === 0}
        className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C] disabled:opacity-40"
      >
        {device.pendingCount === 0 ? "All Records Synced" : syncing ? "Syncing…" : "Sync Now"}
      </button>
    </PhoneChrome>
  );
}

function Row({ label, value, valueClass = "", last }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-dark-border"}`}>
      <span className="text-[12.5px] text-[#8CA3B8]">{label}</span>
      <span className={`num text-[13px] font-extrabold ${valueClass}`}>{value}</span>
    </div>
  );
}
