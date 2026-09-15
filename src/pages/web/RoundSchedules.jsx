import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, PillButton, Select, TextInput, Field } from "../../components/web/FormField";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";

const emptyForm = {
  shift_id: "",
  route_id: "",
  round_no: "",
  scheduled_time: "",
  tolerance_minutes: 10,
};

export default function RoundSchedules() {
  const { webSession, shifts, routes, roundSchedules, actions } = useData();
  const canEdit = webSession?.role === "Administrator";

  const [shiftId, setShiftId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!webSession?.accessToken) return;
    actions.loadShifts();
    actions.loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  useEffect(() => {
    if (shiftId) {
      actions.loadRoundSchedules(shiftId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftId]);

  const schedulesForShift = roundSchedules
    .filter((s) => Number(s.shift_id) === Number(shiftId))
    .sort((a, b) => a.round_no - b.round_no);

  function routeName(routeId) {
    const route = routes.find((r) => Number(r.id) === Number(routeId));
    return route?.name || `Route #${routeId}`;
  }

  function openAdd() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      shift_id: shiftId || shifts[0]?.id || "",
      route_id: routes[0]?.id || "",
    });
    setModalOpen(true);
  }

  function openEdit(schedule) {
    setEditingId(schedule.id);
    setForm({
      shift_id: schedule.shift_id,
      route_id: schedule.route_id,
      round_no: schedule.round_no,
      scheduled_time: schedule.scheduled_time || "",
      tolerance_minutes: schedule.tolerance_minutes ?? 10,
    });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(schedule) {
    if (
      !window.confirm(
        `Delete Round ${schedule.round_no} (${routeName(schedule.route_id)})?`
      )
    ) {
      return;
    }

    const result = await actions.deleteRoundSchedule(schedule.id);
    if (!result?.ok) {
      alert(result?.error || "Unable to delete round schedule.");
    }
  }

  // Mirrors the backend's overnight-aware shift-window check, for
  // instant feedback before a round-trip to the server.
  function isTimeWithinShift(shift, timeStr) {
    if (!shift || !timeStr) return true;
    const [h, m] = timeStr.split(":").map(Number);
    const minutes = h * 60 + m;
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    if (start <= end) return minutes >= start && minutes <= end;
    return minutes >= start || minutes <= end;
  }

  async function handleSave(e) {
    e.preventDefault();

    if (!form.shift_id || !form.route_id || !form.round_no || !form.scheduled_time) {
      alert("Shift, route, round number and scheduled time are all required.");
      return;
    }

    const duplicate = roundSchedules.find(
      (s) =>
        s.id !== editingId &&
        Number(s.shift_id) === Number(form.shift_id) &&
        Number(s.route_id) === Number(form.route_id) &&
        Number(s.round_no) === Number(form.round_no)
    );
    if (duplicate) {
      alert(
        `Round ${form.round_no} for this shift and route already exists. Pick a different round number, or edit the existing one.`
      );
      return;
    }

    const timeClash = roundSchedules.find(
      (s) =>
        s.id !== editingId &&
        Number(s.shift_id) === Number(form.shift_id) &&
        Number(s.route_id) === Number(form.route_id) &&
        s.scheduled_time === form.scheduled_time
    );
    if (timeClash) {
      alert(
        `Round ${timeClash.round_no} on this route is already scheduled at ${form.scheduled_time}.`
      );
      return;
    }

    const shift = shifts.find((s) => Number(s.id) === Number(form.shift_id));
    if (shift && !isTimeWithinShift(shift, form.scheduled_time)) {
      alert(
        `Scheduled time must fall within the shift's hours (${shift.startTime}–${shift.endTime}).`
      );
      return;
    }

    setSaving(true);
    try {
      const result = editingId
        ? await actions.updateRoundSchedule(editingId, {
            round_no: Number(form.round_no),
            scheduled_time: form.scheduled_time,
            tolerance_minutes: Number(form.tolerance_minutes),
          })
        : await actions.createRoundSchedule({
            ...form,
            round_no: Number(form.round_no),
            tolerance_minutes: Number(form.tolerance_minutes),
          });

      if (!result?.ok) {
        alert(
          result?.error ||
            `Unable to ${editingId ? "update" : "create"} round schedule.`
        );
        return;
      }

      if (!shiftId) {
        setShiftId(form.shift_id);
      }

      closeModal();
    } catch (error) {
      console.error("Save round schedule error:", error);
      alert("Unable to connect to Round Schedules API.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WebLayout
      crumb="Configuration / Rounds"
      title="Round Schedule Management"
      requiredModule="Round & Route Management"
      right={
        canEdit && (
          <PillButton tone="accent" onClick={openAdd}>
            + Add Round Schedule
          </PillButton>
        )
      }
    >
      <Card title="Round Schedules">
        <Field label="Shift" hint="Pick a shift to see its round schedules.">
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

        {shiftId && (
          <table className="mt-4 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Round</th>
                <th className="border-b border-border pb-2">Route</th>
                <th className="border-b border-border pb-2">Scheduled Time</th>
                <th className="border-b border-border pb-2">Tolerance (min)</th>
                <th className="border-b border-border pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schedulesForShift.map((s) => (
                <tr key={s.id}>
                  <td className="num border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                    Round {s.round_no}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5 text-ink">
                    {routeName(s.route_id)}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {s.scheduled_time || "—"}
                  </td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                    {s.tolerance_minutes}
                  </td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    {canEdit && (
                      <div className="flex gap-3 text-[11.5px] font-bold text-accent-dark">
                        <button onClick={() => openEdit(s)}>Edit</button>
                        <button onClick={() => handleDelete(s)}>Delete</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {schedulesForShift.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[12px] text-inkSoft">
                    No round schedules for this shift yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editingId ? "Edit Round Schedule" : "Add Round Schedule"}
      >
        <form onSubmit={handleSave}>
          <Field label="Shift">
            <Select
              required
              disabled={!!editingId}
              value={form.shift_id}
              onChange={(e) => {
                const newShiftId = e.target.value;
                setForm({ ...form, shift_id: newShiftId });
                if (newShiftId) actions.loadRoundSchedules(newShiftId);
              }}
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.startTime}–{s.endTime})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Route" hint={editingId ? "Delete and re-add to change shift or route." : undefined}>
            <Select
              required
              disabled={!!editingId}
              value={form.route_id}
              onChange={(e) => setForm({ ...form, route_id: e.target.value })}
            >
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Round No.">
              <TextInput
                type="number"
                min="1"
                required
                value={form.round_no}
                onChange={(e) => setForm({ ...form, round_no: e.target.value })}
              />
            </Field>

            <Field label="Scheduled Time">
              <TextInput
                type="time"
                required
                value={form.scheduled_time}
                onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Tolerance (minutes)" hint="Grace period before a scan counts as late.">
            <TextInput
              type="number"
              min="0"
              value={form.tolerance_minutes}
              onChange={(e) => setForm({ ...form, tolerance_minutes: e.target.value })}
            />
          </Field>

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeModal}
              className="w-full justify-center"
              disabled={saving}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={saving}
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Round Schedule"}
            </PillButton>
          </div>
        </form>
      </Modal>
    </WebLayout>
  );
}