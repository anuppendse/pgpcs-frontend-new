import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import StatCard from "../../components/web/StatCard";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { Card, Select } from "../../components/web/FormField";
import { useData } from "../../context/DataContext";
import { formatDateTime } from "../../lib/utils";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// Real ExceptionType values only - no "Emergency" type exists in this
// enum at all (that was a separate, now-removed feature), so nothing
// needs excluding here beyond just listing what's real.
const EXCEPTION_TYPES = [
  { value: "MISSED", label: "Missed" },
  { value: "LATE", label: "Late" },
  { value: "OUT_OF_SEQUENCE", label: "Out of Sequence" },
  { value: "INCOMPLETE_ROUND", label: "Incomplete Round" },
];

function exceptionStatusKey(type) {
  return String(type || "").toLowerCase();
}

export default function Dashboard() {
  const { webSession, posts, officers, actions } = useData();

  const [dailyStats, setDailyStats] = useState(null);
  const [shiftRows, setShiftRows] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [exceptionType, setExceptionType] = useState("");
  const [schedulesById, setSchedulesById] = useState({});
  const [loading, setLoading] = useState(true);

  const today = todayISO();

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadPosts();
    actions.loadOfficers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([
      actions.loadReport("daily", { date: today }),
      actions.loadReport("shift-wise", { start_date: today, end_date: today }),
    ]).then(([dailyResult, shiftResult]) => {
      if (cancelled) return;
      if (dailyResult?.ok) setDailyStats(dailyResult.data);
      if (shiftResult?.ok) setShiftRows(shiftResult.data.items || []);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, today]);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    let cancelled = false;

    const params = { page_size: 50, round_date: today };
    if (exceptionType) params.exception_type = exceptionType;

    actions.loadExceptions(params).then((result) => {
      if (cancelled) return;
      if (result?.ok) setExceptions(result.items);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, exceptionType, today]);

  // round_no isn't on the exception itself - resolve via each
  // exception's schedule_id (now returned directly by the backend).
  useEffect(() => {
    if (!webSession?.accessToken) return;

    const missingIds = [
      ...new Set(
        exceptions
          .map((e) => e.schedule_id)
          .filter((id) => id != null && !schedulesById[id])
      ),
    ];
    if (missingIds.length === 0) return;

    let cancelled = false;
    Promise.all(missingIds.map((id) => actions.getRoundSchedule(id))).then(
      (results) => {
        if (cancelled) return;
        setSchedulesById((prev) => {
          const next = { ...prev };
          results.forEach((result) => {
            if (result?.ok && result.schedule) {
              next[result.schedule.schedule_id] = result.schedule;
            }
          });
          return next;
        });
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, exceptions]);

  function postName(postId) {
    const post = posts.find((p) => Number(p.backendId) === Number(postId));
    return post?.name || `Post #${postId}`;
  }

  function officerName(officerId) {
    if (officerId == null) return "—";
    const officer = officers.find((o) => Number(o.id) === Number(officerId));
    return officer?.name || `Officer #${officerId}`;
  }

  function roundLabel(scheduleId) {
    if (scheduleId == null) return "—";
    const schedule = schedulesById[scheduleId];
    return schedule ? `Round ${schedule.round_no}` : "loading...";
  }

  return (
    <WebLayout
      crumb="Monitoring / Overview"
      title="Control Room Overview"
      requiredModule="Dashboard & Live Monitoring"
    >
      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard label="Total Guard Posts" value={posts.length} />
        <StatCard
          label="Posts Checked"
          value={dailyStats?.total_scans ?? 0}
          tone="green"
          delta="Today"
        />
        <StatCard
          label="Delayed Scans"
          value={dailyStats?.late_scans ?? 0}
          tone="amber"
          delta="Today"
        />
        <StatCard
          label="Missed Scans"
          value={dailyStats?.missed_post_exceptions ?? 0}
          tone="red"
          delta="Today"
        />
      </div>

      <Card
        title="Round Exceptions"
        subtitle={`${exceptions.length} shown - today`}
        right={
          <div className="w-48">
            <Select
              value={exceptionType}
              onChange={(e) => setExceptionType(e.target.value)}
            >
              <option value="">All Types</option>
              {EXCEPTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </div>
        }
      >
        {exceptions.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-inkSoft">
            No exceptions recorded today.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Round</th>
                <th className="border-b border-border pb-2">Officer</th>
                <th className="border-b border-border pb-2">Post</th>
                <th className="border-b border-border pb-2">Type</th>
                <th className="border-b border-border pb-2">Scheduled</th>
                <th className="border-b border-border pb-2">Actual</th>
                <th className="border-b border-border pb-2">Delay (min)</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.map((exc) => (
                <tr key={exc.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {roundLabel(exc.schedule_id)}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    {officerName(exc.officer_id)}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                    {postName(exc.post_id)}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <Badge tone={statusTone(exceptionStatusKey(exc.exception_type))}>
                      {statusLabel(exceptionStatusKey(exc.exception_type))}
                    </Badge>
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {formatDateTime(exc.scheduled_time)}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {formatDateTime(exc.actual_time)}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {exc.delay_minutes ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="Shift Summary" subtitle="Today">
        {loading ? (
          <div className="py-8 text-center text-[12.5px] text-inkSoft">Loading...</div>
        ) : shiftRows.length === 0 ? (
          <div className="py-8 text-center text-[12.5px] text-inkSoft">
            No rounds scheduled for today.
          </div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Shift</th>
                <th className="border-b border-border pb-2">Total Rounds</th>
                <th className="border-b border-border pb-2">Completed</th>
                <th className="border-b border-border pb-2">Incomplete</th>
                <th className="border-b border-border pb-2">Missed</th>
                <th className="border-b border-border pb-2">Delayed</th>
              </tr>
            </thead>
            <tbody>
              {shiftRows.map((row) => (
                <tr key={row.shift_id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                    {row.shift_name}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {row.total_rounds}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {row.completed_rounds}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {row.incomplete_rounds}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {row.missed_rounds}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5">
                    {row.delayed_rounds}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </WebLayout>
  );
}