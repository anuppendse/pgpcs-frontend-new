import React, { useMemo, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import StatCard from "../../components/web/StatCard";
import { Card, Select, TextInput, PillButton } from "../../components/web/FormField";
import { useData, usePostMap, useOfficerMap, useRoundMap } from "../../context/DataContext";
import { exportToCSV, formatDuration } from "../../lib/utils";

function toDateInput(d) {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { sessions } = useData();
  const postMap = usePostMap();
  const officerMap = useOfficerMap();
  const roundMap = useRoundMap();

  const [reportType, setReportType] = useState("round");
  const [from, setFrom] = useState(toDateInput(new Date(Date.now() - 7 * 86400000)));
  const [to, setTo] = useState(toDateInput(new Date(Date.now() + 86400000)));

  const filteredSessions = useMemo(() => {
    const fromTime = new Date(from).getTime();
    const toTime = new Date(to).getTime();
    return sessions.filter((s) => {
      const t = new Date(s.startedAt).getTime();
      return t >= fromTime && t <= toTime;
    });
  }, [sessions, from, to]);

  const allScans = filteredSessions.flatMap((s) => s.scans);
  const successful = allScans.filter((s) => s.status === "on_time").length;
  const missed = allScans.filter((s) => s.status === "missed").length;
  const delayed = allScans.filter((s) => s.status === "late" || s.status === "out_of_sequence").length;

  const roundRows = useMemo(() => {
    return filteredSessions.map((s) => {
      const round = roundMap[s.roundId];
      const duration = s.endedAt ? new Date(s.endedAt) - new Date(s.startedAt) : Date.now() - new Date(s.startedAt);
      return {
        round: round?.name,
        officer: officerMap[s.officerId]?.name,
        scheduled: round?.routePostIds.length || 0,
        checked: s.scans.filter((x) => x.status !== "missed").length,
        missed: s.scans.filter((x) => x.status === "missed").length,
        delayed: s.scans.filter((x) => x.status === "late").length,
        duration: formatDuration(duration),
        status: s.status,
      };
    });
  }, [filteredSessions, roundMap, officerMap]);

  const officerRows = useMemo(() => {
    const byOfficer = {};
    filteredSessions.forEach((s) => {
      const key = s.officerId;
      byOfficer[key] = byOfficer[key] || { officer: officerMap[key]?.name, rounds: 0, checked: 0, missed: 0, delayed: 0 };
      byOfficer[key].rounds += 1;
      byOfficer[key].checked += s.scans.filter((x) => x.status !== "missed").length;
      byOfficer[key].missed += s.scans.filter((x) => x.status === "missed").length;
      byOfficer[key].delayed += s.scans.filter((x) => x.status === "late").length;
    });
    return Object.values(byOfficer);
  }, [filteredSessions, officerMap]);

  const postRows = useMemo(() => {
    const byPost = {};
    allScans.forEach((scan) => {
      const key = scan.postId;
      byPost[key] = byPost[key] || { post: postMap[key]?.name, checked: 0, missed: 0, delayed: 0 };
      if (scan.status === "missed") byPost[key].missed += 1;
      else byPost[key].checked += 1;
      if (scan.status === "late") byPost[key].delayed += 1;
    });
    return Object.values(byPost);
  }, [allScans, postMap]);

  const config = {
    round: { title: "Round Summary", rows: roundRows, columns: [
      { label: "Round", value: (r) => r.round }, { label: "Officer", value: (r) => r.officer },
      { label: "Scheduled Posts", value: (r) => r.scheduled }, { label: "Checked", value: (r) => r.checked },
      { label: "Missed", value: (r) => r.missed }, { label: "Delayed", value: (r) => r.delayed },
      { label: "Duration", value: (r) => r.duration }, { label: "Status", value: (r) => r.status },
    ]},
    officer: { title: "Officer-wise Summary", rows: officerRows, columns: [
      { label: "Officer", value: (r) => r.officer }, { label: "Rounds", value: (r) => r.rounds },
      { label: "Posts Checked", value: (r) => r.checked }, { label: "Missed", value: (r) => r.missed },
      { label: "Delayed", value: (r) => r.delayed },
    ]},
    post: { title: "Post-wise Compliance", rows: postRows, columns: [
      { label: "Guard Post", value: (r) => r.post }, { label: "Checked", value: (r) => r.checked },
      { label: "Missed", value: (r) => r.missed }, { label: "Delayed", value: (r) => r.delayed },
    ]},
  }[reportType];

  return (
    <WebLayout crumb="Reporting / Reports" title="Reports" requiredModule="Reports & Audit Trail">
      <Card title="Generate Report">
        <div className="mb-4 grid grid-cols-4 gap-3.5">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Report Type</label>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              <option value="round">Round Summary (Daily Checking Report)</option>
              <option value="officer">Officer-wise Report</option>
              <option value="post">Post-wise Compliance</option>
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">From</label>
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">To</label>
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <PillButton tone="ghost" onClick={() => exportToCSV(config.rows, config.columns, `${config.title.replace(/\s+/g, "-")}.csv`)}>Export CSV</PillButton>
            <PillButton tone="ghost" onClick={() => window.print()}>Export PDF</PillButton>
          </div>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-4 gap-4">
        <StatCard label="Rounds in Range" value={filteredSessions.length} />
        <StatCard label="Total Scan Events" value={allScans.length} />
        <StatCard label="Successful Scans" value={successful} tone="green" />
        <StatCard label="Missed / Delayed" value={`${missed} / ${delayed}`} />
      </div>

      <Card title={config.title} subtitle={`${from} to ${to}`}>
        {config.rows.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-inkSoft">No rounds recorded in this date range.</div>
        ) : (
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                {config.columns.map((c) => <th key={c.label} className="border-b border-border pb-2">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {config.rows.map((row, i) => (
                <tr key={i}>
                  {config.columns.map((c) => (
                    <td key={c.label} className="num border-b border-[#EFF2F5] py-2.5">{c.value(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </WebLayout>
  );
}
