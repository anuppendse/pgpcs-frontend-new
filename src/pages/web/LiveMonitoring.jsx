import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card } from "../../components/web/FormField";
import Badge, { statusTone, statusLabel } from "../../components/web/Badge";
import { useData } from "../../context/DataContext";
import { formatDuration, formatShortTime } from "../../lib/utils";

const POLL_INTERVAL_MS = 15000;

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function StepCircle({ status }) {
  const styles = {
    done: "bg-status-green text-white",
    late: "bg-status-amber text-white",
    out_of_sequence: "bg-status-red text-white",
    current: "bg-accent text-white ring-4 ring-[#D9F0F6]",
    pending: "bg-[#CBD3DB] text-[#7A8794]",
  };
  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-extrabold ${styles[status]}`}
    />
  );
}

// statusTone/statusLabel expect lowercase-ish keys ("on_time", "late",
// "out_of_sequence") - the backend sends the uppercase ScanStatus enum
// value, so normalize before using them (see AuditTrail.jsx, same fix).
function scanStatusKey(status) {
  return String(status || "").toLowerCase();
}

export default function LiveMonitoring() {
  const { webSession, roundInstances, routes, routePosts, posts, officers, actions } =
    useData();

  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [scansForRound, setScansForRound] = useState([]);
  const [schedulesById, setSchedulesById] = useState({});

  const today = todayISO();

  const todayRounds = roundInstances.filter((ri) => ri.round_date === today);
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const upcomingRounds = todayRounds.filter((ri) => {
    if (ri.status !== "PENDING") return false;
    // Bounded window: starting soon, or overdue by at most 2 hours -
    // NOT an unbounded look-back. A round stuck open for days
    // shouldn't linger here forever; that belongs on the admin's
    // manual Close Round workflow instead (Round Instances page).
    const scheduledAt = new Date(ri.scheduled_start_time);
    return scheduledAt >= twoHoursAgo && scheduledAt <= twoHoursFromNow;
  });
  const inProgressRounds = todayRounds.filter(
    (ri) => ri.status === "IN_PROGRESS"
  );

  const selected = todayRounds.find(
    (ri) => Number(ri.id) === Number(selectedInstanceId)
  );

  // Static reference data, loaded once.
  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadOfficers();
    actions.loadRoutes();
    actions.loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // The in-progress rounds list - this IS the "live" part, polled every
  // 15s so admins see new rounds starting / existing ones progressing
  // without manually refreshing.
  useEffect(() => {
    if (!webSession?.accessToken) return;

    function refresh() {
      actions.loadRoundInstances({ round_date: today });
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, today]);

  // Route posts (for the step sequence) + real scans for whichever
  // round is selected, also polled while it's open.
  useEffect(() => {
    if (!webSession?.accessToken || !selected) {
      setScansForRound([]);
      return;
    }

    function refresh() {
      actions.loadRoutePosts(selected.route_id);
      actions
        .loadScans({ round_instance_id: selected.id, page_size: 100 })
        .then((result) => {
          if (result?.ok) setScansForRound(result.items);
        });
    }
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, selected?.id, selected?.route_id]);

  // round_no/scheduled_time for the header - not carried on
  // RoundInstance itself, see ScanNow.jsx for the same pattern. Fetches
  // for every round shown in the picker, not just the selected one -
  // describeRound() is called for all of them, so only fetching the
  // selected round's schedule left every other round stuck showing
  // "loading..." forever.
  useEffect(() => {
    if (!webSession?.accessToken) return;

    const missingIds = [
      ...new Set(
        [...upcomingRounds, ...inProgressRounds]
          .map((ri) => ri.schedule_id)
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
  }, [webSession?.accessToken, upcomingRounds, inProgressRounds]);

  function officerName(officerId) {
    const officer = officers.find((o) => Number(o.id) === Number(officerId));
    return officer?.name || `Officer #${officerId}`;
  }

  function postName(postId) {
    const post = posts.find((p) => Number(p.backendId) === Number(postId));
    return post?.name || `Post #${postId}`;
  }

  function routeName(routeId) {
    const route = routes.find((r) => Number(r.id) === Number(routeId));
    return route?.name || `Route #${routeId}`;
  }

  function describeRound(ri) {
    const schedule = schedulesById[ri.schedule_id];
    const route = routeName(ri.route_id);
    if (!schedule) return `${route} — loading...`;
    return `${route} — Round ${schedule.round_no}`;
  }

  const routePostsForSelected = routePosts
    .filter((rp) => Number(rp.route_id) === Number(selected?.route_id))
    .sort((a, b) => a.sequence_no - b.sequence_no);

  // Which post is "current" (next expected) - same definition the
  // backend's sequence check uses: the lowest sequence_no not yet
  // scanned.
  const scannedPostIds = new Set(scansForRound.map((s) => Number(s.post_id)));
  const nextExpectedSeq = routePostsForSelected.find(
    (rp) => !scannedPostIds.has(Number(rp.post_id))
  )?.sequence_no;

  const steps = routePostsForSelected.map((rp) => {
    const scan = scansForRound.find(
      (s) => Number(s.post_id) === Number(rp.post_id)
    );
    let status = "pending";
    if (scan) {
      status = scan.status === "ON_TIME" ? "done" : scanStatusKey(scan.status);
    } else if (rp.sequence_no === nextExpectedSeq) {
      status = "current";
    }
    return { ...rp, status, scan };
  });

  return (
    <WebLayout
      crumb="Monitoring / Live"
      title="Live Round Monitoring"
      requiredModule="Dashboard & Live Monitoring"
    >
      {upcomingRounds.length === 0 && inProgressRounds.length === 0 ? (
        <Card>
          <div className="py-10 text-center text-[12.5px] text-inkSoft">
            No rounds upcoming or in progress today.
          </div>
        </Card>
      ) : (
        <>
          {upcomingRounds.length > 0 && (
            <Card
              title="Upcoming Rounds"
              subtitle="Starting within 2 hours, or overdue by up to 2 hours"
            >
              <div className="flex flex-wrap gap-2">
                {upcomingRounds.map((ri) => {
                  const isOverdue = new Date(ri.scheduled_start_time) < new Date();
                  return (
                    <button
                      key={ri.id}
                      onClick={() => setSelectedInstanceId(ri.id)}
                      className={`rounded-lg border px-3.5 py-2 text-left text-[12px] ${
                        Number(selectedInstanceId) === Number(ri.id)
                          ? "border-accent bg-[#E4F1F8]"
                          : isOverdue
                          ? "border-status-red bg-status-redBg"
                          : "border-border bg-white hover:bg-status-grayBg"
                      }`}
                    >
                      <div className="font-bold text-navy">{describeRound(ri)}</div>
                      <div
                        className={isOverdue ? "text-status-red" : "text-inkSoft"}
                      >
                        {officerName(ri.officer_id)} ·{" "}
                        {isOverdue ? "overdue since" : "scheduled"}{" "}
                        {formatShortTime(ri.scheduled_start_time)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {inProgressRounds.length > 0 && (
            <Card
              title="In-Progress Rounds"
              subtitle="Select one to view its live sequence - refreshes every 15s"
            >
              <div className="flex flex-wrap gap-2">
                {inProgressRounds.map((ri) => (
                  <button
                    key={ri.id}
                    onClick={() => setSelectedInstanceId(ri.id)}
                    className={`rounded-lg border px-3.5 py-2 text-left text-[12px] ${
                      Number(selectedInstanceId) === Number(ri.id)
                        ? "border-accent bg-[#E4F1F8]"
                        : "border-border bg-white hover:bg-status-grayBg"
                    }`}
                  >
                    <div className="font-bold text-navy">{describeRound(ri)}</div>
                    <div className="text-inkSoft">
                      {officerName(ri.officer_id)} · {ri.scanned_posts_count ?? 0}/
                      {ri.required_posts_count ?? "?"} posts
                    </div>
                  </button>
              ))}
            </div>
          </Card>
          )}

          {selected && (
            <>
              <Card title="Route Sequence & Status">
                <div className="flex gap-6 overflow-x-auto pb-2">
                  {steps.map((step) => (
                    <div
                      key={step.id}
                      className="flex min-w-[92px] flex-col items-center"
                    >
                      <StepCircle status={step.status} />
                      <div className="mt-2 text-center text-[10.5px] font-bold text-navy">
                        {postName(step.post_id)}
                      </div>
                      <div className="num text-center text-[10px] text-inkSoft">
                        {step.scan
                          ? formatShortTime(step.scan.scan_timestamp)
                          : step.status === "current"
                          ? "Current"
                          : "Pending"}
                      </div>
                    </div>
                  ))}
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
                      <tr>
                        <td className="py-1.5 text-inkSoft">Officer</td>
                        <td className="py-1.5 font-bold text-navy">
                          {officerName(selected.officer_id)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-inkSoft">Scheduled Start</td>
                        <td className="num py-1.5">
                          {formatShortTime(selected.scheduled_start_time)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-inkSoft">Actual Start</td>
                        <td className="num py-1.5">
                          {selected.actual_start_time
                            ? formatShortTime(selected.actual_start_time)
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-inkSoft">Elapsed</td>
                        <td className="num py-1.5">
                          {selected.actual_start_time
                            ? formatDuration(
                                Date.now() -
                                  new Date(selected.actual_start_time).getTime()
                              )
                            : "—"}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-inkSoft">Progress</td>
                        <td className="num py-1.5">
                          {selected.scanned_posts_count ?? 0} /{" "}
                          {selected.required_posts_count ?? "?"} posts
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </Card>

                <Card title="Live Scan Feed">
                  {scansForRound.length === 0 ? (
                    <div className="py-8 text-center text-[12px] text-inkSoft">
                      No scans recorded yet.
                    </div>
                  ) : (
                    [...scansForRound]
                      .sort(
                        (a, b) =>
                          new Date(b.scan_timestamp) - new Date(a.scan_timestamp)
                      )
                      .map((scan) => (
                        <div
                          key={scan.id}
                          className="flex items-center justify-between border-b border-[#EFF2F5] py-2 last:border-0"
                        >
                          <div>
                            <div className="text-[12.5px] font-bold text-navy">
                              {postName(scan.post_id)}
                            </div>
                            <div className="text-[11px] text-inkSoft">
                              Scheduled {formatShortTime(scan.scheduled_time)} ·
                              Actual {formatShortTime(scan.scan_timestamp)}
                              {scan.status === "LATE" &&
                                scan.delay_minutes != null &&
                                ` · ${scan.delay_minutes} min late`}
                            </div>
                          </div>
                          <Badge tone={statusTone(scanStatusKey(scan.status))}>
                            {statusLabel(scanStatusKey(scan.status))}
                          </Badge>
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