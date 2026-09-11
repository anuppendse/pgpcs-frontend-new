import React, { useEffect, useState } from "react";
import WebLayout from "../../components/web/WebLayout";
import {
  Card,
  PillButton,
  Field,
  TextInput,
  Select,
  Toggle,
} from "../../components/web/FormField";
import Badge from "../../components/web/Badge";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M6.1 6.1C3.6 7.86 1 12 1 12s4 8 11 8a10.4 10.4 0 0 0 5-1.3" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const ROLES = [
  "Checking Officer",
  "Security Officer",
  "Supervisor",
  "Administrator",
];

const SHIFTS = [
  "Morning",
  "Afternoon",
  "Evening",
  "Night",
];

const emptyForm = {
  name: "",
  role: ROLES[0],
  shift: SHIFTS[3],
  contact: "",
  deviceId: "",
  status: "Active",
};

export default function Officers() {
  const { officers, webSession, actions } = useData();

  const canEdit = webSession?.role === "Administrator";

  // Previously, this page never called anything to actually fetch
  // officers - it just read whatever was already in context, which
  // was only populated once at login/full-page-load by a provider-
  // level effect. Switching to this panel via client-side navigation
  // never hit the backend again, so nothing showed up in the server
  // logs until a full refresh remounted the app. This mirrors the
  // same pattern UserRoles.jsx already uses for loadUsers(): fetch
  // fresh data every time this page mounts.
  useEffect(() => {
    if (webSession?.accessToken) {
      actions.loadOfficers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // =========================================================
  // NORMALIZE OFFICER DATA
  // =========================================================

  const normalizedOfficers = (officers || []).map((o) => {
    const rawStatus = String(
      o.status || o.user_status || ""
    ).toUpperCase();

    const roleName =
      o.role_name ||
      o.role?.role_name ||
      o.role?.name ||
      o.role ||
      "Checking Officer";

    const shiftName =
      o.shift_name ||
      o.shift?.shift_name ||
      o.shift?.name ||
      o.shift ||
      "";

    const deviceCode =
      o.device_code ||
      o.device?.device_code ||
      o.deviceId ||
      "";

    return {
      ...o,

      // Internal database ID
      id:
        o.id ??
        o.user_id ??
        o.userId,

      // Officer ID shown in UI
      officerCode:
        o.employee_code ||
        o.employee_id ||
        o.officer_id ||
        o.officerCode ||
        o.id ||
        o.user_id ||
        "—",

      // Name
      name:
        o.name ||
        o.full_name ||
        o.fullName ||
        "—",

      // Role
      role: roleName,

      // Shift
      shift: shiftName || "—",

      // Contact
      contact:
        o.contact ||
        o.phone ||
        o.mobile ||
        "",

      // Device
      deviceId: deviceCode,

      // Frontend status
      status:
        rawStatus === "ACTIVE"
          ? "Active"
          : rawStatus === "INACTIVE"
          ? "Inactive"
          : o.status || "Inactive",
    };
  });

  // =========================================================
  // ADD / EDIT OFFICER
  // =========================================================

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    ...emptyForm,
  });

  const [statusLoading, setStatusLoading] = useState(false);

  // =========================================================
  // RESET PASSWORD
  // =========================================================

  const [passwordModalOpen, setPasswordModalOpen] =
    useState(false);

  const [selectedOfficer, setSelectedOfficer] =
    useState(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] =
    useState("");

  const [passwordLoading, setPasswordLoading] =
    useState(false);

  const [showOldPassword, setShowOldPassword] =
    useState(false);
  const [showNewPassword, setShowNewPassword] =
    useState(false);

  // =========================================================
  // ADD OFFICER
  // =========================================================

  function openAdd() {
    setEditingId(null);
    setForm({
      ...emptyForm,
    });
    setModalOpen(true);
  }

  // =========================================================
  // EDIT OFFICER
  // =========================================================

  function openEdit(o) {
    setEditingId(o.id);

    setForm({
      name: o.name || "",
      role: o.role || ROLES[0],
      shift: o.shift || SHIFTS[3],
      contact: o.contact || "",
      deviceId: o.deviceId || "",
      status: o.status || "Active",
    });

    setModalOpen(true);
  }

  // =========================================================
  // CLOSE ADD / EDIT MODAL
  // =========================================================

  function closeOfficerModal() {
    if (statusLoading) {
      return;
    }

    setModalOpen(false);
    setEditingId(null);

    setForm({
      ...emptyForm,
    });
  }

  // =========================================================
  // SAVE OFFICER
  // =========================================================

  async function handleSave(e) {
    e.preventDefault();

    if (!form.name.trim()) {
      window.alert("Full name is required.");
      return;
    }

    try {
      if (editingId !== null) {
        await actions.updateOfficer(editingId, {
          name: form.name,
          role: form.role,
          shift: form.shift,
          contact: form.contact,
          deviceId: form.deviceId,
          status: form.status,
        });
      } else {
        await actions.addOfficer({
          name: form.name,
          role: form.role,
          shift: form.shift,
          contact: form.contact,
          deviceId: form.deviceId,
          status: "Active",
        });
      }

      setModalOpen(false);
      setEditingId(null);

      setForm({
        ...emptyForm,
      });
    } catch (error) {
      console.error(
        "Failed to save officer:",
        error
      );

      window.alert(
        error?.message ||
          "Failed to save officer. Please try again."
      );
    }
  }

  // =========================================================
  // TOGGLE OFFICER STATUS (Active <-> Inactive)
  // IMPORTANT:
  // This DOES NOT DELETE the officer.
  // It only flips status between Active and Inactive,
  // same as the old Remove / Activate Officer buttons did,
  // now driven from a single clickable toggle in the table.
  // =========================================================

  async function handleToggleOfficerStatus(o) {
    const nextStatus =
      o.status === "Active" ? "Inactive" : "Active";

    const confirmMessage =
      nextStatus === "Inactive"
        ? `Mark ${o.name} as inactive? The officer will NOT be deleted.`
        : `Mark ${o.name} as active again?`;

    const confirmed = window.confirm(confirmMessage);

    if (!confirmed) {
      return;
    }

    try {
      await actions.updateOfficer(o.id, {
        name: o.name || "",
        role: o.role || ROLES[0],
        shift: o.shift || SHIFTS[3],
        contact: o.contact || "",
        deviceId: o.deviceId || "",
        status: nextStatus,
      });
    } catch (error) {
      console.error(
        "Failed to update officer status:",
        error
      );

      window.alert(
        error?.message ||
          "Failed to update officer status. Please try again."
      );
    }
  }

  // =========================================================
  // RESET PASSWORD
  // =========================================================

  function openResetPassword(o) {
    setSelectedOfficer(o);

    setOldPassword("");
    setNewPassword("");

    setPasswordError("");
    setPasswordSuccess("");
    setPasswordLoading(false);

    setShowOldPassword(false);
    setShowNewPassword(false);

    setPasswordModalOpen(true);
  }

  // =========================================================
  // CLOSE RESET PASSWORD
  // =========================================================

  function closeResetPassword() {
    if (passwordLoading) {
      return;
    }

    setPasswordModalOpen(false);

    setSelectedOfficer(null);

    setOldPassword("");
    setNewPassword("");

    setPasswordError("");
    setPasswordSuccess("");

    setPasswordLoading(false);

    setShowOldPassword(false);
    setShowNewPassword(false);
  }

  // =========================================================
  // RESET PASSWORD SAVE
  // =========================================================

  async function handlePasswordSave(e) {
    e.preventDefault();

    setPasswordError("");
    setPasswordSuccess("");

    if (!selectedOfficer) {
      setPasswordError("No officer selected.");
      return;
    }

    if (!oldPassword.trim()) {
      setPasswordError(
        "Please enter the old password."
      );
      return;
    }

    if (!newPassword.trim()) {
      setPasswordError(
        "Please enter the new password."
      );
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError(
        "New password must be at least 8 characters."
      );
      return;
    }

    if (oldPassword === newPassword) {
      setPasswordError(
        "New password must be different from old password."
      );
      return;
    }

    if (!actions.resetPassword) {
      setPasswordError(
        "Reset password action is not available in DataContext."
      );
      return;
    }

    setPasswordLoading(true);

    try {
      const result = await actions.resetPassword(
        selectedOfficer.id,
        oldPassword,
        newPassword
      );

      setPasswordSuccess(
        result?.message ||
          "Password reset successfully."
      );

      setOldPassword("");
      setNewPassword("");

      setTimeout(() => {
        setPasswordModalOpen(false);
        setSelectedOfficer(null);

        setPasswordError("");
        setPasswordSuccess("");
      }, 1200);
    } catch (error) {
      console.error(
        "Password reset failed:",
        error
      );

      setPasswordError(
        error?.message ||
          "Failed to reset password. Please try again."
      );
    } finally {
      setPasswordLoading(false);
    }
  }

  // =========================================================
  // COUNTS
  // =========================================================

  const totalOfficers =
    normalizedOfficers.length;

  const activeOfficers =
    normalizedOfficers.filter(
      (o) => o.status === "Active"
    ).length;

  // =========================================================
  // UI
  // =========================================================

  return (
    <WebLayout
      crumb="Configuration / Officers"
      title="Officer / Guard Management"
      requiredModule="Officer Management"
      right={
        canEdit && (
          <PillButton
            tone="accent"
            onClick={openAdd}
          >
            + Add Officer
          </PillButton>
        )
      }
    >
      {/* =====================================================
          OFFICERS TABLE
      ====================================================== */}

      <Card
        title="All Officers"
        subtitle={`${totalOfficers} total · ${activeOfficers} active`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
                <th className="border-b border-border pb-2">
                  Officer ID
                </th>

                <th className="border-b border-border pb-2">
                  Name
                </th>

                <th className="border-b border-border pb-2">
                  Role
                </th>

                <th className="border-b border-border pb-2">
                  Shift
                </th>

                <th className="border-b border-border pb-2">
                  Contact
                </th>

                <th className="border-b border-border pb-2">
                  Status
                </th>

                <th className="border-b border-border pb-2">
                  Device
                </th>

                <th className="border-b border-border pb-2">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {normalizedOfficers.map((o) => {
                const isActive =
                  o.status === "Active";

                return (
                  <tr key={o.id}>
                    {/* OFFICER ID */}

                    <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">
                      {o.officerCode}
                    </td>

                    {/* NAME */}

                    <td className="border-b border-[#EFF2F5] py-2.5">
                      {o.name}
                    </td>

                    {/* ROLE */}

                    <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                      {o.role}
                    </td>

                    {/* SHIFT */}

                    <td className="border-b border-[#EFF2F5] py-2.5">
                      {o.shift}
                    </td>

                    {/* CONTACT */}

                    <td className="num border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                      {o.contact || "—"}
                    </td>

                    {/* STATUS - clickable toggle, green = Active, grey = Inactive */}

                    <td className="border-b border-[#EFF2F5] py-2.5">
                      <Toggle
                        checked={isActive}
                        disabled={!canEdit}
                        onChange={() =>
                          handleToggleOfficerStatus(o)
                        }
                      />
                    </td>

                    {/* DEVICE */}

                    <td className="border-b border-[#EFF2F5] py-2.5 text-inkSoft">
                      {o.deviceId || "—"}
                    </td>

                    {/* ACTIONS */}

                    <td className="border-b border-[#EFF2F5] py-2.5">
                      {canEdit && (
                        <div className="flex gap-3 whitespace-nowrap text-[11.5px] font-bold">
                          {/* EDIT */}

                          <button
                            type="button"
                            onClick={() =>
                              openEdit(o)
                            }
                            className="text-accent-dark hover:underline"
                          >
                            Edit
                          </button>

                          {/* RESET PASSWORD */}

                          <button
                            type="button"
                            onClick={() =>
                              openResetPassword(o)
                            }
                            className="text-accent-dark hover:underline"
                          >
                            Reset Password
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {normalizedOfficers.length ===
                0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="py-8 text-center text-inkSoft"
                  >
                    No officers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* =====================================================
          ADD / EDIT OFFICER MODAL
      ====================================================== */}

      <Modal
        open={modalOpen}
        onClose={closeOfficerModal}
        title={
          editingId !== null
            ? "Edit Officer"
            : "Add Officer"
        }
      >
        <form onSubmit={handleSave}>
          {/* NAME + ROLE */}

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Full Name">
              <TextInput
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                  })
                }
                placeholder="Enter full name"
              />
            </Field>

            <Field label="Role">
              <Select
                value={form.role}
                onChange={(e) =>
                  setForm({
                    ...form,
                    role: e.target.value,
                  })
                }
              >
                {ROLES.map((r) => (
                  <option
                    key={r}
                    value={r}
                  >
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* SHIFT + CONTACT */}

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Shift Assignment">
              <Select
                value={form.shift}
                onChange={(e) =>
                  setForm({
                    ...form,
                    shift: e.target.value,
                  })
                }
              >
                {SHIFTS.map((s) => (
                  <option
                    key={s}
                    value={s}
                  >
                    {s}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Contact Number">
              <TextInput
                value={form.contact}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contact: e.target.value,
                  })
                }
                placeholder="Enter contact number"
              />
            </Field>
          </div>

          {/* DEVICE */}

          <Field
            label="Assigned Handheld Device"
            hint="Leave blank for non-field roles"
          >
            <TextInput
              value={form.deviceId}
              onChange={(e) =>
                setForm({
                  ...form,
                  deviceId: e.target.value,
                })
              }
              placeholder="e.g. HH-DEV-09"
            />
          </Field>

          {/* STATUS - EDIT ONLY */}

          {editingId !== null && (
            <div className="mb-4 rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-inkSoft">
                    Officer Status
                  </div>

                  <div className="mt-1 flex items-center gap-2">
                    <Badge
                      tone={
                        form.status ===
                        "Active"
                          ? "green"
                          : "amber"
                      }
                    >
                      {form.status ===
                      "Active"
                        ? "Active"
                        : "Inactive"}
                    </Badge>
                  </div>
                </div>
              </div>

              {form.status !==
                "Active" && (
                <p className="mt-2 text-[10.5px] text-inkSoft">
                  This officer is inactive.
                  Click "Activate Officer"
                  to make the officer active
                  again.
                </p>
              )}
            </div>
          )}

          {/* BUTTONS */}

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeOfficerModal}
              className="w-full justify-center"
              disabled={statusLoading}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={statusLoading}
            >
              {editingId !== null
                ? "Save Changes"
                : "Add Officer"}
            </PillButton>
          </div>
        </form>
      </Modal>

      {/* =====================================================
          RESET PASSWORD MODAL
      ====================================================== */}

      <Modal
        open={passwordModalOpen}
        onClose={closeResetPassword}
        title="Reset Password"
      >
        <form onSubmit={handlePasswordSave}>
          {/* SELECTED OFFICER */}

          {selectedOfficer && (
            <div className="mb-4 rounded-lg bg-[#F5F7FA] px-3.5 py-3 text-[12px]">
              <div className="font-bold text-navy">
                {selectedOfficer.name}
              </div>

              <div className="mt-1 text-inkSoft">
                Officer ID:{" "}
                {selectedOfficer.officerCode}
              </div>

              <div className="mt-1">
                <Badge
                  tone={
                    selectedOfficer.status ===
                    "Active"
                      ? "green"
                      : "amber"
                  }
                >
                  {selectedOfficer.status}
                </Badge>
              </div>
            </div>
          )}

          {/* OLD PASSWORD */}

          <Field
            label="Old Password"
            hint="Enter the current password"
          >
            <div className="relative">
              <TextInput
                type={
                  showOldPassword
                    ? "text"
                    : "password"
                }
                required
                value={oldPassword}
                onChange={(e) =>
                  setOldPassword(
                    e.target.value
                  )
                }
                placeholder="Enter old password"
                disabled={passwordLoading}
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() =>
                  setShowOldPassword(
                    (prev) => !prev
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-inkSoft hover:text-navy"
                tabIndex={-1}
                aria-label={
                  showOldPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showOldPassword ? (
                  <EyeOffIcon />
                ) : (
                  <EyeIcon />
                )}
              </button>
            </div>
          </Field>

          {/* NEW PASSWORD */}

          <Field
            label="New Password"
            hint="Password must be at least 8 characters"
          >
            <div className="relative">
              <TextInput
                type={
                  showNewPassword
                    ? "text"
                    : "password"
                }
                required
                minLength={8}
                value={newPassword}
                onChange={(e) =>
                  setNewPassword(
                    e.target.value
                  )
                }
                placeholder="Enter new password"
                disabled={passwordLoading}
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() =>
                  setShowNewPassword(
                    (prev) => !prev
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-inkSoft hover:text-navy"
                tabIndex={-1}
                aria-label={
                  showNewPassword
                    ? "Hide password"
                    : "Show password"
                }
              >
                {showNewPassword ? (
                  <EyeOffIcon />
                ) : (
                  <EyeIcon />
                )}
              </button>
            </div>
          </Field>

          {/* ERROR */}

          {passwordError && (
            <div className="mb-3 rounded-lg bg-[#FDECEC] px-3.5 py-2.5 text-[12px] font-semibold text-status-red">
              {passwordError}
            </div>
          )}

          {/* SUCCESS */}

          {passwordSuccess && (
            <div className="mb-3 rounded-lg bg-[#E8F7EF] px-3.5 py-2.5 text-[12px] font-semibold text-[#198754]">
              {passwordSuccess}
            </div>
          )}

          {/* BUTTONS */}

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeResetPassword}
              className="w-full justify-center"
              disabled={passwordLoading}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={passwordLoading}
            >
              {passwordLoading
                ? "Resetting..."
                : "Reset Password"}
            </PillButton>
          </div>
        </form>
      </Modal>
    </WebLayout>
  );
}