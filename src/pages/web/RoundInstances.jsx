import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, PillButton, Select, Field } from "../../components/web/FormField";
import Badge from "../../components/web/Badge";
import { useData } from "../../context/DataContext";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function currentTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// Overnight-aware, same logic as the backend's _time_within_shift and
// RoundSchedules.jsx's isTimeWithinShift.
function isTimeWithinShift(shift, timeStr) {
  if (!shift || !timeStr || !shift.startTime || !shift.endTime) return false;
  const toMinutes = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minutes = toMinutes(timeStr);
  const start = toMinutes(shift.startTime);
  const end = toMinutes(shift.endTime);
  if (start <= end) return minutes >= start && minutes <= end;
  return minutes >= start || minutes <= end;
}

function findCurrentShift(shifts) {
  const nowStr = currentTimeHHMM();
  return shifts.find((s) => isTimeWithinShift(s, nowStr)) || null;
}

export default function RoundInstances() {
  const {
    webSession,
    shifts,
    shiftAssignments,
    roundSchedules,
    roundInstances,
    officers,
    routes,
    actions,
  } = useData();
  const canEdit =
    webSession?.role === "Administrator" || webSession?.role === "Supervisor";

  const [roundDate, setRoundDate] = useState(todayISO());
  const [shiftId, setShiftId] = useState("");
  const [picks, setPicks] = useState({}); // { [user_id]: schedule_id }
  const [creatingFor, setCreatingFor] = useState(null);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadShifts();
    actions.loadOfficers();
    actions.loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // Default to whichever shift is actually active right now, so landing
  // on (or returning to) this page shows today's current data without
  // requiring a manual reselect every time. Only runs while shiftId is
  // still unset, so it never overrides a deliberate manual choice.
  useEffect(() => {
    if (shiftId || shifts.length === 0) return;
    const current = findCurrentShift(shifts);
    if (current) {
      setShiftId(current.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, shiftId]);

  useEffect(() => {
    if (!shiftId) return;
    actions.loadRoundSchedules(shiftId);
    actions.loadShiftAssignments({ shift_id: shiftId, assignment_date: roundDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId, roundDate]);

  useEffect(() => {
    if (!roundDate) return;
    actions.loadRoundInstances({ round_date: roundDate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundDate]);

  const roster = shiftAssignments.filter(
    (a) =>
      Number(a.shift_id) === Number(shiftId) && a.assignment_date === roundDate
  );

  const schedulesForShift = roundSchedules.filter(
    (s) => Number(s.shift_id) === Number(shiftId)
  );

  const instancesForShiftAndDate = roundInstances.filter(
    (ri) =>
      ri.round_date === roundDate &&
      schedulesForShift.some((s) => Number(s.id) === Number(ri.schedule_id))
  );

  function officerName(userId) {
    const officer = officers.find(
      (o) => Number(o.id) === Number(userId) || Number(o.user_id) === Number(userId)
    );
    return officer?.name || `Officer #${userId}`;
  }

  function scheduleLabel(schedule) {
    const route = routes.find((r) => Number(r.id) === Number(schedule.route_id));
    const routeName = route?.name || `Route #${schedule.route_id}`;
    const time = schedule.scheduled_time || "interval-based";
    return `${routeName} — Round ${schedule.round_no} (${time})`;
  }

  function instancesFor(userId) {
    return instancesForShiftAndDate.filter(
      (ri) => Number(ri.officer_id) === Number(userId)
    );
  }

  async function handleRemoveInstance(roundInstance) {
    if (!window.confirm("Remove this round instance?")) return;

    const result = await actions.deleteRoundInstance(roundInstance.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to delete round instance.");
    }
  }

  async function handleCreate(userId) {
    const scheduleId = picks[userId];
    if (!scheduleId) {
      alert("Pick a route/round for this officer first.");
      return;
    }

    const alreadyAssigned = instancesForShiftAndDate.some(
      (ri) =>
        Number(ri.officer_id) === Number(userId) &&
        Number(ri.schedule_id) === Number(scheduleId)
    );
    if (alreadyAssigned) {
      alert("This round is already assigned to this officer on this date.");
      return;
    }

    setCreatingFor(userId);
    try {
      const result = await actions.createRoundInstance({
        schedule_id: scheduleId,
        officer_id: userId,
        round_date: roundDate,
      });

      if (!result?.ok) {
        alert(result?.error || "Unable to create round instance.");
        return;
      }

      setPicks((prev) => ({ ...prev, [userId]: "" }));
    } catch (error) {
      console.error("Create round instance error:", error);
      alert("Unable to connect to Round Instances API.");
    } finally {
      setCreatingFor(null);
    }
  }

  return (
    <WebLayout
      crumb="Configuration / Rounds"
      title="Round Instances"
      requiredModule="Round & Route Management"
    >
      <Card title="Plan Rounds for a Shift">
        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Date">
            <input
              type="date"
              className="w-full rounded-lg border border-border px-3 py-2 text-[13px]"
              value={roundDate}
              onChange={(e) => setRoundDate(e.target.value)}
            />
          </Field>

          <Field label="Shift">
            <Select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="" disabled>
                Select a shift
              </option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {!shiftId && shifts.length > 0 && (
        <Card title="Officers Rostered This Shift">
          <div className="py-8 text-center text-[12px] text-inkSoft">
            No shift is currently active. Pick one above to see its roster
            and round assignments.
          </div>
        </Card>
      )}

      {shiftId && (
        <Card
          title="Officers Rostered This Shift"
          subtitle={`${roster.length} officer${roster.length === 1 ? "" : "s"} on ${roundDate}`}
        >
          {schedulesForShift.length === 0 && (
            <div className="py-6 text-center text-[12px] text-inkSoft">
              No round schedules defined for this shift yet. Set those up first
              in Round Schedule Management.
            </div>
          )}

          {schedulesForShift.length > 0 && roster.length === 0 && (
            <div className="py-6 text-center text-[12px] text-inkSoft">
              No officers assigned to this shift on {roundDate}.
            </div>
          )}

          {schedulesForShift.length > 0 &&
            roster.map((a) => {
              const existing = instancesFor(a.user_id);

              return (
                <div
                  key={a.id}
                  className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-ink">
                      {officerName(a.user_id)}
                    </div>

                    {existing.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {existing.map((ri) => {
                          const schedule = schedulesForShift.find(
                            (s) => Number(s.id) === Number(ri.schedule_id)
                          );
                          return (
                            <div key={ri.id} className="flex items-center gap-1">
                              <Badge tone="green">
                                {schedule ? scheduleLabel(schedule) : `Round #${ri.id}`}
                              </Badge>
                              {canEdit && (
                                <button
                                  className="text-[11px] font-bold text-status-red"
                                  title="Remove this round instance"
                                  onClick={() => handleRemoveInstance(ri)}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <Select
                        value={picks[a.user_id] || ""}
                        onChange={(e) =>
                          setPicks((prev) => ({
                            ...prev,
                            [a.user_id]: e.target.value,
                          }))
                        }
                      >
                        <option value="" disabled>
                          Add route/round
                        </option>
                        {schedulesForShift.map((s) => (
                          <option key={s.id} value={s.id}>
                            {scheduleLabel(s)}
                          </option>
                        ))}
                      </Select>

                      <PillButton
                        tone="accent"
                        onClick={() => handleCreate(a.user_id)}
                        disabled={creatingFor === a.user_id}
                      >
                        {creatingFor === a.user_id ? "Adding..." : "Assign"}
                      </PillButton>
                    </div>
                  )}
                </div>
              );
            })}
        </Card>
      )}
    </WebLayout>
  );
}