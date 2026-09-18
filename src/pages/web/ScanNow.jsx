import React, { useEffect, useMemo, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { useData } from "../../context/DataContext";
import QRScanner from "../../components/web/QRScanner";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ScanNow() {
  const { webSession, roundInstances, routes, posts, actions } = useData();

  const [deviceId, setDeviceId] = useState(null);
  const [deviceError, setDeviceError] = useState(null);
  const [roundDate, setRoundDate] = useState(todayISO());
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [log, setLog] = useState([]); // last scan ATTEMPT's feedback only - transient, see below
  const [scansForRound, setScansForRound] = useState([]); // real scan history from the backend - durable
  const [submitting, setSubmitting] = useState(false);
  // Local cache of schedule_id -> RoundSchedule, used to show round_no
  // and scheduled_time (neither of which live on RoundInstance itself).
  // Kept local to this page rather than the shared roundSchedules state
  // - see getRoundSchedule's comment in DataContext.jsx for why.
  const [schedulesById, setSchedulesById] = useState({});

  const isToday = roundDate === todayISO();

  // Rounds for the selected date. The backend already scopes this to
  // only the logged-in officer's own instances for a Checking Officer
  // - no officer_id filter needs to be sent from here.
  const allRoundsForDate = useMemo(
    () => roundInstances.filter((ri) => ri.round_date === roundDate),
    [roundInstances, roundDate]
  );

  const myRounds = useMemo(
    () =>
      allRoundsForDate.filter(
        (ri) => ri.status === "PENDING" || ri.status === "IN_PROGRESS"
      ),
    [allRoundsForDate]
  );

  // Rounds that were assigned for this date but are already finished -
  // used to tell "nothing was ever assigned" apart from "it was
  // assigned and you already completed it", which look identical if
  // you only look at myRounds (open rounds) being empty.
  const closedRoundsForDate = useMemo(
    () =>
      allRoundsForDate.filter(
        (ri) => ri.status !== "PENDING" && ri.status !== "IN_PROGRESS"
      ),
    [allRoundsForDate]
  );

  const selectedInstance = allRoundsForDate.find(
    (ri) => Number(ri.id) === Number(selectedInstanceId)
  );
  const selectedIsOpen =
    selectedInstance?.status === "PENDING" ||
    selectedInstance?.status === "IN_PROGRESS";

  // Recent Scans should only ever show entries for whichever round is
  // currently selected - log itself accumulates across the whole
  // session/all rounds, so it needs filtering here rather than being
  // shown as-is.
  const logForSelectedRound = log.filter(
    (entry) => Number(entry.roundInstanceId) === Number(selectedInstanceId)
  );

  useEffect(() => {
    if (!webSession?.accessToken || !roundDate) return;
    actions.loadRoundInstances({ round_date: roundDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, roundDate]);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadRoutes();
    actions.loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // Fetch round_no/scheduled_time for any round whose schedule isn't
  // cached yet. RoundInstance only carries schedule_id, route_id -
  // round_no and scheduled_time live on RoundSchedule.
  useEffect(() => {
    if (!webSession?.accessToken) return;

    const missingIds = [
      ...new Set(
        allRoundsForDate
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
  }, [allRoundsForDate, webSession?.accessToken]);

  function routeName(routeId) {
    const route = routes.find((r) => Number(r.id) === Number(routeId));
    return route?.name || `Route #${routeId}`;
  }

  function postName(postId) {
    const post = posts.find((p) => Number(p.backendId) === Number(postId));
    return post?.name || `Post #${postId}`;
  }

  function describeRound(ri) {
    const schedule = schedulesById[ri.schedule_id];
    const route = routeName(ri.route_id);
    if (!schedule) {
      return `${route} — loading...`;
    }
    const time = schedule.scheduled_time
      ? schedule.scheduled_time.slice(0, 5)
      : "no fixed time";
    return `Round ${schedule.round_no} — ${route} — ${time}`;
  }

  useEffect(() => {
    if (!webSession?.accessToken) return;

    let cancelled = false;
    actions.getOrRegisterDeviceId().then((result) => {
      if (cancelled) return;
      if (result?.ok) {
        setDeviceId(result.deviceId);
      } else {
        setDeviceError(result?.error || "Unable to register this device.");
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // Real scan history for the selected round, from the backend -
  // this is what actually survives navigating away and back, unlike
  // the local `log` state below (which only ever held this session's
  // memory and is lost the moment this component unmounts).
  useEffect(() => {
    if (!webSession?.accessToken || !selectedInstanceId) {
      setScansForRound([]);
      return;
    }

    let cancelled = false;
    actions
      .loadScans({ round_instance_id: selectedInstanceId, page_size: 100 })
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) {
          setScansForRound(result.items);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, selectedInstanceId]);

  // Reset the selection whenever the date changes - a round picked for
  // one date has no meaning once you're looking at a different one.
  useEffect(() => {
    setSelectedInstanceId(null);
  }, [roundDate]);

  // Auto-select if there's exactly one round for the selected date -
  // the common case. If there's more than one, the officer picks.
  useEffect(() => {
    if (selectedInstanceId || myRounds.length !== 1) return;
    setSelectedInstanceId(myRounds[0].id);
  }, [myRounds, selectedInstanceId]);

  async function handleScan(qrValue) {
    if (!selectedInstance || !deviceId || submitting) return;

    setSubmitting(true);
    const result = await actions.createScan({
      round_instance_id: selectedInstance.id,
      qr_value: qrValue,
      device_id: deviceId,
    });
    setSubmitting(false);

    // Just the latest attempt - transient feedback shown right after
    // tapping, not a persisted history (that's scansForRound below,
    // sourced from the backend so it survives navigating away and
    // back). A failed attempt never creates a ScanRecord at all, so
    // this is the ONLY place a failure is ever visible.
    setLog([
      {
        id: `${Date.now()}-${Math.random()}`,
        roundInstanceId: selectedInstance.id,
        time: new Date().toLocaleTimeString(),
        qrValue,
        ok: !!result?.ok,
        message: result?.ok
          ? `${postName(result.scan?.post_id)} scanned${
              result.scan?.status ? ` (${result.scan.status})` : ""
            }.`
          : result?.error || "Scan failed.",
      },
    ]);

    // A successful scan may have flipped the round to IN_PROGRESS or
    // updated its scan counts - refresh so the header stays accurate.
    // Also refetch the real scan list so it immediately reflects the
    // new scan, rather than waiting for the next round-switch/remount.
    if (result?.ok) {
      actions.loadRoundInstances({ round_date: roundDate });
      actions
        .loadScans({ round_instance_id: selectedInstance.id, page_size: 100 })
        .then((scanResult) => {
          if (scanResult?.ok) {
            setScansForRound(scanResult.items);
          }
        });
    }
  }

  return (
    <WebLayout
      crumb="Field / Scan"
      title="Scan Now"
      requiredModule="Scan Now"
    >
      <div className="mx-auto max-w-md py-2">
        <div className="mb-4 rounded-lg border border-border bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[13px] font-bold text-navy">
              {isToday ? "Today's Rounds" : "Rounds"}
            </div>
            {!isToday && (
              <button
                className="text-[11px] font-bold text-accent-dark"
                onClick={() => setRoundDate(todayISO())}
              >
                Back to Today
              </button>
            )}
          </div>
          <input
            type="date"
            className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
            value={roundDate}
            onChange={(e) => setRoundDate(e.target.value)}
          />
        </div>

        {allRoundsForDate.length === 0 && (
          <div className="rounded-lg border border-border bg-white p-6 text-center text-[13px] text-inkSoft">
            No round assigned to you on {roundDate}.
            {isToday && " Check with your supervisor."}
          </div>
        )}

        {myRounds.length === 0 && closedRoundsForDate.length > 0 && (
          <div className="mb-4 rounded-lg border border-status-green bg-status-greenBg p-4 text-center text-[13px] text-ink">
            You've completed all your rounds for {roundDate}. Nice work!
          </div>
        )}

        {allRoundsForDate.length > 1 && (
          <div className="mb-4 rounded-lg border border-border bg-white p-4">
            <div className="mb-2 text-[12px] font-bold text-navy">
              Your rounds on {roundDate} - pick one:
            </div>
            <div className="flex flex-col gap-2">
              {allRoundsForDate.map((ri) => {
                const isOpen =
                  ri.status === "PENDING" || ri.status === "IN_PROGRESS";
                return (
                  <button
                    key={ri.id}
                    className={`rounded-lg border px-3 py-2 text-left text-[13px] ${
                      Number(selectedInstanceId) === Number(ri.id)
                        ? "border-accent bg-status-grayBg font-bold text-navy"
                        : isOpen
                        ? "border-border text-ink"
                        : "border-border text-inkSoft"
                    }`}
                    onClick={() => setSelectedInstanceId(ri.id)}
                  >
                    {describeRound(ri)} ({ri.status})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {allRoundsForDate.length === 1 && !isToday && (
          <div className="mb-4 rounded-lg border border-border bg-white p-4 text-[13px] text-ink">
            {describeRound(allRoundsForDate[0])} ({allRoundsForDate[0].status})
          </div>
        )}

        {selectedInstance && !isToday && (
          <div className="rounded-lg border border-border bg-white p-4 text-center text-[12px] text-inkSoft">
            Scanning is only available for today's rounds. Select today's
            date to scan.
          </div>
        )}

        {selectedInstance && isToday && !selectedIsOpen && (
          <div className="rounded-lg border border-border bg-white p-4 text-center text-[12px] text-inkSoft">
            This round is closed ({selectedInstance.status}). No further
            scanning is possible.
          </div>
        )}

        {selectedInstance && isToday && selectedIsOpen && (
          <>
            {deviceError && (
              <div className="mb-3 rounded-lg border border-status-red bg-status-redBg p-3 text-center text-[12px] text-status-red">
                {deviceError}
              </div>
            )}

            {!deviceError && !deviceId && (
              <div className="mb-3 rounded-lg border border-border bg-white p-3 text-center text-[12px] text-inkSoft">
                Setting up this device...
              </div>
            )}

            {deviceId && (
              <div className="rounded-lg border border-border bg-white p-4">
                <div className="mb-3 text-center text-[13px] font-semibold text-navy">
                  {describeRound(selectedInstance)}
                </div>
                <QRScanner onScan={handleScan} />
                {submitting && (
                  <div className="mt-2 text-center text-[12px] text-inkSoft">
                    Submitting scan...
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {selectedInstance && logForSelectedRound.length > 0 && (
          <div
            className={`mt-4 rounded-lg border p-3 text-center text-[12px] ${
              logForSelectedRound[0].ok
                ? "border-border bg-white text-ink"
                : "border-status-red bg-status-redBg text-status-red"
            }`}
          >
            {logForSelectedRound[0].message}
          </div>
        )}

        {selectedInstance && scansForRound.length > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-white p-4">
            <div className="mb-2 text-[12px] font-bold text-navy">
              Scans for this round
            </div>
            <div className="flex flex-col gap-1.5">
              {scansForRound.map((scan) => (
                <div key={scan.id} className="text-[12px] text-ink">
                  {postName(scan.post_id)} — {scan.status}
                  {scan.scan_timestamp
                    ? ` — ${new Date(scan.scan_timestamp).toLocaleTimeString()}`
                    : ""}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WebLayout>
  );
}