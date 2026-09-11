import React from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData, usePostMap } from "../../context/DataContext";
import { formatDuration, formatShortTime } from "../../lib/utils";

export default function RoundCompletion() {
  const { fieldSession, sessions, rounds, actions } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const officerId = fieldSession.officerId;

  const activeSession = sessions.find((s) => s.officerId === officerId && s.status === "in_progress");
  const lastCompleted = [...sessions]
    .filter((s) => s.officerId === officerId && s.status === "completed")
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];

  if (!activeSession && !lastCompleted) {
    return (
      <PhoneChrome title="Round Completion" activeTab="history">
        <div className="mt-10 rounded-2xl border border-dark-border bg-dark-card p-6 text-center text-[12.5px] text-[#8CA3B8]">
          No round history yet. Start a round from the Rounds tab.
        </div>
      </PhoneChrome>
    );
  }

  if (activeSession) {
    const round = rounds.find((r) => r.id === activeSession.roundId);
    const remaining = round.routePostIds.length - activeSession.scans.length;
    return (
      <PhoneChrome title="Finish Round" activeTab="history">
        <div className="rounded-2xl border border-dark-border bg-dark-card p-5">
          <div className="mb-3 text-[14px] font-extrabold">{round.name}</div>
          <div className="mb-1 text-[12.5px] text-[#8CA3B8]">
            {activeSession.scans.length} of {round.routePostIds.length} posts checked.
          </div>
          {remaining > 0 && (
            <div className="mb-4 rounded-lg bg-[#2A1414] px-3 py-2.5 text-[11.5px] text-[#FF9E9E]">
              {remaining} post(s) have not been scanned yet. Finishing now will log them as <b>Missed</b>.
            </div>
          )}
          <button
            onClick={() => actions.completeSession(activeSession.id)}
            className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]"
          >
            Confirm &amp; Finish Round
          </button>
        </div>
      </PhoneChrome>
    );
  }

  // activeSession is null here => show the just-completed (or most recent) summary
  const round = rounds.find((r) => r.id === lastCompleted.roundId);
  const checked = lastCompleted.scans.filter((s) => s.status !== "missed").length;
  const missed = lastCompleted.scans.filter((s) => s.status === "missed");
  const delayed = lastCompleted.scans.filter((s) => s.status === "late").length;
  const duration = new Date(lastCompleted.endedAt) - new Date(lastCompleted.startedAt);

  return (
    <PhoneChrome title="Round Complete" activeTab="history">
      <div className="mb-4 rounded-2xl border border-[#1C4A33] bg-[#0F2A1E] p-5 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-status-green">
          <Check size={30} className="text-[#06232C]" />
        </div>
        <div className="text-[17px] font-extrabold">{round.name} Completed</div>
        <div className="mt-0.5 text-[11.5px] text-[#8CA3B8]">
          {formatShortTime(lastCompleted.startedAt)} – {formatShortTime(lastCompleted.endedAt)} · Duration {formatDuration(duration)}
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
        <Row label="Required Posts" value={round.routePostIds.length} />
        <Row label="Posts Checked" value={checked} valueClass="text-[#3FCB80]" />
        <Row label="Missed Posts" value={missed.length ? missed.map((m) => postMap[m.postId]?.name).join(", ") : "0"} valueClass={missed.length ? "text-[#FF8A8A]" : ""} />
        <Row label="Delayed Posts" value={delayed} valueClass={delayed ? "text-[#F1C87A]" : ""} last />
      </div>

      <div className="mb-4 rounded-2xl border border-[#4A3A1C] bg-[#2A1F0F] p-4 text-[12px] text-[#F1C87A]">
        Return this device to the docking station to sync round data with the local server.
      </div>

      <button onClick={() => navigate("/mobile/rounds")} className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]">
        Back to Rounds
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
