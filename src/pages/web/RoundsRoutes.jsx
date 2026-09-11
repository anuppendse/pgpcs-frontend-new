import React, { useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, PillButton, Field, TextInput, Select } from "../../components/web/FormField";
import Badge from "../../components/web/Badge";
import Modal from "../../components/web/Modal";
import { useData, usePostMap } from "../../context/DataContext";
import { ArrowUp, ArrowDown, X } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIFTS = ["Morning", "Afternoon", "Evening", "Night", "All Shifts"];

const emptyForm = {
  name: "",
  shift: SHIFTS[3],
  scheduledStart: "02:00",
  frequencyMinutes: 60,
  lateThresholdMinutes: 10,
  officerIds: [],
  activeDays: [...DAYS],
  routePostIds: [],
};

export default function RoundsRoutes() {
  const { rounds, officers, sessions, webSession, actions } = useData();
  const postMap = usePostMap();
  const canEdit = webSession.role === "Administrator";
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [addPostId, setAddPostId] = useState("");

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }
  function openEdit(r) {
    setEditingId(r.id);
    setForm({ ...r });
    setModalOpen(true);
  }
  function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || form.routePostIds.length < 1) return;
    const data = { ...form, frequencyMinutes: Number(form.frequencyMinutes), lateThresholdMinutes: Number(form.lateThresholdMinutes) };
    if (editingId) actions.updateRound(editingId, data);
    else actions.addRound(data);
    setModalOpen(false);
  }
  function toggleOfficer(id) {
    setForm((f) => ({ ...f, officerIds: f.officerIds.includes(id) ? f.officerIds.filter((x) => x !== id) : [...f.officerIds, id] }));
  }
  function toggleDay(day) {
    setForm((f) => ({ ...f, activeDays: f.activeDays.includes(day) ? f.activeDays.filter((d) => d !== day) : [...f.activeDays, day] }));
  }
  function addStop() {
    if (!addPostId) return;
    setForm((f) => ({ ...f, routePostIds: [...f.routePostIds, addPostId] }));
    setAddPostId("");
  }
  function removeStop(idx) {
    setForm((f) => ({ ...f, routePostIds: f.routePostIds.filter((_, i) => i !== idx) }));
  }
  function moveStop(idx, dir) {
    setForm((f) => {
      const ids = [...f.routePostIds];
      const target = idx + dir;
      if (target < 0 || target >= ids.length) return f;
      [ids[idx], ids[target]] = [ids[target], ids[idx]];
      return { ...f, routePostIds: ids };
    });
  }
  function roundIsActive(roundId) {
    return sessions.some((s) => s.roundId === roundId && s.status === "in_progress");
  }

  return (
    <WebLayout crumb="Configuration / Rounds" title="Round & Route Management" requiredModule="Round & Route Management"
      right={canEdit && <PillButton tone="accent" onClick={openAdd}>+ Add Round</PillButton>}
    >
      <Card title="Configured Rounds">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
              <th className="border-b border-border pb-2">Round Name</th>
              <th className="border-b border-border pb-2">Shift</th>
              <th className="border-b border-border pb-2">Frequency</th>
              <th className="border-b border-border pb-2">Late Threshold</th>
              <th className="border-b border-border pb-2">Posts</th>
              <th className="border-b border-border pb-2">Assigned Officer(s)</th>
              <th className="border-b border-border pb-2">Status</th>
              <th className="border-b border-border pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rounds.map((r) => (
              <tr key={r.id}>
                <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{r.name}</td>
                <td className="border-b border-[#EFF2F5] py-2.5">{r.shift}</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">Every {r.frequencyMinutes} min</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{r.lateThresholdMinutes} min</td>
                <td className="num border-b border-[#EFF2F5] py-2.5">{r.routePostIds.length}</td>
                <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">{r.officerIds.map((id) => officers.find((o) => o.id === id)?.name).join(", ") || "—"}</td>
                <td className="border-b border-[#EFF2F5] py-2.5"><Badge tone={roundIsActive(r.id) ? "blue" : "green"}>{roundIsActive(r.id) ? "In Progress" : "Active"}</Badge></td>
                <td className="border-b border-[#EFF2F5] py-2.5">
                  {canEdit && (
                    <div className="flex gap-3 text-[11.5px] font-bold text-accent-dark">
                      <button onClick={() => openEdit(r)}>Edit</button>
                      <button className="text-status-red" onClick={() => window.confirm(`Delete ${r.name}?`) && actions.deleteRound(r.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Round" : "Add Round"} wide>
        <form onSubmit={handleSave}>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Round Name">
              <TextInput required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Shift">
              <Select value={form.shift} onChange={(e) => setForm({ ...form, shift: e.target.value })}>
                {SHIFTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3.5">
            <Field label="Scheduled Start Time">
              <TextInput value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} placeholder="02:00" />
            </Field>
            <Field label="Frequency (minutes)">
              <TextInput type="number" min={5} value={form.frequencyMinutes} onChange={(e) => setForm({ ...form, frequencyMinutes: e.target.value })} />
            </Field>
            <Field label="Late Threshold (minutes)">
              <TextInput type="number" min={1} value={form.lateThresholdMinutes} onChange={(e) => setForm({ ...form, lateThresholdMinutes: e.target.value })} />
            </Field>
          </div>

          <Field label="Assigned Officer(s)">
            <div className="flex flex-wrap gap-2">
              {officers.filter((o) => o.role === "Checking Officer").map((o) => (
                <label key={o.id} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] ${form.officerIds.includes(o.id) ? "border-accent bg-[#E4F1F8] font-bold text-accent-dark" : "border-border text-inkSoft"}`}>
                  <input type="checkbox" className="hidden" checked={form.officerIds.includes(o.id)} onChange={() => toggleOfficer(o.id)} />
                  {o.name}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Active Days">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => (
                <label key={d} className={`cursor-pointer rounded-full border px-3 py-1.5 text-[11.5px] ${form.activeDays.includes(d) ? "border-accent bg-[#E4F1F8] font-bold text-accent-dark" : "border-border text-inkSoft"}`}>
                  <input type="checkbox" className="hidden" checked={form.activeDays.includes(d)} onChange={() => toggleDay(d)} />
                  {d}
                </label>
              ))}
            </div>
          </Field>

          <Field label="Route Sequence" hint="Order matters — the handheld app expects posts scanned in this sequence.">
            <div className="mb-2 space-y-1.5">
              {form.routePostIds.map((postId, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-status-grayBg px-3 py-2 text-[12px]">
                  <span className="num w-5 font-bold text-inkSoft">{idx + 1}</span>
                  <span className="flex-1 font-semibold text-ink">{postMap[postId]?.name || postId}</span>
                  <button type="button" onClick={() => moveStop(idx, -1)} disabled={idx === 0} className="text-inkSoft disabled:opacity-30"><ArrowUp size={14} /></button>
                  <button type="button" onClick={() => moveStop(idx, 1)} disabled={idx === form.routePostIds.length - 1} className="text-inkSoft disabled:opacity-30"><ArrowDown size={14} /></button>
                  <button type="button" onClick={() => removeStop(idx)} className="text-status-red"><X size={14} /></button>
                </div>
              ))}
              {form.routePostIds.length === 0 && <div className="text-[11.5px] text-inkSoft">No stops added yet.</div>}
            </div>
            <div className="flex gap-2">
              <Select value={addPostId} onChange={(e) => setAddPostId(e.target.value)}>
                <option value="">Select a guard post to add…</option>
                {Object.values(postMap).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
              <PillButton type="button" tone="ghost" onClick={addStop}>Add Stop</PillButton>
            </div>
          </Field>

          <PillButton tone="accent" type="submit" className="w-full justify-center">
            {editingId ? "Save Round" : "Create Round"}
          </PillButton>
        </form>
      </Modal>
    </WebLayout>
  );
}
