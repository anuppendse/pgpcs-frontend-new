import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TriangleAlert, Check } from "lucide-react";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData, usePostMap } from "../../context/DataContext";
import { EMERGENCY_CATEGORIES } from "../../lib/mockData";
import { formatShortTime } from "../../lib/utils";

export default function Emergency() {
  const { fieldSession, sessions, rounds, actions } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);

  const session = sessions.find((s) => s.officerId === fieldSession.officerId && s.status === "in_progress");
  const round = session ? rounds.find((r) => r.id === session.roundId) : null;
  const lastScan = session?.scans[session.scans.length - 1];
  const currentPostId = lastScan ? lastScan.postId : round?.routePostIds[0];
  const now = new Date().toISOString();

  function handleSend(category) {
    actions.sendEmergencyAlert(category, {
      postId: currentPostId || null,
      officerId: fieldSession.officerId,
      roundId: round?.id || null,
    });
    setSent(true);
    setTimeout(() => navigate(-1), 1400);
  }

  if (sent) {
    return (
      <PhoneChrome title="Emergency Alert" showEmergency={false}>
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-status-green">
            <Check size={30} className="text-[#06232C]" />
          </div>
          <div className="text-[16px] font-extrabold">Alert Sent to Control Room</div>
          <div className="mt-1 text-[12px] text-[#8CA3B8]">A security officer has been notified immediately.</div>
        </div>
      </PhoneChrome>
    );
  }

  return (
    <PhoneChrome title="Emergency Alert" showEmergency={false}>
      <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wide text-[#8CA3B8]">Select Emergency Category</div>
      {EMERGENCY_CATEGORIES.map((cat) => (
        <button
          key={cat}
          onClick={() => handleSend(cat)}
          className="mb-3 flex w-full items-center gap-3.5 rounded-2xl border border-[#4A1F1F] bg-[#2A1414] p-4 text-left"
        >
          <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-status-red">
            <TriangleAlert size={18} />
          </div>
          <div className="text-[13.5px] font-extrabold">{cat}</div>
        </button>
      ))}

      <div className="mb-4 rounded-xl border border-dark-border bg-dark-card p-3.5 text-[11px] text-[#8CA3B8]">
        Context auto-attached: {postMap[currentPostId]?.name || "Unknown post"}, {round?.name || "No active round"},{" "}
        {formatShortTime(now)}, Officer {fieldSession.officerId}
      </div>

      <button onClick={() => navigate(-1)} className="w-full rounded-xl border border-dark-border py-3 text-[13px] font-bold text-[#B8C7D6]">
        Cancel
      </button>
    </PhoneChrome>
  );
}
