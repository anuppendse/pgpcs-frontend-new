import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import WebLayout from "../../components/web/WebLayout";
import StatCard from "../../components/web/StatCard";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { Card } from "../../components/web/FormField";
import { useData, useOfficerMap, useRoundMap } from "../../context/DataContext";
import { formatDuration, formatShortTime } from "../../lib/utils";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export default function Dashboard() {
  const { posts, sessions, alerts, rounds } = useData();
  const officerMap = useOfficerMap();
  const roundMap = useRoundMap();
  const navigate = useNavigate();
  const [, setTick] = useState(0);

  // re-render every second so elapsed timers on active rounds stay live
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const allScans = useMemo(() => sessions.flatMap((s) => s.scans), [sessions]);
  const postsChecked = allScans.filter((s) => s.status !== "missed").length;
  const delayedScans = allScans.filter((s) => s.status === "late").length;
  const missedScans = allScans.filter((s) => s.status === "missed").length;

  const activeSessions = sessions.filter((s) => s.status === "in_progress");
  const recentAlerts = [...alerts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

  const shiftSummary = useMemo(() => {
    const shiftNames = [...new Set(rounds.map((r) => r.shift))];
    return shiftNames.map((shift) => {
      const shiftRounds = rounds.filter((r) => r.shift === shift);
      const shiftSessions = sessions.filter((s) => roundMap[s.roundId]?.shift === shift);
      const completed = shiftSessions.filter((s) => s.status === "completed");
      const scans = shiftSessions.flatMap((s) => s.scans);
      return {
        shift,
        required: shiftRounds.length,
        completed: completed.length,
        checked: scans.filter((s) => s.status !== "missed").length,
        missed: scans.filter((s) => s.status === "missed").length,
        delayed: scans.filter((s) => s.status === "late").length,
      };
    });
  }, [rounds, sessions, roundMap]);

  return (
    <WebLayout crumb="Monitoring / Overview" title="Control Room Overview" requiredModule="Dashboard & Live Monitoring">
      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard label="Total Guard Posts" value={posts.length} delta={`${posts.filter((p) => p.active).length} active`} />
        <StatCard label="Posts Checked" value={postsChecked} tone="green" delta="Across all logged rounds" />
        <StatCard label="Delayed Scans" value={delayedScans} tone="amber" delta="Beyond grace period" />
        <StatCard label="Missed Scans" value={missedScans} tone="red" delta="Needs review" />
      </div>

      <div className="mb-5 grid grid-cols-[1.3fr_1fr] gap-4">
        <Card
          title="Active Rounds"
          subtitle={`${activeSessions.length} in progress`}
        >
          {activeSessions.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-inkSoft">No rounds currently in progress.</div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                  <th className="border-b border-border pb-2">Round</th>
                  <th className="border-b border-border pb-2">Officer</th>
                  <th className="border-b border-border pb-2">Started</th>
                  <th className="border-b border-border pb-2">Progress</th>
                  <th className="border-b border-border pb-2">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.map((s) => {
                  const round = roundMap[s.roundId];
                  return (
                    <tr key={s.id} className="cursor-pointer hover:bg-[#FAFCFE]" onClick={() => navigate("/web/monitoring")}>
                      <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{round?.name}</td>
                      <td className="border-b border-[#EFF2F5] py-2.5">{officerMap[s.officerId]?.name}</td>
                      <td className="num border-b border-[#EFF2F5] py-2.5">{formatShortTime(s.startedAt)}</td>
                      <td className="num border-b border-[#EFF2F5] py-2.5">{s.scans.length} / {round?.routePostIds.length} posts</td>
                      <td className="num border-b border-[#EFF2F5] py-2.5">{formatDuration(Date.now() - new Date(s.startedAt).getTime())}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Recent Alerts">
          {recentAlerts.length === 0 ? (
            <div className="py-8 text-center text-[12.5px] text-inkSoft">No alerts yet.</div>
          ) : (
            <div>
              {recentAlerts.map((a) => (
                <div key={a.id} className="flex gap-3 border-b border-[#EFF2F5] py-2.5 last:border-0">
                  <div className={`flex h-8 w-8 flex-none items-center justify-center rounded-lg ${a.status === "resolved" ? "bg-status-greenBg text-status-green" : "bg-status-redBg text-status-red"}`}>
                    {a.status === "resolved" ? <ShieldCheck size={16} /> : <AlertTriangle size={16} />}
                  </div>
                  <div className="flex-1">
                    <div className="text-[12.5px] font-bold text-navy">
                      {a.category || statusLabel(a.type)} — {posts.find((p) => p.id === a.postId)?.name || "General"}
                    </div>
                    <div className="text-[11px] text-inkSoft">
                      {roundMap[a.roundId]?.name || "—"} · <Badge tone={statusTone(a.status)}>{a.status}</Badge>
                    </div>
                  </div>
                  <div className="whitespace-nowrap text-[10.5px] text-inkSoft">{formatShortTime(a.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Shift Summary">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
              <th className="border-b border-border pb-2">Shift</th>
              <th className="border-b border-border pb-2">Rounds Configured</th>
              <th className="border-b border-border pb-2">Rounds Completed</th>
              <th className="border-b border-border pb-2">Posts Checked</th>
              <th className="border-b border-border pb-2">Missed</th>
              <th className="border-b border-border pb-2">Delayed</th>
            </tr>
          </thead>
          <tbody>
            {shiftSummary.map((row) => (
              <tr key={row.shift}>
                <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{row.shift}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{row.required}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{row.completed}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{row.checked}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{row.missed}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{row.delayed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </WebLayout>
  );
}
