import React, { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import PhoneChrome from "../../components/mobile/PhoneChrome";
import { useData, usePostMap } from "../../context/DataContext";
import { formatDuration, formatShortTime } from "../../lib/utils";

export default function RoundProgress() {
  const { fieldSession, sessions, rounds } = useData();
  const postMap = usePostMap();
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const session = sessions.find((s) => s.officerId === fieldSession.officerId && s.status === "in_progress");
  if (!session) return <Navigate to="/mobile/rounds" replace />;
  const round = rounds.find((r) => r.id === session.roundId);

  const totalStops = round.routePostIds.length;
  const pct = Math.round((session.scans.length / totalStops) * 100);
  const expectedElapsedMinutes = session.currentIndex * session.perStopMinutes;
  const actualElapsedMinutes = (Date.now() - new Date(session.startedAt).getTime()) / 60000;
  const behindMinutes = Math.round(actualElapsedMinutes - expectedElapsedMinutes);
  const lastLate = [...session.scans].reverse().find((s) => s.status === "late");
  const allStopsAttempted = session.currentIndex >= totalStops;

  return (
    <PhoneChrome title="Round Progress" activeTab="scan">
      <div className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[#8CA3B8]">
        {round.name} · Elapsed {formatDuration(Date.now() - new Date(session.startedAt).getTime())}
      </div>

      <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {round.routePostIds.map((postId, idx) => {
            const scan = session.scans[idx];
            let color = "bg-[#1E3350] text-[#7A8794]";
            if (scan) color = scan.status === "on_time" ? "bg-status-green text-[#06232C]" : scan.status === "late" ? "bg-status-amber text-[#2A1F0F]" : "bg-status-red text-white";
            else if (idx === session.currentIndex) color = "bg-accent text-[#06232C]";
            return (
              <div key={idx} className="flex min-w-[52px] flex-col items-center">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-extrabold ${color}`}>
                  {postMap[postId]?.name?.slice(0, 2).toUpperCase()}
                </div>
                <div className="num mt-1 text-[9.5px] text-[#8CA3B8]">{scan ? formatShortTime(scan.actualTime || scan.scheduledTime) : "—"}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-dark-border bg-dark-card p-4">
        <div className="mb-2.5 flex justify-between text-[12px]">
          <span className="text-[#8CA3B8]">Progress</span>
          <span className="num font-extrabold">{session.scans.length} / {totalStops} posts</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#0E1D2E]">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {behindMinutes > 5 && (
        <div className="mb-4 rounded-2xl border border-[#4A3A1C] bg-[#2A1F0F] p-4">
          <div className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-[#8CA3B8]">Behind Schedule</div>
          <div className="text-[12px] text-[#F1C87A]">
            {lastLate ? `${postMap[lastLate.postId]?.name} was checked late. ` : ""}
            You're running about {behindMinutes} min behind the expected pace for this round.
          </div>
        </div>
      )}

      {!allStopsAttempted ? (
        <button onClick={() => navigate("/mobile/scan")} className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]">
          Continue to Next Post
        </button>
      ) : (
        <button onClick={() => navigate("/mobile/completion")} className="w-full rounded-xl bg-accent py-3.5 text-[14px] font-extrabold text-[#06232C]">
          Finish Round
        </button>
      )}
    </PhoneChrome>
  );
}
