import React, { useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import { Card, Field, TextInput, Select, Toggle, PillButton } from "../../components/web/FormField";
import Badge from "../../components/web/Badge";
import { useData } from "../../context/DataContext";
import { formatDateTime } from "../../lib/utils";

export default function Settings() {
  const { settings, shifts, deviceSync, webSession, actions } = useData();
  const isAdmin = webSession.role === "Administrator";
  const [syncingId, setSyncingId] = useState(null);

  function handleSync(deviceId) {
    setSyncingId(deviceId);
    // simulate the few seconds it takes to push queued records over Ethernet
    setTimeout(() => {
      actions.syncDevice(deviceId);
      setSyncingId(null);
    }, 1200);
  }

  return (
    <WebLayout crumb="Configuration / Settings" title="Settings" requiredModule="Settings">
      <div className="grid grid-cols-2 gap-4">
        <Card title="Local Server & Sync">
          <Field label="Local Server Address">
            <TextInput
              disabled={!isAdmin}
              value={`${settings.serverAddress} (${settings.serverLabel})`}
              onChange={() => {}}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Sync Method">
              <Select disabled={!isAdmin} value={settings.syncMethod} onChange={(e) => actions.updateSettings({ syncMethod: e.target.value })}>
                <option>Ethernet (Docking Station)</option>
                <option>Local Wi-Fi Network</option>
              </Select>
            </Field>
            <Field label="Auto-sync on Connect">
              <Toggle checked={settings.autoSync} onChange={(v) => isAdmin && actions.updateSettings({ autoSync: v })} />
            </Field>
          </div>

          <div className="mt-2 border-t border-border pt-3.5">
            <div className="mb-2 text-[11.5px] font-bold text-navy">Handheld Devices</div>
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                  <th className="border-b border-border pb-2">Device</th>
                  <th className="border-b border-border pb-2">Last Sync</th>
                  <th className="border-b border-border pb-2">Pending</th>
                  <th className="border-b border-border pb-2">Status</th>
                  <th className="border-b border-border pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {deviceSync.map((d) => (
                  <tr key={d.deviceId}>
                    <td className="border-b border-[#EFF2F5] py-2.5 font-semibold text-ink">{d.deviceId} <span className="text-inkSoft">({d.officerName})</span></td>
                    <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{formatDateTime(d.lastSync)}</td>
                    <td className="num border-b border-[#EFF2F5] py-2.5">{d.pendingCount}</td>
                    <td className="border-b border-[#EFF2F5] py-2.5"><Badge tone={d.status === "Synced" ? "green" : "amber"}>{syncingId === d.deviceId ? "Syncing…" : d.status}</Badge></td>
                    <td className="border-b border-[#EFF2F5] py-2.5">
                      {d.pendingCount > 0 && (
                        <button className="text-[11.5px] font-bold text-accent-dark" disabled={syncingId === d.deviceId} onClick={() => handleSync(d.deviceId)}>
                          Sync Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Shift Definitions">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">Shift</th>
                <th className="border-b border-border pb-2">Time Range</th>
                <th className="border-b border-border pb-2">Rounds / Shift</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{s.name}</td>
                  <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">{s.start} – {s.end}</td>
                  <td className="border-b border-[#EFF2F5] py-2.5">
                    <input
                      type="number"
                      min={0}
                      disabled={!isAdmin}
                      className="num w-16 rounded border border-border px-2 py-1 disabled:bg-status-grayBg"
                      value={s.roundsPerShift}
                      onChange={(e) => actions.updateShift(s.id, { roundsPerShift: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 border-t border-border pt-3.5">
            <div className="mb-2 text-[11.5px] font-bold text-navy">Backup</div>
            <Field label="Backup Schedule">
              <TextInput disabled={!isAdmin} value={settings.backupSchedule} onChange={(e) => actions.updateSettings({ backupSchedule: e.target.value })} />
            </Field>
            <Field label="Backup Destination">
              <Select disabled={!isAdmin} value={settings.backupDestination} onChange={(e) => actions.updateSettings({ backupDestination: e.target.value })}>
                <option>Local Backup Server</option>
                <option>External Storage (USB/NAS)</option>
              </Select>
            </Field>
            {isAdmin && <PillButton tone="accent">Save Settings</PillButton>}
          </div>
        </Card>
      </div>
    </WebLayout>
  );
}
