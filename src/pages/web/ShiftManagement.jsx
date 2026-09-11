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

export default function ShiftManagement() {
  const { webSession, shifts, shiftAssignments, officers, actions } = useData();
  const canEdit = webSession?.role === "Administrator";

  // Fetch fresh data every time this page mounts, matching the same
  // fix applied to Guard Post Management / QR Code Management / Officer
  // Management - so this always reflects the backend, not a stale
  // localStorage snapshot from a previous session.
  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadShifts();
    actions.loadShiftAssignments();
    actions.loadOfficers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  /* =========================================================
     SHIFTS
  ========================================================= */

  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState(null);
  const [shiftForm, setShiftForm] = useState(emptyShiftForm);
  const [savingShift, setSavingShift] = useState(false);

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

  async function handleSaveShift(e) {
    e.preventDefault();

    if (!shiftForm.name.trim() || !shiftForm.startTime || !shiftForm.endTime) {
      alert("Shift name, start time and end time are required.");
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

  function openAddAssignment() {
    setAssignmentForm({
      ...emptyAssignmentForm,
      shift_id: shifts[0]?.id ?? "",
      user_id: officers[0]?.id ?? "",
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
            canEdit && (
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
                <th className="border-b border-border pb-2">Actions</th>
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
                        disabled={!canEdit}
                        onChange={() => handleToggleShiftActive(s)}
                      />
                      <span className="text-[11px] text-inkSoft">
                        {s.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    {canEdit && (
                      <button
                        className="text-[11.5px] font-bold text-accent-dark"
                        onClick={() => openEditShift(s)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {shifts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[12px] text-inkSoft">
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
            canEdit && (
              <PillButton tone="accent" onClick={openAddAssignment} disabled={!shifts.length || !officers.length}>
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
                    {canEdit && (
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
              {officers.map((o) => (
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

          <Field label="Assignment Date">
            <TextInput
              type="date"
              required
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