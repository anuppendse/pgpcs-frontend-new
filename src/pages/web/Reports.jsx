import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, Select, PillButton } from "../../components/web/FormField";
import { useData } from "../../context/DataContext";
import { exportToCSV } from "../../lib/utils";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function monthAgoISO() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

const REPORT_TYPES = [
  { value: "daily", label: "Daily Summary" },
  { value: "weekly", label: "Weekly Summary" },
  { value: "monthly", label: "Monthly Summary" },
  { value: "officer-wise", label: "Officer-wise" },
  { value: "post-wise", label: "Post-wise" },
  { value: "shift-wise", label: "Shift-wise" },
];

const STAT_GROUPS = [
  {
    title: "Rounds",
    subtitle: "One row per round instance - a whole route, walked once",
    stats: [
      ["total_rounds", "Total Rounds"],
      ["pending", "Pending"],
      ["in_progress", "In Progress"],
      ["completed", "Completed"],
      ["incomplete", "Incomplete"],
      ["missed", "Missed"],
      ["round_delayed", "Delayed"],
    ],
  },
  {
    title: "Scans",
    subtitle: "One row per individual QR scan",
    stats: [
      ["total_scans", "Total Scans"],
      ["on_time_scans", "On Time"],
      ["late_scans", "Late"],
      ["out_of_sequence_scans", "Out of Sequence"],
    ],
  },
  {
    title: "Exceptions",
    subtitle: "One row per logged problem, generated when a round closes",
    stats: [
      ["total_exceptions", "Total Exceptions"],
      ["missed_post_exceptions", "Missed Posts"],
    ],
  },
];

export default function Reports() {
  const { webSession } = useData();
  const dataApi = useData();

  const [reportType, setReportType] = useState("daily");
  const [dailyDate, setDailyDate] = useState(todayISO());
  const [weekStart, setWeekStart] = useState(todayISO());
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [startDate, setStartDate] = useState(monthAgoISO());
  const [endDate, setEndDate] = useState(todayISO());

  const [stats, setStats] = useState(null);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const isSummary = ["daily", "weekly", "monthly"].includes(reportType);

  useEffect(() => {
    if (!webSession?.accessToken) return;

    let params = {};
    if (reportType === "daily") {
      params = { date: dailyDate };
    } else if (reportType === "weekly") {
      params = { start_date: weekStart };
    } else if (reportType === "monthly") {
      params = { year, month };
    } else {
      params = { start_date: startDate, end_date: endDate };
    }

    let cancelled = false;
    setLoading(true);
    dataApi.actions.loadReport(reportType, params).then((result) => {
      if (cancelled) return;
      if (!result?.ok) {
        alert(result?.error || "Unable to load report.");
        setStats(null);
        setItems(null);
      } else if (isSummary) {
        setStats(result.data);
        setItems(null);
      } else {
        setStats(null);
        setItems(result.data.items || []);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    webSession?.accessToken,
    reportType,
    dailyDate,
    weekStart,
    year,
    month,
    startDate,
    endDate,
  ]);

  function handleExport() {
    if (!items || items.length === 0) return;

    const keys = Object.keys(items[0]);
    const columns = keys.map((key) => ({
      label: key,
      value: (row) => row[key],
    }));
    exportToCSV(items, columns, `${reportType}-report.csv`);
  }

  return (
    <WebLayout crumb="Reporting / Reports" title="Reports" requiredModule="Reports & Audit Trail">
      <Card title="Report Type">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-56">
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Report</label>
            <Select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>

          {reportType === "daily" && (
            <div className="w-48">
              <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Date</label>
              <input
                type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                value={dailyDate}
                onChange={(e) => setDailyDate(e.target.value)}
              />
            </div>
          )}

          {reportType === "weekly" && (
            <div className="w-48">
              <label className="mb-1.5 block text-[11.5px] font-bold text-navy">
                Week Starting
              </label>
              <input
                type="date"
                className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                value={weekStart}
                onChange={(e) => setWeekStart(e.target.value)}
              />
            </div>
          )}

          {reportType === "monthly" && (
            <>
              <div className="w-32">
                <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Year</label>
                <input
                  type="number"
                  className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                />
              </div>
              <div className="w-32">
                <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Month</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                />
              </div>
            </>
          )}

          {!isSummary && (
            <>
              <div className="w-48">
                <label className="mb-1.5 block text-[11.5px] font-bold text-navy">
                  Start Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="w-48">
                <label className="mb-1.5 block text-[11.5px] font-bold text-navy">
                  End Date
                </label>
                <input
                  type="date"
                  className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <PillButton
                tone="ghost"
                onClick={handleExport}
                disabled={!items || items.length === 0}
              >
                Export CSV
              </PillButton>
            </>
          )}
        </div>
      </Card>

      {loading && (
        <Card title="Loading">
          <div className="py-10 text-center text-[12.5px] text-inkSoft">Loading report...</div>
        </Card>
      )}

      {!loading && isSummary && stats && (
        <>
          <div className="mb-3 text-[12px] text-inkSoft">
            {REPORT_TYPES.find((r) => r.value === reportType)?.label} ·{" "}
            {stats.date_range?.start_date} to {stats.date_range?.end_date}
          </div>

          {STAT_GROUPS.map((group) => (
            <Card key={group.title} title={group.title} subtitle={group.subtitle}>
              <div className="grid grid-cols-4 gap-3">
                {group.stats.map(([key, label]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-border p-3 text-center"
                  >
                    <div className="text-[20px] font-bold text-navy">
                      {stats[key] ?? 0}
                    </div>
                    <div className="text-[11px] text-inkSoft">{label}</div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </>
      )}

      {!loading && !isSummary && items && (
        <Card
          title={REPORT_TYPES.find((r) => r.value === reportType)?.label}
          subtitle={`${items.length} row${items.length === 1 ? "" : "s"}`}
        >
          {items.length === 0 ? (
            <div className="py-10 text-center text-[12.5px] text-inkSoft">
              No data for this date range.
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                  {Object.keys(items[0]).map((key) => (
                    <th key={key} className="border-b border-border pb-2">
                      {key.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((row, i) => (
                  <tr key={i}>
                    {Object.keys(items[0]).map((key) => (
                      <td key={key} className="border-b border-[#EFF2F5] py-2.5">
                        {row[key] ?? "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </WebLayout>
  );
}