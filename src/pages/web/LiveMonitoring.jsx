import React, { useEffect, useMemo, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, PillButton, Select, TextInput } from "../../components/web/FormField";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { useData, usePostMap, useOfficerMap } from "../../context/DataContext";
import { formatDuration, formatShortTime, minutesBetween } from "../../lib/utils";

function StepCircle({ status }) {
  const styles = {
    done: "bg-status-green text-white",
    late: "bg-status-amber text-white",
    out_of_sequence: "bg-status-red text-white",
    current: "bg-accent text-white ring-4 ring-[#D9F0F6]",
    pending: "bg-[#CBD3DB] text-[#7A8794]",
  };
  return <div className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold ${styles[status]}`} />;
}

export default function LiveMonitoring() {
  const { rounds, sessions, actions } = useData();
  const postMap = usePostMap();
  const officerMap = useOfficerMap();
  const [, setTick] = useState(0);
  const [roundId, setRoundId] = useState(rounds[0]?.id || "");
  const [officerId, setOfficerId] = useState(rounds[0]?.officerIds[0] || "");
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [scanPostId, setScanPostId] = useState("");
  const [remark, setRemark] = useState("");
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const activeSessions = sessions.filter((s) => s.status === "in_progress");
  const selected = activeSessions.find((s) => s.id === selectedSessionId) || activeSessions[0] || null;
  const selectedRound = selected ? rounds.find((r) => r.id === selected.roundId) : null;

  useEffect(() => {
    if (selectedRound && !scanPostId) setScanPostId(selectedRound.routePostIds[selected.currentIndex] || "");
  }, [selected?.currentIndex, selectedRound]);

  function handleStart() {
    const result = actions.startSession(roundId, officerId);
    if (result.ok) {
      setSelectedSessionId(result.session.id);
      setNotice({ tone: "green", text: `${rounds.find((r) => r.id === roundId)?.name} started for ${officerMap[officerId]?.name}.` });
    }
  }

  function handleRecordScan() {
    if (!selected) return;
    const result = actions.recordScan(selected.id, scanPostId, remark);
    if (!result.ok) {
      setNotice({ tone: "red", text: result.error });
      return;
    }
    setRemark("");
    setScanPostId(selectedRound.routePostIds[selected.currentIndex + 1] || "");
    if (result.alert) {
      setNotice({ tone: statusTone(result.alert.type) === "red" ? "red" : "amber", text: `${statusLabel(result.alert.type)} recorded at ${postMap[scanPostId]?.name}.` });
    } else {
      setNotice({ tone: "green", text: `${postMap[scanPostId]?.name} checked on time.` });
    }
    if (result.isLastStop) {
      setNotice({ tone: "blue", text: `That was the final stop — use "Finish Round" to close it out.` });
    }
  }

  function handleFinish() {
    if (!selected) return;
    const result = actions.completeSession(selected.id);
    setNotice({ tone: result.missedCount > 0 ? "red" : "green", text: `Round completed. ${result.missedCount} post(s) never scanned were logged as missed.` });
    setSelectedSessionId(null);
  }

  return (
    <WebLayout crumb="Monitoring / Live" title="Live Round Monitoring" requiredModule="Dashboard & Live Monitoring">
      <Card title="Start a Round" subtitle="Simulates the handheld app beginning a checking round">
        <div className="grid grid-cols-3 gap-3.5">
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Round</label>
            <Select value={roundId} onChange={(e) => { setRoundId(e.target.value); setOfficerId(rounds.find((r) => r.id === e.target.value)?.officerIds[0] || ""); }}>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Officer</label>
            <Select value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
              {Object.values(officerMap).map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
              ))}
            </Select>
          </div>
          <div className="flex items-end">
            <PillButton tone="accent" onClick={handleStart} className="w-full justify-center">Start Round</PillButton>
          </div>
        </div>
      </Card>

      {notice && (
        <div className={`mb-4 rounded-lg px-3.5 py-2.5 text-[12px] font-semibold ${
          { green: "bg-status-greenBg text-status-green", amber: "bg-status-amberBg text-[#9C6A0C]", red: "bg-status-redBg text-status-red", blue: "bg-[#E4F1F8] text-accent-dark" }[notice.tone]
        }`}>
          {notice.text}
        </div>
      )}

      {activeSessions.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-[12.5px] text-inkSoft">No round is currently active. Start one above.</div>
        </Card>
      ) : (
        <>
          <Card title="In-Progress Rounds" subtitle="Select one to view its live sequence">
            <div className="flex flex-wrap gap-2">
              {activeSessions.map((s) => {
                const r = rounds.find((rr) => rr.id === s.roundId);
                return (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSessionId(s.id); setScanPostId(""); }}
                    className={`rounded-lg border px-3.5 py-2 text-left text-[12px] ${selected?.id === s.id ? "border-accent bg-[#E4F1F8]" : "border-border bg-white hover:bg-status-grayBg"}`}
                  >
                    <div className="font-bold text-navy">{r.name}</div>
                    <div className="text-inkSoft">{officerMap[s.officerId]?.name} · {s.scans.length}/{r.routePostIds.length} posts</div>
                  </button>
                );
              })}
            </div>
          </Card>

          {selected && selectedRound && (
            <>
              <Card title="Route Sequence & Status">
                <div className="flex gap-6 overflow-x-auto pb-2">
                  {selectedRound.routePostIds.map((postId, idx) => {
                    const scan = selected.scans[idx];
                    let status = "pending";
                    if (scan) status = scan.status === "on_time" ? "done" : scan.status;
                    else if (idx === selected.currentIndex) status = "current";
                    return (
                      <div key={idx} className="flex min-w-[92px] flex-col items-center">
                        <StepCircle status={status} />
                        <div className="mt-2 text-center text-[10.5px] font-bold text-navy">{postMap[postId]?.name}</div>
                        <div className="num text-center text-[10px] text-inkSoft">{scan ? formatShortTime(scan.actualTime) : idx === selected.currentIndex ? "Current" : "Pending"}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-5 text-[11.5px] text-inkSoft">
                  <Badge tone="green">Checked</Badge>
                  <Badge tone="amber">Late</Badge>
                  <Badge tone="red">Missed / Out of Sequence</Badge>
                  <Badge tone="blue">Current</Badge>
                  <Badge tone="gray">Pending</Badge>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <Card title="Round Detail">
                  <table className="w-full text-[12.5px]">
                    <tbody>
                      <tr><td className="py-1.5 text-inkSoft">Officer</td><td className="py-1.5 font-bold text-navy">{officerMap[selected.officerId]?.name}</td></tr>
                      <tr><td className="py-1.5 text-inkSoft">Round Start</td><td className="num py-1.5">{formatShortTime(selected.startedAt)}</td></tr>
                      <tr><td className="py-1.5 text-inkSoft">Elapsed</td><td className="num py-1.5">{formatDuration(Date.now() - new Date(selected.startedAt).getTime())}</td></tr>
                      <tr><td className="py-1.5 text-inkSoft">Progress</td><td className="num py-1.5">{selected.scans.length} / {selectedRound.routePostIds.length} posts</td></tr>
                    </tbody>
                  </table>

                  {selected.currentIndex < selectedRound.routePostIds.length ? (
                    <div className="mt-4 border-t border-border pt-4">
                      <label className="mb-1.5 block text-[11.5px] font-bold text-navy">Record Scan For Post</label>
                      <Select value={scanPostId} onChange={(e) => setScanPostId(e.target.value)} className="mb-2.5">
                        {Object.values(postMap).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} {p.id === selectedRound.routePostIds[selected.currentIndex] ? "(expected next)" : ""}
                          </option>
                        ))}
                      </Select>
                      <TextInput placeholder="Optional remark (e.g. Light not working)" value={remark} onChange={(e) => setRemark(e.target.value)} className="mb-2.5" />
                      <div className="flex gap-2">
                        <PillButton tone="accent" onClick={handleRecordScan}>Record Scan</PillButton>
                        <PillButton tone="ghost" onClick={handleFinish}>Finish Round Now</PillButton>
                      </div>
                      <p className="mt-2 text-[10.5px] text-inkSoft">
                        Choosing a post other than the expected one simulates an out-of-sequence scan; scanning after the round's
                        late threshold simulates a delayed check.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-border pt-4">
                      <PillButton tone="accent" onClick={handleFinish}>Finish Round</PillButton>
                    </div>
                  )}
                </Card>

                <Card title="Live Scan Feed">
                  {selected.scans.length === 0 ? (
                    <div className="py-8 text-center text-[12px] text-inkSoft">No scans recorded yet.</div>
                  ) : (
                    [...selected.scans].reverse().map((scan, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-[#EFF2F5] py-2 last:border-0">
                        <div>
                          <div className="text-[12.5px] font-bold text-navy">{postMap[scan.postId]?.name}</div>
                          <div className="text-[11px] text-inkSoft">
                            Scheduled {formatShortTime(scan.scheduledTime)} · Actual {formatShortTime(scan.actualTime)}
                            {scan.status === "late" && ` · ${minutesBetween(scan.scheduledTime, scan.actualTime)} min late`}
                          </div>
                        </div>
                        <Badge tone={statusTone(scan.status)}>{statusLabel(scan.status)}</Badge>
                      </div>
                    ))
                  )}
                </Card>
              </div>
            </>
          )}
        </>
      )}
    </WebLayout>
  );
}
