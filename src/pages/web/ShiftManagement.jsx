import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import {
  Card,
  PillButton,
  Select,
  TextInput,
  Toggle,
  Field,
} from "../../components/web/FormField";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";
import { formatDate } from "../../lib/utils";

const emptyShiftForm = {
  name: "",
  startTime: "",
  endTime: "",
};

const emptyAssignmentForm = {
  user_id: "",
  shift_id: "",
  assignment_date: "",
};

/* =========================================================
   SHIFT RULE HELPERS
   ---------------------------------------------------------
   Business rules for Shift creation/editing:
    1. A shift's duration must be EXACTLY SHIFT_DURATION_HOURS,
       mirroring Config.SHIFT_DURATION_HOURS in the backend's
       config.py (the source of truth for this rule).
    2. A new shift's start time must match another existing
       shift's end time exactly - shifts run back-to-back with
       no gap and no overlap (e.g. shift 1 is 6:00 AM-2:00 PM,
       so the next shift must start at exactly 2:00 PM).
   There is no cap on the number of shifts - since each is a
   fixed duration and must chain back-to-back off an existing
   one, a full 24-hour day naturally fills up on its own
   (e.g. 3 shifts at 8 hours each).
========================================================= */

// Normalizes a role string for comparison only (case/space/underscore
// insensitive), same approach used on the User Roles & Access page, so
// "Checking Officer", "CHECKING_OFFICER" and "checking officer" all
// compare equal regardless of exactly how each officer record stores it.
function normalizeRoleKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "");
}

// Returns today's date as "YYYY-MM-DD" (local time), for use as the min
// bound on the Assignment Date <input type="date">.
function getTodayDateInputValue() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Returns tomorrow's date as "YYYY-MM-DD" (local time), for use as the
// max bound on the Assignment Date <input type="date">.
function getTomorrowDateInputValue() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Mirrors Config.SHIFT_DURATION_HOURS in the backend's config.py, which
// is the source of truth for this rule. The frontend can't import a
// Python class directly, so this value is kept in sync manually - if
// SHIFT_DURATION_HOURS changes in config.py, update it here too.
const SHIFT_DURATION_HOURS = 8;
const REQUIRED_SHIFT_DURATION_MINUTES = SHIFT_DURATION_HOURS * 60;

// True if shiftA and shiftB are immediately back-to-back - either A ends
// exactly when B starts, or B ends exactly when A starts - in either
// direction. Used to stop an officer being double-booked into two
// consecutive shifts with zero rest between them (e.g. Morning then
// Evening); they must skip at least one shift before their next one.
function shiftsAreAdjacent(shiftA, shiftB) {
  if (!shiftA || !shiftB) return false;
  const aStart = toMinutes(shiftA.startTime);
  const aEnd = toMinutes(shiftA.endTime);
  const bStart = toMinutes(shiftB.startTime);
  const bEnd = toMinutes(shiftB.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }
  return aEnd === bStart || bEnd === aStart;
}

// Converts a "HH:MM" (24-hour, from <input type="time">) string into
// minutes-since-midnight. Returns null if the value is missing/invalid.
function toMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) {
    return null;
  }
  const [hh, mm] = timeStr.split(":").map((v) => Number(v));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

// Duration in minutes between start and end. Handles an overnight shift
// (end time earlier than start time, e.g. 22:00 -> 04:00) by wrapping
// across midnight.
function getDurationMinutes(startTime, endTime) {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return null;

  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

// Formats minutes-since-midnight back into a readable 12-hour time
// (e.g. 810 -> "1:30 PM") for use in validation/error messages.
function minutesToDisplayTime(totalMinutes) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh24 = Math.floor(normalized / 60);
  const mm = normalized % 60;
  const period = hh24 >= 12 ? "PM" : "AM";
  const hh12 = hh24 % 12 === 0 ? 12 : hh24 % 12;
  return `${hh12}:${String(mm).padStart(2, "0")} ${period}`;
}

