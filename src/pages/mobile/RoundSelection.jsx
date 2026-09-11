import React from "react";
import { useNavigate } from "react-router-dom";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData, usePostMap } from "../../context/DataContext";

export default function RoundSelection() {
  const { fieldSession, rounds, sessions, actions } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const officerId = fieldSession?.officerId;

  const myRounds = rounds.filter((r) => r.officerIds.includes(officerId));

  function statusFor(round) {
    const active = sessions.find((s) => s.roundId === round.id && s.officerId === officerId && s.status === "in_progress");
    if (active) return { label: "In Progress", tone: "blue", session: active };
    const completed = sessions
      .filter((s) => s.roundId === round.id && s.officerId === officerId && s.status === "completed")
      .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
    if (completed) return { label: "Completed", tone: "green", session: completed };
    return { label: "Not Started", tone: "gray", session: null };
  }

  function handleStart(round) {
    const result = actions.startSession(round.id, officerId);
    if (result.ok) navigate("/mobile/scan");
  }

  return (
    <PhoneChrome title="Select Round" activeTab="rounds">
      <div className="mb-3.5 text-[11px] font-bold uppercase tracking-wide text-[#8CA3B8]">
        Officer: {fieldSession.name} · {fieldSession.deviceId || "No device assigned"}
      </div>

      {myRounds.length === 0 && (
        <div className="rounded-2xl border border-dark-border bg-dark-card p-5 text-center text-[12.5px] text-[#8CA3B8]">
          No rounds are assigned to you yet. Contact your administrator.
        </div>
      )}

      {myRounds.map((round) => {
        const { label, tone, session } = statusFor(round);
        const badgeClass = { blue: "bg-[#123246] text-accent", green: "bg-[#0F2A1E] text-[#3FCB80]", gray: "bg-[#1E3350] text-[#8CA3B8]" }[tone];
        return (
          <div key={round.id} className="mb-3.5 rounded-2xl border border-dark-border bg-dark-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[14.5px] font-extrabold">{round.name}</div>
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${badgeClass}`}>{label}</span>
            </div>
            <div className="mb-3 text-[11.5px] text-[#8CA3B8]">
              Scheduled {round.scheduledStart} · {round.routePostIds.length} posts ·{" "}
              {round.routePostIds.slice(0, 3).map((id) => postMap[id]?.name).join(" → ")}
              {round.routePostIds.length > 3 ? " → …" : ""}
            </div>
            {label === "In Progress" ? (
              <button onClick={() => navigate("/mobile/scan")} className="w-full rounded-xl bg-accent py-3 text-[13.5px] font-extrabold text-[#06232C]">
                Continue Round ({session.scans.length}/{round.routePostIds.length})
              </button>
            ) : (
              <button onClick={() => handleStart(round)} className="w-full rounded-xl bg-accent py-3 text-[13.5px] font-extrabold text-[#06232C]">
                Start Round
              </button>
            )}
          </div>
        );
      })}
    </PhoneChrome>
  );
}
