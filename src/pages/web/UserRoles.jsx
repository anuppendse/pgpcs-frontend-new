import React, { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import WebLayout from "../../components/web/WebLayout";
import {
  Card,
  Select,
  PillButton,
  Toggle,
  Field,
  TextInput,
} from "../../components/web/FormField";
import Modal from "../../components/web/Modal";
import { useData } from "../../context/DataContext";
import { MODULES } from "../../lib/mockData";

const ROLES = ["Administrator", "Security Officer", "Supervisor", "Checking Officer"];

const emptyUserForm = {
  employee_code: "",
  full_name: "",
  role_id: "",
  username: "",
  password: "",
  phone: "",
  email: "",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone is optional, but if the user enters anything it must be
// exactly 10 digits (the <input> itself also strips non-digits and
// caps length as they type - see the onChange handlers below).
function isValidPhone(phone) {
  return phone === "" || /^\d{10}$/.test(phone);
}

function isValidEmail(email) {
  return email === "" || EMAIL_REGEX.test(email);
}

// Display-only formatting of the raw role_name enum value coming back
// from the API (e.g. "CHECKING_OFFICER" -> "Checking Officer"). This
// never affects what gets submitted - role_id is always the source of
// truth - it just makes the dropdown/table readable.
function formatRoleName(name) {
  return String(name || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Normalizes a role name for COMPARISON only (never for display/submit).
// Strips case, whitespace and underscores so "Checking Officer",
// "CHECKING_OFFICER" and "checking_officer" all compare equal - this
// covers both the enum-style role_name coming from the roles API and the
// human-readable role string on webSession/user rows, whichever format
// each one happens to be in.
function normalizeRoleKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "");
}

export default function UserRoles() {
  const { users, webSession, permissions, actions } = useData();

  // isAdmin was doing a strict, case/whitespace-sensitive
  // string comparison. If the backend's role string ever
  // differed even slightly (casing, extra space) - or
  // webSession was momentarily null - isAdmin silently
  // became false, which disabled every permission checkbox
  // for every role. Normalizing this the same way makes it
  // robust regardless of exact casing/whitespace.
  const isAdmin = normalizeRoleKey(webSession?.role) === normalizeRoleKey("Administrator");

  // Supervisor gets the same kind of full-CRUD access as Administrator,
  // but scoped to Checking Officer users only (see canManageRow / 
  // creatableRoles below) - per manager's confirmation.
  const isSupervisor = normalizeRoleKey(webSession?.role) === normalizeRoleKey("Supervisor");

  // Anyone who can manage users at all (open Add User, load the roles
  // list, etc). Admin can manage Supervisor+Officer, Supervisor can only
  // manage Checking Officer - that narrower scope is enforced separately
  // via creatableRoles/canManageRow, not here.
  const canManageUsers = isAdmin || isSupervisor;

  const [role, setRole] = useState("Security Officer");

  // The Users table was always empty because nothing on
  // this page ever fetched users from the backend -
  // actions.loadUsers() already exists in DataContext.jsx
  // and works, it just was never called here.
  useEffect(() => {
    if (webSession?.accessToken) {
      actions.loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken]);

  // =========================================================
  // ROLES (for the Add/Edit User "Role" dropdown)
  // ---------------------------------------------------------
  // Sourced from actions.loadRoles() -> GET /api/v1/roles, so
  // the dropdown always matches whatever roles actually exist
  // in the roles table, instead of the hardcoded ROLES array
  // (which is still used for the separate Role Permissions
  // selector further down, unrelated to this dropdown).
  //
  // GET /api/v1/roles was previously Admin-only on the backend
  // (@role_required(RoleName.ADMIN) in roles.py). Supervisor now also
  // needs this list to create/edit Checking Officer users, so the
  // backend route guard needs to allow Supervisor too (or expose an
  // equivalent endpoint) - this fetch is gated on canManageUsers on the
  // assumption that's been/will be updated backend-side to match.
  const [roles, setRoles] = useState([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  // The role(s) each viewer is allowed to assign when creating/editing a
  // user, via the Add/Edit "Role" dropdowns:
  //  - Administrator can assign Supervisor or Checking Officer, but
  //    never Administrator - that role is reserved and can only exist
  //    via whatever seeded it initially (e.g. DB seed / backend setup),
  //    never through this UI.
  //  - Supervisor can ONLY assign Checking Officer - they cannot create
  //    or promote anyone to Supervisor or Administrator.
  //  - Anyone else gets an empty list (shouldn't reach these dropdowns
  //    at all, since canManageUsers gates the Add button and canManageRow
  //    gates the Edit link).
  const creatableRoles = isAdmin
    ? roles.filter((r) => normalizeRoleKey(r.role_name) !== normalizeRoleKey("Administrator"))
    : isSupervisor
    ? roles.filter((r) => normalizeRoleKey(r.role_name) === normalizeRoleKey("Checking Officer"))
    : [];

  useEffect(() => {
    if (!webSession?.accessToken || !canManageUsers) return;

    let cancelled = false;
    setRolesLoading(true);

    actions
      .loadRoles()
      .then((result) => {
        if (cancelled) return;
        if (result?.ok) {
          setRoles(result.roles || []);
        } else {
          window.alert(result?.error || "Unable to load roles.");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Load roles error:", error);
        window.alert("Unable to connect to Roles API.");
      })
      .finally(() => {
        if (!cancelled) setRolesLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webSession?.accessToken, canManageUsers]);

  // A row-level check: can the CURRENT viewer manage THIS particular
  // user row (open Edit, toggle Active/Inactive)?
  //  - Administrator can manage anyone (including other Administrators,
  //    though their role field stays locked - see editUserIsAdmin below).
  //  - Supervisor can ONLY manage Checking Officer rows.
  function canManageRow(u) {
    if (isAdmin) return true;
    if (isSupervisor) return normalizeRoleKey(u.role) === normalizeRoleKey("Checking Officer");
    return false;
  }

  // =========================================================
  // ADMINISTRATOR = ALWAYS FULL ACCESS
  // ---------------------------------------------------------
  // The backend (see PERMISSION_ROLES in app/core/helper.py)
  // hardcodes "Administrator" into every single permission
  // list, so Administrators already have full view/edit
  // access to every module at the API level regardless of
  // what this table shows. This effect seeds that same truth
  // into the local permissions state ONCE, so the checkboxes
  // load already ticked for Administrator instead of
  // misleadingly showing everything unchecked.
  //
  // The checkboxes are still left editable below (per request)
  // so an admin can interact with them like any other role's
  // row, but note this table is local/UI state only - it does
  // NOT change what helper.py enforces on the backend unless
  // that file is also updated.
  useEffect(() => {
    if (!isAdmin) return;

    MODULES.forEach((m) => {
      const perm = permissions["Administrator"]?.[m];

      if (!perm?.view) {
        actions.updatePermission("Administrator", m, "view", true);
      }

      if (!perm?.edit) {
        actions.updatePermission("Administrator", m, "edit", true);
      }
    });
    // Run once on mount - we only want to seed defaults, not fight
    // the admin's own subsequent edits on every permissions update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // =========================================================
  // ADD USER
  // =========================================================

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyUserForm });
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm({ ...emptyUserForm, role_id: creatableRoles[0]?.role_id ?? "" });
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setForm({ ...emptyUserForm });
  }

  async function handleAddUser(e) {
    e.preventDefault();

    if (
      !form.employee_code.trim() ||
      !form.full_name.trim() ||
      !form.username.trim() ||
      !form.password.trim()
    ) {
      window.alert(
        "Employee code, full name, username and password are required."
      );
      return;
    }

    if (!form.role_id) {
      window.alert("Please select a role.");
      return;
    }

    // Defense-in-depth: even though the dropdown already only offers
    // creatableRoles, never trust the submitted role_id blindly - confirm
    // it's actually one this viewer is allowed to assign.
    const isAllowedRole = creatableRoles.some(
      (r) => String(r.role_id) === String(form.role_id)
    );
    if (!isAllowedRole) {
      window.alert(
        isAdmin
          ? "You are not allowed to create another Administrator."
          : "You can only create Checking Officer accounts."
      );
      return;
    }

    if (form.password.length < 8) {
      window.alert("Password must be at least 8 characters.");
      return;
    }

    const employeeCode = form.employee_code.trim();
    const isDuplicateCode = users.some(
      (u) =>
        (u.employeeCode || u.employee_code || "").trim().toLowerCase() ===
        employeeCode.toLowerCase()
    );
    if (isDuplicateCode) {
      window.alert(
        "This employee code is already in use. Please enter a different one."
      );
      return;
    }

    if (!isValidPhone(form.phone)) {
      window.alert("Phone number must be exactly 10 digits.");
      return;
    }

    if (!isValidEmail(form.email)) {
      window.alert("Please enter a valid email address.");
      return;
    }

    setSaving(true);

    try {
      const result = await actions.createUser({
        employee_code: employeeCode,
        full_name: form.full_name.trim(),
        role_id: Number(form.role_id),
        username: form.username.trim(),
        password: form.password,
        phone: form.phone || null,
        email: form.email || null,
        status: "active",
      });

      if (!result?.ok) {
        window.alert(result?.error || "Unable to create user.");
        return;
      }

      setModalOpen(false);
      setForm({ ...emptyUserForm });
    } catch (error) {
      console.error("Create user error:", error);
      window.alert("Unable to connect to Users API.");
    } finally {
      setSaving(false);
    }
  }

  // =========================================================
  // EDIT USER
  // =========================================================

  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editUserForm, setEditUserForm] = useState({ ...emptyUserForm });
  const [editUserSaving, setEditUserSaving] = useState(false);

  // New password field - Administrator only.
  // Leave blank to keep the existing password.
  const [editNewPassword, setEditNewPassword] = useState("");

  // If the user currently being edited is already an Administrator,
  // their role_id won't exist in `creatableRoles` (Administrator is
  // filtered out there on purpose). Rather than let the Select render
  // with no matching option, we just lock the Role field entirely for
  // existing Administrators - their role can't be changed via this UI.
  const [editUserIsAdmin, setEditUserIsAdmin] = useState(false);

  // Supervisor can only ever edit Checking Officer rows (canManageRow
  // enforces that on the Edit link itself), so their Role field is
  // always locked to Checking Officer too - there's nothing else for
  // them to legitimately pick.
  const editUserRoleLocked = editUserIsAdmin || (isSupervisor && !isAdmin);

  // Supervisor's write access on the backend is scoped to
  // full_name/phone/email only (see allowed_fields in users.py's
  // update_user) - role_id and username are rejected with a 403 even
  // if submitted. Locking Username here too (mirroring the Role field)
  // keeps the UI honest about what will actually be saved, instead of
  // showing an editable field that silently fails to persist.
  const editUserUsernameLocked = isSupervisor && !isAdmin;

  function openEditUser(u) {
    // Safety net: the Edit link is already hidden for rows this viewer
    // can't manage, but don't let a stale click/keyboard action open the
    // modal for a row outside the viewer's allowed scope either.
    if (!canManageRow(u)) return;

    setEditingUserId(u.id);

    const matchedRole = roles.find((r) => r.role_name === u.role);
    const isAdminUser =
      String(matchedRole?.role_name || u.role || "").trim().toUpperCase() ===
      "ADMINISTRATOR";

    setEditUserIsAdmin(isAdminUser);

    setEditUserForm({
      employee_code: u.employeeCode || u.employee_code || "",
      full_name: u.name || "",
      role_id: matchedRole ? matchedRole.role_id : "",
      username: u.username || "",
      password: "",
      phone: u.phone || "",
      email: u.email || "",
    });

    setEditNewPassword("");

    setEditUserModalOpen(true);
  }

  function closeEditUserModal() {
    if (editUserSaving) return;
    setEditUserModalOpen(false);
    setEditingUserId(null);
    setEditUserIsAdmin(false);
    setEditUserForm({ ...emptyUserForm });
    setEditNewPassword("");
  }

  async function handleEditUserSave(e) {
    e.preventDefault();

    if (
      !editUserForm.full_name.trim() ||
      !editUserForm.username.trim()
    ) {
      window.alert("Full name and username are required.");
      return;
    }

    if (!editUserForm.role_id) {
      window.alert("Please select a role.");
      return;
    }

    // Defense-in-depth: even though the dropdown already only offers
    // creatableRoles, never trust the submitted role_id blindly. This
    // does NOT apply when editUserIsAdmin is true - that's an existing
    // Administrator whose role field is locked/unchanged, just being
    // edited for other fields (name, username, contact info, etc).
    if (!editUserIsAdmin) {
      const isAllowedEditRole = creatableRoles.some(
        (r) => String(r.role_id) === String(editUserForm.role_id)
      );
      if (!isAllowedEditRole) {
        window.alert(
          isAdmin
            ? "You are not allowed to assign the Administrator role."
            : "You can only manage Checking Officer accounts."
        );
        return;
      }
    }

    if (!isValidPhone(editUserForm.phone)) {
      window.alert("Phone number must be exactly 10 digits.");
      return;
    }

    if (!isValidEmail(editUserForm.email)) {
      window.alert("Please enter a valid email address.");
      return;
    }

    // Password change is optional. Only the New Password field is used.
    const wantsPasswordChange =
      isAdmin && editNewPassword.trim();

    if (wantsPasswordChange && editNewPassword.length < 8) {
      window.alert("New password must be at least 8 characters.");
      return;
    }

    setEditUserSaving(true);

    try {
      const payload = {
        full_name: editUserForm.full_name.trim(),
        phone: editUserForm.phone || null,
        email: editUserForm.email || null,
      };

      // Supervisor's backend route rejects role_id/username outright
      // (403) even if the values are unchanged, so those two keys must
      // be omitted from the payload entirely for Supervisor - not just
      // left disabled in the UI.
      if (!(isSupervisor && !isAdmin)) {
        payload.role_id = Number(editUserForm.role_id);
        payload.username = editUserForm.username.trim();
      }

      const result = await actions.updateUserApi(editingUserId, payload);

      if (!result?.ok) {
        window.alert(result?.error || "Unable to update user.");
        return;
      }

      if (wantsPasswordChange) {
        const passwordResult = await actions.resetPassword(
          editingUserId,
          "",
          editNewPassword
        );

        if (!passwordResult?.ok) {
          window.alert(
            passwordResult?.error || "Unable to reset password."
          );
          return;
        }

        window.alert(
          `Password updated successfully for ${
            editUserForm.username.trim()
          }.`
        );
      }

      setEditUserModalOpen(false);
      setEditingUserId(null);
      setEditUserForm({ ...emptyUserForm });
        setEditNewPassword("");
    } catch (error) {
      console.error("Update user error:", error);
      window.alert("Unable to connect to Users API.");
    } finally {
      setEditUserSaving(false);
    }
  }

  // =========================================================
  // STATUS TOGGLE (Active / Inactive)
  // =========================================================

  async function handleToggleStatus(u) {
    if (!canManageRow(u)) return;

    const nextStatus = u.status === "Active" ? "inactive" : "active";

    const result = await actions.updateUserApi(u.id, {
      status: nextStatus,
    });

    if (!result?.ok) {
      window.alert(result?.error || "Unable to update user status.");
    }
  }

  return (
    <WebLayout
      crumb="Configuration / Access"
      title="User Roles & Access Control"
      requiredModule="User & Role Management"
      right={
        canManageUsers && (
          <PillButton tone="accent" onClick={openAdd}>
            + Add User
          </PillButton>
        )
      }
    >
      <Card title="Users">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-wide text-inkSoft">
              <th className="border-b border-border pb-2">User</th>
              <th className="border-b border-border pb-2">Role</th>
              <th className="border-b border-border pb-2">Status</th>
              <th className="border-b border-border pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="border-b border-[#EFF2F5] py-2.5 font-bold text-navy">{u.name} <span className="font-normal text-inkSoft">({u.username})</span></td>
                <td className="border-b border-[#EFF2F5] py-2.5">{u.role}</td>
                <td className="border-b border-[#EFF2F5] py-2.5">
                  <div className="flex items-center gap-2">
                    <Toggle
                      checked={u.status === "Active"}
                      disabled={!canManageRow(u)}
                      onChange={() => handleToggleStatus(u)}
                    />
                    <span className="text-[11px] text-inkSoft">
                      {u.status === "Active" ? "Active" : "Inactive"}
                    </span>
                  </div>
                </td>
                <td className="border-b border-[#EFF2F5] py-2.5">
                  {canManageRow(u) && (
                    <button
                      type="button"
                      onClick={() => openEditUser(u)}
                      className="text-[11.5px] font-bold text-accent-dark hover:underline"
                    >
                      Edit
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-[12px] text-inkSoft">
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <Modal open={modalOpen} onClose={closeModal} title="Add User">
        <form onSubmit={handleAddUser}>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Employee Code">
              <TextInput
                required
                value={form.employee_code}
                onChange={(e) =>
                  setForm({ ...form, employee_code: e.target.value })
                }
                placeholder="e.g. EMP-045"
              />
            </Field>

            <Field label="Full Name">
              <TextInput
                required
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
                placeholder="Enter full name"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Role">
              <Select
                required
                disabled={rolesLoading}
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
              >
                <option value="" disabled>
                  {rolesLoading ? "Loading roles…" : "Select role"}
                </option>
                {creatableRoles.map((r) => (
                  <option key={r.role_id} value={r.role_id}>
                    {formatRoleName(r.role_name)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Username">
              <TextInput
                required
                value={form.username}
                onChange={(e) =>
                  setForm({ ...form, username: e.target.value })
                }
                placeholder="Login username"
              />
            </Field>
          </div>

          <Field
            label="Password"
            hint="Must be at least 8 characters"
          >
            <TextInput
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) =>
                setForm({ ...form, password: e.target.value })
              }
              placeholder="Set an initial password"
              autoComplete="new-password"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Phone (optional)" hint="10 digits if provided">
              <TextInput
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={form.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  })
                }
                placeholder="10-digit contact number"
              />
            </Field>

            <Field label="Email (optional)">
              <TextInput
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm({ ...form, email: e.target.value })
                }
                placeholder="name@example.com"
              />
            </Field>
          </div>

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
              {saving ? "Adding..." : "Add User"}
            </PillButton>
          </div>
        </form>
      </Modal>

      <Modal open={editUserModalOpen} onClose={closeEditUserModal} title="Edit User">
        <form onSubmit={handleEditUserSave}>
          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Employee Code">
              <TextInput
                value={editUserForm.employee_code}
                disabled
                placeholder="—"
              />
            </Field>

            <Field label="Full Name">
              <TextInput
                required
                value={editUserForm.full_name}
                onChange={(e) =>
                  setEditUserForm({ ...editUserForm, full_name: e.target.value })
                }
                placeholder="Enter full name"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Field
              label="Role"
              hint={
                editUserIsAdmin
                  ? "Administrator role can't be changed here"
                  : editUserRoleLocked
                  ? "Supervisor can only manage Checking Officer accounts"
                  : undefined
              }
            >
              {editUserRoleLocked ? (
                <TextInput
                  value={editUserIsAdmin ? "Administrator" : "Checking Officer"}
                  disabled
                />
              ) : (
                <Select
                  required
                  disabled={rolesLoading}
                  value={editUserForm.role_id}
                  onChange={(e) =>
                    setEditUserForm({ ...editUserForm, role_id: e.target.value })
                  }
                >
                  <option value="" disabled>
                    {rolesLoading ? "Loading roles…" : "Select role"}
                  </option>
                  {creatableRoles.map((r) => (
                    <option key={r.role_id} value={r.role_id}>
                      {formatRoleName(r.role_name)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label="Username"
              hint={
                editUserUsernameLocked
                  ? "Supervisor cannot change username"
                  : undefined
              }
            >
              <TextInput
                required
                disabled={editUserUsernameLocked}
                value={editUserForm.username}
                onChange={(e) =>
                  setEditUserForm({ ...editUserForm, username: e.target.value })
                }
                placeholder="Login username"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3.5">
            <Field label="Phone (optional)" hint="10 digits if provided">
              <TextInput
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={editUserForm.phone}
                onChange={(e) =>
                  setEditUserForm({
                    ...editUserForm,
                    phone: e.target.value.replace(/\D/g, "").slice(0, 10),
                  })
                }
                placeholder="10-digit contact number"
              />
            </Field>

            <Field label="Email (optional)">
              <TextInput
                type="email"
                value={editUserForm.email}
                onChange={(e) =>
                  setEditUserForm({ ...editUserForm, email: e.target.value })
                }
                placeholder="name@example.com"
              />
            </Field>
          </div>

          {/* Administrator can reset the selected user's password without
              entering the old password. The existing backend reset-password
              endpoint hashes the new password and invalidates old sessions. */}
          {isAdmin && (
            <Field
              label="New Password"
              hint="Leave blank to keep current password • At least 8 characters"
            >
              <TextInput
                type="password"
                minLength={8}
                value={editNewPassword}
                onChange={(e) => setEditNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
            </Field>
          )}

          <div className="flex gap-3">
            <PillButton
              type="button"
              onClick={closeEditUserModal}
              className="w-full justify-center"
              disabled={editUserSaving}
            >
              Cancel
            </PillButton>

            <PillButton
              tone="accent"
              type="submit"
              className="w-full justify-center"
              disabled={editUserSaving}
            >
              {editUserSaving ? "Saving..." : "Save Changes"}
            </PillButton>
          </div>
        </form>
      </Modal>
    </WebLayout>
  );
}