export default function ShiftManagement() {
  const { webSession, shifts, shiftAssignments, officers, actions } = useData();
  // Two distinct permission levels on this page:
  //  - canManageShifts: creating/editing shifts and toggling a shift's
  //    own Active/Inactive status - Administrator only.
  //  - canManageAssignments: assigning an officer to a shift / removing
  //    an assignment - Administrator AND Supervisor. Supervisors get
  //    this so they can staff shifts, but still can't touch the shifts
  //    themselves (add/edit/activate/deactivate).
  const canManageShifts = webSession?.role === "Administrator";
  const canManageAssignments =
    webSession?.role === "Administrator" || webSession?.role === "Supervisor";

  // Fetch fresh data every time this page mounts, matching the same
  // fix applied to Guard Post Management / QR Code Management / Officer
  // Management - so this always reflects the backend, not a stale
  // localStorage snapshot from a previous session.
  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadShifts();
    actions.loadShiftAssignments();
    // Only active users are needed for the assignment dropdown.
    actions.loadOfficers({ status: "ACTIVE" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  /* =========================================================
     SHIFTS
  ========================================================= */

  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState(emptyShiftForm);
  const [savingShift, setSavingShift] = useState(false);

  const otherShiftsForForm = editingShiftId
    ? shifts.filter((s) => Number(s.id) !== Number(editingShiftId))
    : shifts;

  // Only a shift that ALREADY has a valid 8h duration can set the
  // "required next start time" hint. This matters because shifts
  // created before this rule existed may have odd durations (e.g. 6h,
  // 6.5h) - comparing against those would produce a misleading required
  // start time. Any legacy shift with an invalid duration is ignored
  // here; fixing it (editing it to exactly 8h) is what lets it count.
  const validOtherShifts = otherShiftsForForm.filter(
    (s) => getDurationMinutes(s.startTime, s.endTime) === REQUIRED_SHIFT_DURATION_MINUTES
  );

  // The clock time(s) this shift is allowed to start at, i.e. the end
  // time(s) of the other valid (already-8h) existing shifts, since
  // shifts run back-to-back. Kept as a list (not just the numeric max)
  // because once 3 shifts form a full 24-hour loop, an overnight
  // shift's end time can be a smaller clock value than a daytime
  // shift's end time while still being a valid predecessor to attach
  // after. Empty means there's no valid 8h shift yet to anchor against,
  // so any start time is fine for this one.
  const requiredNextStartOptionsMinutes = validOtherShifts
    .map((s) => toMinutes(s.endTime))
    .filter((m) => m !== null);

  function openAddShift() {
    setEditingShiftId(null);
    setShiftForm(emptyShiftForm);
    setShiftModalOpen(true);
  }

  function openEditShift(shift) {
    setEditingShiftId(shift.id);
    setShiftForm({
      name: shift.name || "",
      startTime: shift.startTime || "",
      endTime: shift.endTime || "",
    });
    setShiftModalOpen(true);
  }

  function closeShiftModal() {
    if (savingShift) return;
    setShiftModalOpen(false);
    setEditingShiftId(null);
    setShiftForm(emptyShiftForm);
  }

  // Runs all shift business-rule validations. Returns an error message
  // string if invalid, or null if everything checks out.
  function validateShiftForm() {
    const durationMinutes = getDurationMinutes(
      shiftForm.startTime,
      shiftForm.endTime
    );

    if (durationMinutes === null) {
      return "Please enter a valid start time and end time.";
    }

    // Rule 1: duration must be exactly SHIFT_DURATION_HOURS - not more,
    // not less.
    if (durationMinutes !== REQUIRED_SHIFT_DURATION_MINUTES) {
      return `Shift duration must be exactly ${SHIFT_DURATION_HOURS} hours.`;
    }

    const otherShifts = editingShiftId
      ? shifts.filter((s) => Number(s.id) !== Number(editingShiftId))
      : shifts;

    // When editing an existing shift and the start/end time haven't
    // actually changed (e.g. only the name is being edited), skip the
    // time-based checks entirely - this shift's times already passed
    // validation when it was originally saved, so there's nothing new
    // to re-check, and re-running the back-to-back check here would
    // otherwise require every OTHER shift to also still be perfectly
    // in sync, which has nothing to do with a name change.
    if (editingShiftId) {
      const originalShift = shifts.find(
        (s) => Number(s.id) === Number(editingShiftId)
      );
      if (
        originalShift &&
        originalShift.startTime === shiftForm.startTime &&
        originalShift.endTime === shiftForm.endTime
      ) {
        return null;
      }
    }

    // Rule 3: this shift's start time must EXACTLY MATCH another
    // existing shift's end time - shifts run back-to-back with zero
    // gap and zero overlap. Only other shifts that are ALREADY a valid
    // 8h duration are used to anchor this - a legacy shift with a bad
    // duration (saved before this rule existed) is ignored, otherwise
    // nothing could ever be saved again.
    //
    // Matching against ANY of the other shifts' end times (rather than
    // just the largest/"latest" one) matters once 3 shifts form a full
    // 24-hour loop: an overnight shift's end time (e.g. 6:00 AM) is a
    // smaller clock value than a daytime shift's end time (e.g. 10:00
    // PM) even though it may be the correct immediate predecessor -
    // picking only the numeric maximum would wrongly reject a valid,
    // already-correct chain.
    const validOtherShiftsForCheck = otherShifts.filter(
      (s) => getDurationMinutes(s.startTime, s.endTime) === REQUIRED_SHIFT_DURATION_MINUTES
    );

    if (validOtherShiftsForCheck.length > 0) {
      const validEndTimesMinutes = validOtherShiftsForCheck
        .map((s) => toMinutes(s.endTime))
        .filter((m) => m !== null);
      const newStartMinutes = toMinutes(shiftForm.startTime);

      const matchesAnyPredecessor =
        newStartMinutes !== null && validEndTimesMinutes.includes(newStartMinutes);

      if (!matchesAnyPredecessor) {
        const optionsText = validEndTimesMinutes
          .map((m) => minutesToDisplayTime(m))
          .join(" or ");
        return `This shift must start exactly when another shift ends - shifts run back-to-back with no gap. Valid start time${
          validEndTimesMinutes.length > 1 ? "s" : ""
        }: ${optionsText}.`;
      }
    }

    return null;
  }

  async function handleSaveShift(e) {
    e.preventDefault();

    if (!shiftForm.name.trim() || !shiftForm.startTime || !shiftForm.endTime) {
      alert("Shift name, start time and end time are required.");
      return;
    }

    const validationError = validateShiftForm();
    if (validationError) {
      alert(validationError);
      return;
    }

    setSavingShift(true);

    try {
      const result = editingShiftId
        ? await actions.updateShift(editingShiftId, shiftForm)
        : await actions.createShift(shiftForm);

      if (!result?.ok) {
        alert(result?.error || "Unable to save shift.");
        return;
      }

      closeShiftModal();
    } catch (error) {
      console.error("Save shift error:", error);
      alert("Unable to connect to Shifts API.");
    } finally {
      setSavingShift(false);
    }
  }

  async function handleToggleShiftActive(shift) {
    const confirmMessage = shift.active
      ? `Mark "${shift.name}" as inactive?`
      : `Mark "${shift.name}" as active?`;

    if (!window.confirm(confirmMessage)) return;

    const result = await actions.toggleShiftActive(shift.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to update shift status.");
    }
  }

  /* =========================================================
     SHIFT ASSIGNMENTS
  ========================================================= */

  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignmentForm);
  const [savingAssignment, setSavingAssignment] = useState(false);

  // Only Checking Officers can be assigned to a shift here - Supervisors
  // are excluded. The list is already limited to ACTIVE users by the API
  // call above (loadOfficers({ status: "ACTIVE" })).
  const checkingOfficers = officers.filter(
    (o) => normalizeRoleKey(o.role || o.role_name) === normalizeRoleKey("Checking Officer")
  );

  // Assignment Date can be today or any future date - only past dates
  // are blocked. Wired up as the min bound on the <input type="date">
  // below (no max bound).
  const assignmentMinDate = getTodayDateInputValue();

  function openAddAssignment() {
    setAssignmentForm({
      ...emptyAssignmentForm,
      shift_id: shifts[0]?.id ?? "",
      user_id: checkingOfficers[0]?.id ?? "",
      assignment_date: assignmentMinDate,
    });
    setAssignmentModalOpen(true);
  }

  function closeAssignmentModal() {
    if (savingAssignment) return;
    setAssignmentModalOpen(false);
    setAssignmentForm(emptyAssignmentForm);
  }

  async function handleSaveAssignment(e) {
    e.preventDefault();

    if (
      !assignmentForm.user_id ||
      !assignmentForm.shift_id ||
      !assignmentForm.assignment_date
    ) {
      alert("Officer, shift and assignment date are required.");
      return;
    }

    // Enforce the "no past dates" rule server-side of the picker too, in
    // case the native date input is bypassed some other way.
    if (assignmentForm.assignment_date < assignmentMinDate) {
      alert("Assignment date cannot be in the past.");
      return;
    }

    // An officer can't be double-booked into two shifts that run
    // back-to-back on the same date (e.g. Morning then Evening) - they
    // must skip at least one shift before their next assignment (e.g.
    // Morning then Night is fine). Check every OTHER shift this officer
    // is already assigned to on the same date against the shift being
    // assigned now.
    const targetShift = shifts.find(
      (s) => Number(s.id) === Number(assignmentForm.shift_id)
    );

    const officerAssignmentsSameDate = shiftAssignments.filter(
      (a) =>
        Number(a.user_id) === Number(assignmentForm.user_id) &&
        a.assignment_date === assignmentForm.assignment_date
    );

    const hasAdjacentConflict = officerAssignmentsSameDate.some((a) => {
      const otherShift = shifts.find((s) => Number(s.id) === Number(a.shift_id));
      return shiftsAreAdjacent(targetShift, otherShift);
    });

    if (hasAdjacentConflict) {
      alert("Officer must skip at least one shift before this one.");
      return;
    }

    setSavingAssignment(true);

    try {
      const result = await actions.createShiftAssignment(assignmentForm);

      if (!result?.ok) {
        alert(result?.error || "Unable to create assignment.");
        return;
      }

      closeAssignmentModal();
    } catch (error) {
      console.error("Save shift assignment error:", error);
      alert("Unable to connect to Shift Assignments API.");
    } finally {
      setSavingAssignment(false);
    }
  }

  async function handleDeleteAssignment(assignment) {
    if (!window.confirm("Remove this shift assignment?")) return;

    const result = await actions.deleteShiftAssignment(assignment.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to delete assignment.");
    }
  }

  function officerName(userId) {
    const officer = officers.find(
      (o) => Number(o.id) === Number(userId) || Number(o.user_id) === Number(userId)
    );
    return officer?.name || `Officer #${userId}`;
  }

  function shiftLabel(shiftId) {
    const shift = shifts.find((s) => Number(s.id) === Number(shiftId));
    return shift ? `${shift.name} (${shift.startTime}–${shift.endTime})` : `Shift #${shiftId}`;
  }

  return (
    <WebLayout
      crumb="Configuration / Shifts"
      title="Shift Management"
      requiredModule="Shift Management"
    >
      <div className="grid grid-cols-[1fr_1.2fr] gap-4">
        <Card
          title="Shifts"
          subtitle={`${shifts.length} shift${shifts.length === 1 ? "" : "s"}`}
          right={
            canManageShifts && (
              <PillButton tone="accent" onClick={openAddShift}>
                + Add Shift
              </PillButton>
            )
          }
        >
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Shift Name</th>
                <th className="border-b border-border pb-2">Start</th>
                <th className="border-b border-border pb-2">End</th>
                <th className="border-b border-border pb-2">Status</th>
                {canManageShifts && (
                  <th className="border-b border-border pb-2">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                    {s.name}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {s.startTime}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {s.endTime}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <div className="flex items-center gap-2">
                      <Toggle
                        checked={s.active}
                        disabled={!canManageShifts}
                        onChange={() => handleToggleShiftActive(s)}
                      />
                      <span className="text-[11px] text-inkSoft">
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  {canManageShifts && (
                    <td className="border-b border-[#EFF2F5] py-2.5">
                      <button
                        className="text-[11.5px] font-bold text-accent-dark"
                        onClick={() => openEditShift(s)}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {shifts.length === 0 && (
                <tr>
                  <td
                    colSpan={canManageShifts ? 5 : 4}
                    className="py-6 text-center text-[12px] text-inkSoft"
                  >
                    No shifts defined yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card
          title="Shift Assignments"
          subtitle={`${shiftAssignments.length} assignment${shiftAssignments.length === 1 ? "" : "s"}`}
          right={
            canManageAssignments && (
              <PillButton tone="accent" onClick={openAddAssignment} disabled={!shifts.length || !checkingOfficers.length}>
                + Assign Officer
              </PillButton>
            )
          }
        >
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Officer</th>
                <th className="border-b border-border pb-2">Shift</th>
                <th className="border-b border-border pb-2">Date</th>
                <th className="border-b border-border pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shiftAssignments.map((a) => (
                <tr key={a.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-semibold text-ink">
                    {officerName(a.user_id)}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {shiftLabel(a.shift_id)}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {a.assignment_date ? formatDate(a.assignment_date) : "—"}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    {canManageAssignments && (
                      <button
                        className="text-[11.5px] font-bold text-accent-dark"
                        onClick={() => handleDeleteAssignment(a)}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {shiftAssignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-[12px] text-inkSoft">
                    No shift assignments yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      <Modal
        open={shiftModalOpen}
        onClose={closeShiftModal}
        title={editingShiftId ? "Edit Shift" : "Add Shift"}
      >
        <form onSubmit={handleSaveShift}>
          {/* Rule summary shown to the admin so the constraints are clear
              before they hit "Save" and get an alert. */}
          <p className="mb-3 rounded-md bg-[#F3F6FA] px-3 py-2 text-[11.5px] text-inkSoft">
            Shifts are {SHIFT_DURATION_HOURS} hours, back-to-back.
            {/* The valid-start-time hint only makes sense when ADDING a
                new shift. When editing an existing one, its time is
                already part of the valid chain (or untouched, e.g. a
                rename), so repeating it here is just noise. */}
            {!editingShiftId && requiredNextStartOptionsMinutes.length > 0
              ? ` Start at ${requiredNextStartOptionsMinutes
                  .map((m) => minutesToDisplayTime(m))
                  .join(" or ")}.`
              : ""}
          </p>

          <Field label="Shift Name">
            <TextInput
              required
              value={shiftForm.name}
              onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
              placeholder="e.g. Night Shift"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Start Time">
              <TextInput
                type="time"
                required
                value={shiftForm.startTime}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, startTime: e.target.value })
                }
              />
            </Field>

            <Field label="End Time">
              <TextInput
                type="time"
                required
                value={shiftForm.endTime}
                onChange={(e) =>
                  setShiftForm({ ...shiftForm, endTime: e.target.value })
                }
              />
            </Field>
          </div>

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeShiftModal}
              className="w-full justify-center"
              disabled={savingShift}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={savingShift}
            >
              {savingShift ? "Saving..." : editingShiftId ? "Save Changes" : "Add Shift"}
            </PillButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={assignmentModalOpen}
        onClose={closeAssignmentModal}
        title="Assign Officer to Shift"
      >
        <form onSubmit={handleSaveAssignment}>
          <Field label="Officer">
            <Select
              required
              value={assignmentForm.user_id}
              onChange={(e) =>
                setAssignmentForm({ ...assignmentForm, user_id: e.target.value })
              }
            >
              {checkingOfficers.length === 0 && (
                <option value="" disabled>
                  No active Checking Officers available
                </option>
              )}
              {checkingOfficers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Shift">
            <Select
              required
              value={assignmentForm.shift_id}
              onChange={(e) =>
                setAssignmentForm({ ...assignmentForm, shift_id: e.target.value })
              }
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assignment Date" hint="Past dates cannot be selected">
            <TextInput
              type="date"
              required
              min={assignmentMinDate}
              value={assignmentForm.assignment_date}
              onChange={(e) =>
                setAssignmentForm({
                  ...assignmentForm,
                  assignment_date: e.target.value,
                })
              }
            />
          </Field>

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeAssignmentModal}
              className="w-full justify-center"
              disabled={savingAssignment}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={savingAssignment}
            >
              {savingAssignment ? "Assigning..." : "Assign Officer"}
            </PillButton>
          </div>
        </form>
      </Modal>
    </WebLayout>
  );
}