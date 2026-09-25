import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";

import {
  generateId,
  nextSequentialId,
  nowISO,
  classifyScan,
  minutesBetween,
} from "../lib/utils";

/* =========================================================
   ROLE NAME MAPPING
   -------------------------------------------------------
   The backend's User.to_dict() / JWT "role" claim send the raw
   RoleName enum value ("ADMIN", "SUPERVISOR", "CHECKING_OFFICER"),
   but the rest of this app (WebLayout's canView check, UserRoles'
   isAdmin check, the `permissions` object's keys, the ROLES array)
   all use Title-Case display names ("Administrator", "Supervisor",
   "Checking Officer"). Normalize once, here, at the point session
   role gets set, instead of patching every comparison site.
========================================================= */

const BACKEND_ROLE_TO_DISPLAY_NAME = {
  ADMIN: "Administrator",
  SUPERVISOR: "Supervisor",
  CHECKING_OFFICER: "Checking Officer",
};

function toDisplayRoleName(rawRole) {
  if (!rawRole) return rawRole;
  const key = String(rawRole).trim().toUpperCase();
  return BACKEND_ROLE_TO_DISPLAY_NAME[key] || rawRole;
}

/* =========================================================
   API CONFIG
========================================================= */

const API_BASE_URL = "http://127.0.0.1:8001/api";
const STORAGE_KEY = "perimeterguard.auth.v1";

/*
 * Database role IDs confirmed for this project:
 * 1 = Administrator
 * 2 = Supervisor
 * 3 = Checking Officer
 * 8 = Security Officer
 */
const OFFICER_ROLE_IDS = [2, 3, 8];

const OFFICER_ROLE_NAME_TO_ID = {
  Supervisor: 2,
  "Checking Officer": 3,
  "Security Officer": 8,
  Administrator: 1,
};

/*
 * The current database contains one site:
 * site_id = 1, Test Site.
 * Guard-post creation requires site_id.
 */
const DEFAULT_SITE_ID = 1;

/* =========================================================
   INITIAL STATE
========================================================= */

function buildInitialState() {
  return {
    webSession: null,
    fieldSession: null,

    // Database-backed collections start empty.
    // They are populated from the backend APIs.
    posts: [],
    officers: [],
    rounds: [],
    alerts: [],
    users: [],
    permissions: {},
    shifts: [],
    shiftAssignments: [],
    routes: [],
    routePosts: [],
    roundSchedules: [],
    roundInstances: [],
    deviceSync: [],
    settings: {},
    sessions: [],

    qrCodes: [],
  };
}

/* =========================================================
   FULL-STATE PERSISTENCE HELPERS
   -------------------------------------------------------
   Everything in `state` (webSession, fieldSession, posts,
   officers, rounds, alerts, users, permissions, shifts,
   deviceSync, settings, sessions, qrCodes) is saved to
   localStorage every time it changes, and restored on
   load. Without this, buildInitialState() always starts
   from empty/null values, so a refresh wiped out anything
   you'd added (guard posts, officers, rounds, alerts,
   etc.) and also logged you out. Posts/QR codes are still
   re-fetched from the backend afterwards (see the existing
   loadGuardPosts / loadQRCodes effects below), so the
   backend stays the source of truth for those - this just
   stops the blank/empty flash and data loss in the
   meantime, and is the only thing keeping the rest
   (officers, rounds, alerts, users, permissions, shifts,
   settings, sessions) around at all, since those have no
   backend GET-on-load call in this file.
========================================================= */

function readStoredState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return null;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(
      "Unable to read saved app state:",
      error
    );
    return null;
  }
}

function writeStoredState(state) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );
  } catch (error) {
    // Most likely a quota-exceeded error (e.g. large photo
    // data URIs stored on scans). Data still works for the
    // current session, it just won't survive a refresh.
    console.error(
      "Unable to save app state (localStorage quota?):",
      error
    );
  }
}

/* =========================================================
   LOAD SAVED STATE
========================================================= */

function loadInitialState() {
  const base = buildInitialState();

  const saved = readStoredState();

  if (!saved) {
    return base;
  }

  return {
    ...base,
    ...saved,
  };
}

/* =========================================================
   API RESPONSE HELPER
========================================================= */

async function parseResponse(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
    };
  }
}

/* =========================================================
   QR STATUS HELPER
========================================================= */

function normalizeQRPrintStatus(qr) {
  const status = String(
    qr?.status ||
      qr?.print_status ||
      qr?.qr_print_status ||
      ""
  )
    .trim()
    .toLowerCase();

  if (
    status === "printed" ||
    status === "print" ||
    status === "done" ||
    status === "completed"
  ) {
    return "Printed";
  }

  return "Not Printed";
}

// A regenerated QR code is a brand-new backend row (new qr_id) for the
// same post_id. Matching print status by post_id alone would carry a
// previous code's "Printed" flag onto the new one, which has never
// actually been printed. Only carry it forward when it's genuinely
// the same QR code.
function isSameQrCode(existingQR, qr) {
  if (!existingQR || !qr) {
    return false;
  }

  const existingIdentity = existingQR.qr_id ?? existingQR.qr_uuid;
  const newIdentity = qr.qr_id ?? qr.qr_uuid;

  return (
    existingIdentity !== undefined &&
    existingIdentity !== null &&
    existingIdentity === newIdentity
  );
}

// Shift.to_dict() sends start_time/end_time as "HH:MM:SS" (Python's
// time.isoformat() always includes seconds). Truncate to "HH:MM" so
// <input type="time"> values stay clean throughout the app - the
// backend's parse_time() now accepts both forms too, but there's no
// reason for seconds to round-trip through the UI at all.
function toHHMM(value) {
  return typeof value === "string" ? value.slice(0, 5) : value;
}

/* =========================================================
   BACKEND POST ID HELPER
========================================================= */

function getBackendPostId(post) {
  if (!post) {
    return null;
  }

  if (post.backendId !== undefined && post.backendId !== null) {
    return Number(post.backendId);
  }

  const numericId = Number(
    String(post.id || "").replace("PST-", "")
  );

  return Number.isNaN(numericId) ? null : numericId;
}

/* =========================================================
   BACKEND USER -> FRONTEND SHAPE HELPER
   -------------------------------------------------------
   Same normalization used by loadUsers()/createUser()
   inside the actions below, pulled out to module scope so
   it can also be used by the officers-loading effect
   further down (officers are User rows under the hood -
   see /api/v1/users in user.py - there is no separate
   officers table/endpoint).
========================================================= */

function mapBackendUserToOfficerShape(user = {}) {
  const normalizedStatus =
    user.status
      ? String(user.status)
          .toLowerCase()
          .replace(/^./, (char) => char.toUpperCase())
      : "Active";

  const roleValue =
    user.role_name ??
    user.roleName ??
    (typeof user.role === "object"
      ? user.role?.name ?? user.role?.role_name
      : user.role) ??
    "";

  const shiftValue =
    user.shift ??
    user.shift_name ??
    user.shiftName ??
    user.assigned_shift ??
    (typeof user.shift === "object"
      ? user.shift?.name ?? user.shift?.shift_name
      : "") ??
    "";

  const deviceValue =
    user.device_id ??
    user.deviceId ??
    user.assigned_device_id ??
    (typeof user.device === "object"
      ? user.device?.device_id ??
        user.device?.id ??
        user.device?.name
      : "") ??
    "";

  const phoneValue =
    user.phone ??
    user.contact ??
    user.contact_number ??
    "";

  return {
    ...user,

    id:
      user.user_id ??
      user.id ??
      user.user_uuid,

    user_id:
      user.user_id ??
      user.id ??
      user.user_uuid,

    employeeCode:
      user.employee_code ??
      user.employeeCode ??
      "",

    employee_code:
      user.employee_code ??
      user.employeeCode ??
      "",

    officerNumber:
      user.officer_number ??
      user.officerNumber ??
      null,

    officer_number:
      user.officer_number ??
      user.officerNumber ??
      null,

    name:
      user.full_name ??
      user.name ??
      "",

    full_name:
      user.full_name ??
      user.name ??
      "",

    username:
      user.username ??
      "",

    roleId:
      user.role_id ??
      user.roleId ??
      (typeof user.role === "object"
        ? user.role?.id ?? user.role?.role_id
        : null),

    role_id:
      user.role_id ??
      user.roleId ??
      (typeof user.role === "object"
        ? user.role?.id ?? user.role?.role_id
        : null),

    role: roleValue,

    role_name: roleValue,

    shift: shiftValue,

    shift_name: shiftValue,

    phone: phoneValue,

    contact: phoneValue,

    email:
      user.email ??
      "",

    deviceId: deviceValue,

    device_id: deviceValue,

    status: normalizedStatus,

    rawStatus:
      user.status ??
      null,

    deletedAt:
      user.deleted_at ??
      null,

    deleted_at:
      user.deleted_at ??
      null,
  };
}

/* =========================================================
   REDUCER
========================================================= */

function reducer(state, action) {
  switch (action.type) {
    /* =====================================================
       RESET
    ===================================================== */

    case "RESET_DEMO":
      return buildInitialState();

    /* =====================================================
       AUTH
    ===================================================== */

    case "WEB_LOGIN":
      return {
        ...state,
        webSession: action.payload,
      };

    case "WEB_LOGOUT":
      return {
        ...state,
        webSession: null,
      };

    case "FIELD_LOGIN":
      return {
        ...state,
        fieldSession: action.payload,
      };

    case "FIELD_LOGOUT":
      return {
        ...state,
        fieldSession: null,
      };

    /* =====================================================
       GUARD POSTS
    ===================================================== */

    case "SET_POSTS":
      return {
        ...state,
        posts: Array.isArray(action.payload)
          ? action.payload
          : [],
      };

    case "ADD_POST":
      return {
        ...state,
        posts: [...state.posts, action.payload],
      };

    case "UPDATE_POST":
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.payload.id
            ? {
                ...post,
                ...action.payload.data,
              }
            : post
        ),
      };

    case "DELETE_POST":
      return {
        ...state,
        posts: state.posts.filter(
          (post) => post.id !== action.payload.id
        ),
      };

    case "TOGGLE_POST_ACTIVE":
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.payload.id
            ? {
                ...post,
                active: !post.active,
              }
            : post
        ),
      };

    /* =====================================================
       QR CODES
    ===================================================== */

    case "SET_QR_CODES":
      return {
        ...state,
        qrCodes: action.payload || [],
      };

    case "GENERATE_QR": {
      const qr = action.payload?.qr;

      if (!qr) {
        return state;
      }

      const postId = action.payload?.post_id;
      const frontendPostId = action.payload?.id;

      const existingPost = state.posts.find(
        (post) => post.id === frontendPostId
      );

      const existingQR = state.qrCodes.find(
        (item) =>
          Number(item.post_id) === Number(postId)
      );

      const backendStatus = normalizeQRPrintStatus(qr);

      const locallyPrinted =
        isSameQrCode(existingQR, qr) &&
        (existingPost?.qrPrintStatus === "Printed" ||
          existingQR?.status === "printed");

      const finalPrintStatus =
        backendStatus === "Printed" || locallyPrinted
          ? "Printed"
          : "Not Printed";

      const updatedQR = {
        ...qr,

        status:
          finalPrintStatus === "Printed"
            ? "printed"
            : qr.status || "not_printed",

        printed_at:
          qr.printed_at ||
          existingQR?.printed_at ||
          null,

        printed_by:
          qr.printed_by ||
          existingQR?.printed_by ||
          null,
      };

      return {
        ...state,

        qrCodes: [
          ...state.qrCodes.filter(
            (item) =>
              Number(item.post_id) !== Number(postId)
          ),
          updatedQR,
        ],

        posts: state.posts.map((post) =>
          post.id === frontendPostId
            ? {
                ...post,

                qrGenerated: true,

                qrCodeId:
                  qr.qr_value ||
                  qr.qr_uuid ||
                  qr.qr_id ||
                  null,

                qrValue: qr.qr_value || null,

                qrUuid: qr.qr_uuid || null,

                qrBackendId: qr.qr_id || null,

                qrPrintStatus: finalPrintStatus,

                qrGeneratedAt:
                  qr.created_at ||
                  post.qrGeneratedAt ||
                  nowISO(),
              }
            : post
        ),
      };
    }

    case "SET_PRINT_STATUS":
      return {
        ...state,

        qrCodes: state.qrCodes.map((qr) =>
          Number(qr.post_id) ===
          Number(action.payload.post_id)
            ? {
                ...qr,

                printed_by:
                  action.payload.printed_by ||
                  qr.printed_by ||
                  null,

                status:
                  action.payload.status === "Printed"
                    ? "printed"
                    : qr.status,

                printed_at:
                  action.payload.status === "Printed"
                    ? action.payload.printed_at ||
                      nowISO()
                    : qr.printed_at || null,
              }
            : qr
        ),

        posts: state.posts.map((post) =>
          post.id === action.payload.id
            ? {
                ...post,

                qrPrintStatus:
                  action.payload.status === "Printed"
                    ? "Printed"
                    : post.qrPrintStatus === "Printed"
                    ? "Printed"
                    : action.payload.status,
              }
            : post
        ),
      };

    /* =====================================================
       OFFICERS
    ===================================================== */

    case "SET_OFFICERS":
      return {
        ...state,
        officers: Array.isArray(action.payload)
          ? action.payload
          : [],
      };

    case "ADD_OFFICER":
      return {
        ...state,
        officers: [
          ...state.officers,
          action.payload,
        ],
      };

    case "UPDATE_OFFICER":
      return {
        ...state,
        officers: state.officers.map((officer) =>
          officer.id === action.payload.id
            ? {
                ...officer,
                ...action.payload.data,
              }
            : officer
        ),
      };

    case "DELETE_OFFICER":
      return {
        ...state,
        officers: state.officers.filter(
          (officer) =>
            officer.id !== action.payload.id
        ),
      };

    /* =====================================================
       ROUNDS
    ===================================================== */

    case "ADD_ROUND":
      return {
        ...state,
        rounds: [
          ...state.rounds,
          action.payload,
        ],
      };

    case "UPDATE_ROUND":
      return {
        ...state,
        rounds: state.rounds.map((round) =>
          round.id === action.payload.id
            ? {
                ...round,
                ...action.payload.data,
              }
            : round
        ),
      };

    case "DELETE_ROUND":
      return {
        ...state,
        rounds: state.rounds.filter(
          (round) =>
            round.id !== action.payload.id
        ),
      };

    case "MOVE_ROUND_POST": {
      const {
        roundId,
        fromIndex,
        toIndex,
      } = action.payload;

      return {
        ...state,

        rounds: state.rounds.map((round) => {
          if (round.id !== roundId) {
            return round;
          }

          const ids = [
            ...(round.routePostIds || []),
          ];

          if (
            fromIndex < 0 ||
            fromIndex >= ids.length ||
            toIndex < 0 ||
            toIndex >= ids.length
          ) {
            return round;
          }

          const [moved] = ids.splice(
            fromIndex,
            1
          );

          ids.splice(
            toIndex,
            0,
            moved
          );

          return {
            ...round,
            routePostIds: ids,
          };
        }),
      };
    }

    /* =====================================================
       ROUND SESSIONS
    ===================================================== */

    case "START_SESSION":
      return {
        ...state,
        sessions: [
          ...state.sessions,
          action.payload,
        ],
      };

    case "RECORD_SCAN": {
      const {
        sessionId,
        scan,
        alert,
      } = action.payload;

      return {
        ...state,

        sessions: state.sessions.map(
          (session) =>
            session.id === sessionId
              ? {
                  ...session,

                  scans: [
                    ...(session.scans || []),
                    scan,
                  ],

                  currentIndex:
                    session.currentIndex + 1,
                }
              : session
        ),

        alerts: alert
          ? [
              alert,
              ...state.alerts,
            ]
          : state.alerts,

        posts: scan
          ? state.posts.map((post) =>
              post.id === scan.postId
                ? {
                    ...post,
                    lastScanned:
                      scan.actualTime,
                  }
                : post
            )
          : state.posts,
      };
    }

    case "COMPLETE_SESSION": {
      const {
        sessionId,
        missedScans,
        missedAlerts,
      } = action.payload;

      return {
        ...state,

        sessions: state.sessions.map(
          (session) =>
            session.id === sessionId
              ? {
                  ...session,

                  scans: [
                    ...(session.scans || []),
                    ...(missedScans || []),
                  ],

                  status: "completed",

                  endedAt: nowISO(),
                }
              : session
        ),

        alerts: [
          ...(missedAlerts || []),
          ...state.alerts,
        ],
      };
    }

    /* =====================================================
       ALERTS
    ===================================================== */

    case "ADD_ALERT":
      return {
        ...state,
        alerts: [
          action.payload,
          ...state.alerts,
        ],
      };

    case "ACK_ALERT":
      return {
        ...state,

        alerts: state.alerts.map((alert) =>
          alert.id === action.payload.id &&
          alert.status === "open"
            ? {
                ...alert,
                status: "acknowledged",
              }
            : alert
        ),
      };

    case "RESOLVE_ALERT":
      return {
        ...state,

        alerts: state.alerts.map((alert) =>
          alert.id === action.payload.id
            ? {
                ...alert,
                status: "resolved",
              }
            : alert
        ),
      };

    /* =====================================================
       USERS
    ===================================================== */

    case "SET_USERS":
      return {
        ...state,
        users: action.payload || [],
      };

    case "ADD_USER":
      return {
        ...state,
        users: [
          ...state.users,
          action.payload,
        ],
      };

    case "UPDATE_USER":
      return {
        ...state,

        users: state.users.map((user) =>
          user.id === action.payload.id
            ? {
                ...user,
                ...action.payload.data,
              }
            : user
        ),
      };

    case "DELETE_USER":
      return {
        ...state,

        users: state.users.filter(
          (user) =>
            user.id !== action.payload.id
        ),
      };

    /* =====================================================
       PERMISSIONS
    ===================================================== */

    case "UPDATE_PERMISSION": {
      const {
        role,
        module,
        field,
        value,
      } = action.payload;

      return {
        ...state,

        permissions: {
          ...state.permissions,

          [role]: {
            ...(state.permissions[role] || {}),

            [module]: {
              ...(state.permissions[role]?.[
                module
              ] || {}),

              [field]: value,
            },
          },
        },
      };
    }

    /* =====================================================
       SHIFTS
    ===================================================== */

    case "SET_SHIFTS":
      return {
        ...state,
        shifts: action.payload,
      };

    case "ADD_SHIFT":
      return {
        ...state,
        shifts: [...state.shifts, action.payload],
      };

    case "UPDATE_SHIFT":
      return {
        ...state,

        shifts: state.shifts.map((shift) =>
          shift.id === action.payload.id
            ? {
                ...shift,
                ...action.payload.data,
              }
            : shift
        ),
      };

    case "DELETE_SHIFT":
      return {
        ...state,
        shifts: state.shifts.filter(
          (shift) => shift.id !== action.payload.id
        ),
      };

    /* =====================================================
       SHIFT ASSIGNMENTS
    ===================================================== */

    case "SET_SHIFT_ASSIGNMENTS":
      return {
        ...state,
        shiftAssignments: action.payload,
      };

    case "ADD_SHIFT_ASSIGNMENT":
      return {
        ...state,
        shiftAssignments: [...state.shiftAssignments, action.payload],
      };

    case "DELETE_SHIFT_ASSIGNMENT":
      return {
        ...state,
        shiftAssignments: state.shiftAssignments.filter(
          (assignment) => assignment.id !== action.payload.id
        ),
      };

    /* =====================================================
       ROUTES
    ===================================================== */

    case "SET_ROUTES":
      return {
        ...state,
        routes: action.payload,
      };

    case "ADD_ROUTE":
      return {
        ...state,
        routes: [...state.routes, action.payload],
      };

    case "UPDATE_ROUTE":
      return {
        ...state,
        routes: state.routes.map((route) =>
          route.id === action.payload.id
            ? { ...route, ...action.payload.data }
            : route
        ),
      };

    /* =====================================================
       ROUTE POSTS
    ===================================================== */

    case "SET_ROUTE_POSTS":
      return {
        ...state,
        // Replace only this route's posts, keep other routes' posts intact
        // (route posts are loaded per-route, not all at once).
        routePosts: [
          ...state.routePosts.filter(
            (rp) => Number(rp.route_id) !== Number(action.payload.route_id)
          ),
          ...action.payload.items,
        ],
      };

    case "ADD_ROUTE_POST":
      return {
        ...state,
        routePosts: [...state.routePosts, action.payload],
      };

    case "DELETE_ROUTE_POST":
      return {
        ...state,
        routePosts: state.routePosts.filter(
          (rp) => rp.id !== action.payload.id
        ),
      };

    /* =====================================================
       ROUND SCHEDULES
    ===================================================== */

    case "SET_ROUND_SCHEDULES":
      return {
        ...state,
        roundSchedules: [
          ...state.roundSchedules.filter(
            (s) => Number(s.shift_id) !== Number(action.payload.shift_id)
          ),
          ...action.payload.items,
        ],
      };

    case "ADD_ROUND_SCHEDULE":
      return {
        ...state,
        roundSchedules: [...state.roundSchedules, action.payload],
      };

    case "UPDATE_ROUND_SCHEDULE":
      return {
        ...state,
        roundSchedules: state.roundSchedules.map((s) =>
          s.id === action.payload.id
            ? { ...s, ...action.payload.data }
            : s
        ),
      };

    case "DELETE_ROUND_SCHEDULE":
      return {
        ...state,
        roundSchedules: state.roundSchedules.filter(
          (s) => s.id !== action.payload.id
        ),
      };

    /* =====================================================
       ROUND INSTANCES
    ===================================================== */

    case "SET_ROUND_INSTANCES":
      return {
        ...state,
        roundInstances: action.payload,
      };

    case "ADD_ROUND_INSTANCE":
      return {
        ...state,
        roundInstances: [...state.roundInstances, action.payload],
      };

    case "DELETE_ROUND_INSTANCE":
      return {
        ...state,
        roundInstances: state.roundInstances.filter(
          (ri) => ri.id !== action.payload.id
        ),
      };

    case "UPDATE_ROUND_INSTANCE":
      return {
        ...state,
        roundInstances: state.roundInstances.map((ri) =>
          ri.id === action.payload.id ? { ...ri, ...action.payload.data } : ri
        ),
      };

    /* =====================================================
       SETTINGS
    ===================================================== */

    case "UPDATE_SETTINGS":
      return {
        ...state,

        settings: {
          ...state.settings,
          ...action.payload,
        },
      };

    /* =====================================================
       DEVICE SYNC
    ===================================================== */

    case "SYNC_DEVICE":
      return {
        ...state,

        deviceSync: state.deviceSync.map(
          (device) =>
            device.deviceId ===
            action.payload.deviceId
              ? {
                  ...device,

                  pendingCount: 0,

                  status: "Synced",

                  lastSync: nowISO(),
                }
              : device
        ),
      };

    default:
      return state;
  }
}

/* =========================================================
   CONTEXTS
========================================================= */

const DataStateContext =
  createContext(null);

const DataActionsContext =
  createContext(null);

/* =========================================================
   PROVIDER
========================================================= */

export function DataProvider({
  children,
}) {
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    loadInitialState
  );

  // Request-sequencing guards: when the user reselects a shift/date in
  // quick succession, multiple fetches for the same resource can be
  // in flight at once. Without this, a slow response to an OLDER
  // request can resolve after a newer one and overwrite fresher state
  // with stale data. Each ref tracks the latest request "ticket" per
  // resource; a response is only applied if its ticket is still the
  // most recent one issued.
  const roundInstancesRequestRef = useRef(0);
  const roundSchedulesRequestRef = useRef({});
  const shiftAssignmentsRequestRef = useRef(0);
  // In-flight device registration promise. Guarantees that
  // concurrent callers (e.g. two rapid scans, or React StrictMode's
  // double-invoke in dev) share ONE POST /devices instead of each
  // firing their own.
  const deviceRegistrationRef = useRef(null);

  /* =======================================================
     SAVE FULL STATE TO STORAGE
     -------------------------------------------------------
     This is what was missing before: whenever ANY part of
     state changes (login, adding a post, adding an
     officer, creating a round, raising an alert, etc.) the
     whole state object is written to localStorage under
     STORAGE_KEY. loadInitialState() reads it back on the
     next mount/page refresh, so nothing you added
     disappears and you stay logged in.
  ======================================================= */

  useEffect(() => {
    writeStoredState(state);
  }, [state]);

  /* =======================================================
     LOAD GUARD POSTS FROM BACKEND
     -------------------------------------------------------
     Guard posts are loaded from the database API.
     No demo/seed guard posts are used.
  ======================================================= */

  useEffect(() => {
    async function loadGuardPosts() {
      const token =
        state.webSession?.accessToken;

      if (!token) {
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/guard-posts`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
          }
        );

        const data =
          await parseResponse(response);

        if (response.status === 401) {
          console.warn(
            "Session expired while loading guard posts - logging out."
          );
          dispatch({ type: "WEB_LOGOUT" });
          return;
        }

        if (!response.ok) {
          console.error(
            "Failed to load guard posts:",
            data
          );
          return;
        }

        const items =
          Array.isArray(data.items)
            ? data.items
            : Array.isArray(data.posts)
            ? data.posts
            : Array.isArray(data)
            ? data
            : [];

        const posts = items.map((post) => {
          const backendId =
            post.post_id ??
            post.id ??
            post.postId ??
            null;

          const postCode =
            post.post_code ??
            post.postCode ??
            null;

          const gpsLat =
            post.gps_lat ??
            post.latitude ??
            null;

          const gpsLng =
            post.gps_lng ??
            post.longitude ??
            null;

          const qr =
            post.qr_code ??
            post.qrCode ??
            null;

          return {
            ...post,

            siteId:
              post.site_id ??
              post.siteId ??
              DEFAULT_SITE_ID,

            site_id:
              post.site_id ??
              post.siteId ??
              DEFAULT_SITE_ID,

            post_code:
              post.post_code ??
              post.postCode ??
              null,

            id:
              postCode ||
              (backendId !== null
                ? `PST-${String(
                    backendId
                  ).padStart(3, "0")}`
                : generateId(
                    "PST"
                  ).toUpperCase()),

            backendId,

            name:
              post.post_name ??
              post.name ??
              "",

            zone:
              post.zone_name ??
              post.zone ??
              "",

            location:
              post.location_description ??
              post.location ??
              "",

            gps:
              post.gps ??
              (gpsLat !== null ||
              gpsLng !== null
                ? {
                    lat: gpsLat,
                    lng: gpsLng,
                  }
                : ""),

            notes:
              post.notes ??
              "",

            // Backend sends `status` ("ACTIVE"/"INACTIVE"), never
            // is_active - that field never existed on the response, so
            // this always fell through to the hardcoded `true` default
            // regardless of the post's real status.
            active:
              post.status !== undefined
                ? String(post.status).toUpperCase() === "ACTIVE"
                : post.is_active ??
                  post.active ??
                  true,

            qrGenerated:
              Boolean(
                qr ||
                post.qr_generated ||
                post.qrGenerated
              ),

            qrCodeId:
              qr?.qr_value ??
              qr?.qr_uuid ??
              qr?.qr_id ??
              post.qr_value ??
              post.qr_uuid ??
              post.qr_id ??
              null,

            qrValue:
              qr?.qr_value ??
              post.qr_value ??
              null,

            qrUuid:
              qr?.qr_uuid ??
              post.qr_uuid ??
              null,

            qrBackendId:
              qr?.qr_id ??
              post.qr_id ??
              null,

            qrPrintStatus:
              normalizeQRPrintStatus(
                qr || post
              ),

            qrGeneratedAt:
              qr?.created_at ??
              post.qr_created_at ??
              post.created_at ??
              null,

            createdAt:
              post.created_at ??
              null,
          };
        });

        dispatch({
          type: "SET_POSTS",
          payload: posts,
        });
      } catch (error) {
        console.error(
          "Unable to load guard posts:",
          error
        );
      }
    }

    loadGuardPosts();
  }, [
    state.webSession?.accessToken,
  ]);

  /* =======================================================
     LOAD QR CODES FROM BACKEND
  ======================================================= */

  useEffect(() => {
    async function loadQRCodes() {
      const token =
        state.webSession?.accessToken;

      if (!token) {
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/qr-codes`,
          {
            method: "GET",

            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type":
                "application/json",
            },
          }
        );

        const data =
          await parseResponse(response);

        if (response.status === 401) {
          console.warn(
            "Session expired while loading QR codes - logging out."
          );
          dispatch({ type: "WEB_LOGOUT" });
          return;
        }

        if (!response.ok) {
          console.error(
            "Failed to load QR codes:",
            data
          );
          return;
        }

        const qrItems =
          Array.isArray(data.items)
            ? data.items
            : [];

        const mergedQRItems =
          qrItems.map((qr) => {
            const existingQR =
              state.qrCodes.find(
                (existing) =>
                  Number(existing.post_id) ===
                  Number(qr.post_id)
              );

            const post =
              state.posts.find(
                (item) =>
                  Number(item.backendId) ===
                    Number(qr.post_id) ||
                  item.id ===
                    `PST-${String(
                      qr.post_id
                    ).padStart(3, "0")}`
              );

            const backendStatus =
              normalizeQRPrintStatus(qr);

            const wasPrintedLocally =
              isSameQrCode(existingQR, qr) &&
              (post?.qrPrintStatus ===
                "Printed" ||
                existingQR?.status ===
                  "printed");

            return {
              ...qr,

              status:
                backendStatus === "Printed" ||
                wasPrintedLocally
                  ? "printed"
                  : qr.status ||
                    "not_printed",

              printed_at:
                qr.printed_at ||
                existingQR?.printed_at ||
                null,

              printed_by:
                qr.printed_by ||
                existingQR?.printed_by ||
                null,
            };
          });

        dispatch({
          type: "SET_QR_CODES",
          payload: mergedQRItems,
        });

        // Only the ACTIVE QR code should ever drive what a post
        // displays as "its" QR - see the matching fix in the
        // loadQRCodes action for why this can't just loop over every
        // row (including REPLACED/INACTIVE history).
        const activeQrByPostId = new Map();
        mergedQRItems.forEach((qr) => {
          if (qr.status !== "ACTIVE") return;
          activeQrByPostId.set(Number(qr.post_id), qr);
        });

        activeQrByPostId.forEach((qr) => {
          const post =
            state.posts.find(
              (item) =>
                Number(item.backendId) ===
                  Number(qr.post_id) ||
                item.id ===
                  `PST-${String(
                    qr.post_id
                  ).padStart(3, "0")}`
            );

          if (!post) {
            return;
          }

          dispatch({
            type: "GENERATE_QR",

            payload: {
              id: post.id,

              post_id:
                qr.post_id,

              qr,
            },
          });
        });
      } catch (error) {
        console.error(
          "Unable to load QR codes:",
          error
        );
      }
    }

    loadQRCodes();
  }, [
    state.webSession?.accessToken,
  ]);

  /* =======================================================
     OFFICERS ARE NO LONGER AUTO-LOADED HERE ON LOGIN
     -------------------------------------------------------
     This used to fetch /api/v1/users unconditionally for
     EVERY logged-in role, on EVERY page, right after login -
     even though only Administrator/Supervisor are allowed to
     call that endpoint. For any other role (Checking Officer,
     Security Officer), this silently 403'd in the background
     on every single page, not just Officer Management.
     Officers.jsx now calls actions.loadOfficers() itself on
     mount (see that file), so this data is fetched only when
     the Officer Management page is actually visited, by a
     role that is actually allowed to see it.
  ======================================================= */


  /* =======================================================
     ACTIONS
  ======================================================= */

  const actions = useMemo(() => {
    const token =
      state.webSession?.accessToken;

    const authHeaders = () => ({
      Authorization: `Bearer ${token}`,
      "Content-Type":
        "application/json",
    });

    /* =====================================================
       USER MAPPER
    ===================================================== */

    const mapBackendUser = (user = {}) => {
      const normalizedStatus =
        user.status
          ? String(user.status)
              .toLowerCase()
              .replace(
                /^./,
                (char) =>
                  char.toUpperCase()
              )
          : "Active";

    return {
        ...user,

        id:
          user.user_id ??
          user.id ??
          user.user_uuid,

        user_id:
          user.user_id ??
          user.id ??
          user.user_uuid,

        employeeCode:
          user.employee_code ??
          user.employeeCode ??
          "",

        employee_code:
          user.employee_code ??
          user.employeeCode ??
          "",

        name:
          user.full_name ??
          user.name ??
          "",

        full_name:
          user.full_name ??
          user.name ??
          "",

        username:
          user.username ??
          "",

        roleId:
          user.role_id ??
          null,

        role_id:
          user.role_id ??
          null,

        role:
          user.role_name ??
          (typeof user.role === "string"
            ? user.role
            : user.role?.role_name ??
              user.role?.name) ??
          "",

        role_name:
          user.role_name ??
          (typeof user.role === "string"
            ? user.role
            : user.role?.role_name ??
              user.role?.name) ??
          "",

        lastLogin:
          user.last_login ??
          user.lastLogin ??
          user.last_login_at ??
          user.last_active ??
          null,

        phone:
          user.phone ??
          "",

        email:
          user.email ??
          "",

        status:
          normalizedStatus,

        rawStatus:
          user.status ??
          null,

        deletedAt:
          user.deleted_at ??
          null,

        deleted_at:
          user.deleted_at ??
          null,
      };
    };

    /* -------------------------------------------------------
       DEVICE BINDING
       A device (this browser) is bound to the officer who first
       scans on it. localStorage holds:
         pgpcs_device_id       - backend device_id
         pgpcs_device_code     - permanent random identity of this device
         pgpcs_device_owner_id - user_id of the officer who owns it
       Any other officer on this device is blocked.
    ------------------------------------------------------- */
    const DEVICE_ID_KEY = "pgpcs_device_id";
    const DEVICE_CODE_KEY = "pgpcs_device_code";
    const DEVICE_OWNER_KEY = "pgpcs_device_owner_id";
    const NOT_OWNER_ERROR =
      "This device is registered to another officer. Please use your own device.";

    const safeGet = (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const safeSet = (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error("Unable to persist device info:", error);
      }
    };

    // One-time migration from the old per-officer keys
    // (pgpcs_device_id_<userId> / pgpcs_device_code_<userId>). The
    // first officer found becomes this device's owner.
    const migrateLegacyDeviceKeys = () => {
      if (safeGet(DEVICE_CODE_KEY)) return;
      try {
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          const match = key && key.match(/^pgpcs_device_code_(.+)$/);
          if (!match) continue;
          const legacyCode = localStorage.getItem(key);
          if (!legacyCode) continue;
          const legacyId = localStorage.getItem(`pgpcs_device_id_${match[1]}`);
          safeSet(DEVICE_CODE_KEY, legacyCode);
          if (legacyId) safeSet(DEVICE_ID_KEY, legacyId);
          safeSet(DEVICE_OWNER_KEY, match[1]);
          break;
        }
      } catch {
        // localStorage unavailable
      }
    };

    // Local-only ownership check - makes NO API call. Returns
    // { ok: true } if this device is unregistered or owned by the
    // current user, else { ok: false, notOwner: true, error }.
    const checkLocalDeviceOwner = () => {
      migrateLegacyDeviceKeys();
      const userId = state.webSession?.id;
      const ownerId = safeGet(DEVICE_OWNER_KEY);
      if (ownerId && userId != null && String(ownerId) !== String(userId)) {
        return { ok: false, notOwner: true, error: NOT_OWNER_ERROR };
      }
      return { ok: true };
    };

    const resolveDeviceId = async () => {
      if (!token) {
        return { ok: false, error: "Authentication token is missing." };
      }
      const userId = state.webSession?.id;
      if (userId == null) {
        return { ok: false, error: "Current user is not known yet." };
      }

      const ownership = checkLocalDeviceOwner();
      if (!ownership.ok) return ownership;

      // device_code is generated once and never regenerated, so this
      // device always maps to the same backend row.
      let deviceCode = safeGet(DEVICE_CODE_KEY);
      if (!deviceCode) {
        deviceCode =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `dev-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        safeSet(DEVICE_CODE_KEY, deviceCode);
      }

      const cachedId = safeGet(DEVICE_ID_KEY);
      const cachedOwner = safeGet(DEVICE_OWNER_KEY);
      if (cachedId && cachedOwner) {
        // Already registered to this officer - no API call needed.
        return { ok: true, deviceId: Number(cachedId) };
      }

      // Not registered yet (or owner unknown): POST is idempotent on
      // device_code - it creates the device on the very first scan,
      // or returns the existing one if it's already in the database.
      try {
        const response = await fetch(`${API_BASE_URL}/devices`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({
            device_code: deviceCode,
            device_name: state.webSession?.name
              ? `${state.webSession.name}'s device`
              : "Officer device",
            assigned_to_user_id: userId,
          }),
        });

        const result = await parseResponse(response);

        if (response.status === 403 && result?.code === "DEVICE_NOT_OWNED") {
          if (result.assigned_to_user_id != null) {
            safeSet(DEVICE_OWNER_KEY, String(result.assigned_to_user_id));
          }
          return { ok: false, notOwner: true, error: result.error || NOT_OWNER_ERROR };
        }

        if (!response.ok || !result?.device_id) {
          return {
            ok: false,
            error: result?.error || result?.message || "Unable to register device.",
          };
        }

        safeSet(DEVICE_ID_KEY, String(result.device_id));
        safeSet(
          DEVICE_OWNER_KEY,
          String(result.assigned_to_user_id ?? userId)
        );

        if (
          result.assigned_to_user_id != null &&
          String(result.assigned_to_user_id) !== String(userId)
        ) {
          return { ok: false, notOwner: true, error: NOT_OWNER_ERROR };
        }

        return { ok: true, deviceId: result.device_id };
      } catch (error) {
        console.error("Register device error:", error);
        return { ok: false, error: "Unable to connect to Devices API." };
      }
    };

    return {
      /* ===================================================
         RESET
      =================================================== */

      resetDemo: () =>
        dispatch({
          type: "RESET_DEMO",
        }),

      /* ===================================================
         WEB LOGIN
      =================================================== */

      webLogin: async (
        username,
        password
      ) => {
        if (!username?.trim()) {
          return {
            ok: false,
            error:
              "Username is required.",
          };
        }

        if (!password) {
          return {
            ok: false,
            error:
              "Password is required.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/auth/login`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",
                },

                body: JSON.stringify({
                  username:
                    username.trim(),
                  password,
                }),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,

              error:
                data.error ||
                data.message ||
                "Invalid username or password.",
            };
          }

          const backendUser =
            data.user || data;

          const accessToken =
            data.access_token ||
            data.accessToken ||
            data.token;

          if (!accessToken) {
            return {
              ok: false,
              error:
                "Login successful but access token was not returned by the server.",
            };
          }

          const session = {
            id:
              backendUser.user_id ||
              backendUser.id ||
              backendUser.user_uuid,

            username:
              backendUser.username ||
              username.trim(),

            name:
              backendUser.full_name ||
              backendUser.name ||
              username.trim(),

            role:
              toDisplayRoleName(
                backendUser.role_name ||
                  backendUser.role
              ) || "Administrator",

            accessToken,
          };

          dispatch({
            type: "WEB_LOGIN",
            payload: session,
          });

          return {
            ok: true,
            user: backendUser,
            accessToken,
          };
        } catch (error) {
          console.error(
            "Web login error:",
            error
          );

          return {
            ok: false,

            error:
              "Unable to connect to the server. Please check that the backend is running on port 8001.",
          };
        }
      },

      webLogout: () =>
        dispatch({
          type: "WEB_LOGOUT",
        }),

      /* ===================================================
         FIELD LOGIN
      =================================================== */

      fieldLogin: (
        officerId,
        pin
      ) => {
        const officer =
          state.officers.find(
            (item) =>
              String(item.id)
                .toLowerCase() ===
              String(officerId)
                .trim()
                .toLowerCase()
          );

        if (!officer) {
          return {
            ok: false,
            error:
              "Unknown Officer ID.",
          };
        }

        if (
          officer.status !==
          "Active"
        ) {
          return {
            ok: false,
            error: `Officer is marked ${officer.status}.`,
          };
        }

        if (officer.pin !== pin) {
          return {
            ok: false,
            error:
              "Incorrect PIN. (Demo PIN: 1234)",
          };
        }

        const session = {
          officerId:
            officer.id,

          name:
            officer.name,

          role:
            officer.role,

          deviceId:
            officer.deviceId,
        };

        dispatch({
          type: "FIELD_LOGIN",
          payload: session,
        });

        return {
          ok: true,
          officer,
        };
      },

      fieldLogout: () =>
        dispatch({
          type: "FIELD_LOGOUT",
        }),

      /* ===================================================
         OFFICERS - GET ALL (fetch on demand)
         ---------------------------------------------------
         Previously, officers were only ever fetched by the
         provider-level useEffect further down, which runs
         once when the access token first appears (login /
         full page load). Navigating client-side into Officer
         Management never re-triggered it, so the backend
         only ever logged one /api/v1/users call per login -
         not one per visit to the page - and switching panels
         without a refresh showed nothing in the terminal.
         This does the same fetch, but as a callable action
         Officers.jsx can invoke every time it mounts, exactly
         like loadUsers() already works for User Roles & Access.
      =================================================== */

      loadOfficers: async (params = {}) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        // Use the authenticated user's real role from the login session.
        // The backend allows /v1/users only for Administrator/Supervisor,
        // so other roles must not make this request at all.
        const viewerRole = String(state.webSession?.role || "")
          .trim()
          .toLowerCase()
          .replace(/[_\s]+/g, "");

        const canLoadOfficers =
          viewerRole === "administrator" ||
          viewerRole === "supervisor";

        if (!canLoadOfficers) {
          dispatch({
            type: "SET_OFFICERS",
            payload: [],
          });

          return {
            ok: true,
            officers: [],
          };
        }

        try {
          // Optional filters, e.g. loadOfficers({ status: "ACTIVE" })
          const searchParams = new URLSearchParams();
          if (params.status) {
            searchParams.set("status", String(params.status));
          }
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/v1/users${query ? `?${query}` : ""}`,
            {
              method: "GET",
              headers: authHeaders(),
            }
          );

          const data = await parseResponse(response);

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return {
              ok: false,
              error: "Session expired. Please log in again.",
            };
          }

          if (response.status === 403) {
            // This role isn't allowed to view officers - clear out
            // whatever was previously in state (which could be stale
            // data left over from an earlier, more-privileged session
            // saved to localStorage) instead of silently leaving old
            // officer data visible to a role that isn't authorized to
            // see it.
            dispatch({
              type: "SET_OFFICERS",
              payload: [],
            });

            return {
              ok: false,
              error:
                data.error ||
                "You do not have permission to view officers.",
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load officers.",
            };
          }

          const items = Array.isArray(data.items)
            ? data.items
            : [];

          const backendOfficers = items.map(
            mapBackendUserToOfficerShape
          );

          const officers = backendOfficers.map((officer) => {
            const savedOfficer = state.officers.find(
              (item) =>
                String(item.id) === String(officer.id)
            );

            if (!savedOfficer) {
              return officer;
            }

            return {
              ...savedOfficer,
              ...officer,
              role:
                savedOfficer.frontendRole ||
                officer.role ||
                savedOfficer.role ||
                "",
              role_name:
                savedOfficer.frontendRole ||
                officer.role_name ||
                savedOfficer.role_name ||
                "",
              frontendRole:
                savedOfficer.frontendRole ||
                officer.role ||
                savedOfficer.role ||
                "",
              shift:
                officer.shift ||
                savedOfficer.shift ||
                "",
              shift_name:
                officer.shift_name ||
                savedOfficer.shift_name ||
                "",
              phone:
                officer.phone ||
                savedOfficer.phone ||
                "",
              contact:
                officer.contact ||
                savedOfficer.contact ||
                officer.phone ||
                savedOfficer.phone ||
                "",
              deviceId:
                officer.deviceId ||
                savedOfficer.deviceId ||
                "",
              device_id:
                officer.device_id ||
                savedOfficer.device_id ||
                officer.deviceId ||
                savedOfficer.deviceId ||
                "",
            };
          });

          dispatch({
            type: "SET_OFFICERS",
            payload: officers,
          });

          return {
            ok: true,
            officers,
          };
        } catch (error) {
          console.error(
            "Load officers error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Officers API.",
          };
        }
      },

      /* ===================================================
         USERS - GET ALL
      =================================================== */

      loadUsers: async (
        params = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        try {
          const searchParams =
            new URLSearchParams();

          if (
            params.role_id !==
            undefined
          ) {
            searchParams.set(
              "role_id",
              String(
                params.role_id
              )
            );
          }

          if (params.status) {
            searchParams.set(
              "status",
              String(
                params.status
              ).toLowerCase()
            );
          }

          if (params.q) {
            searchParams.set(
              "q",
              params.q
            );
          }

          if (
            params.include_deleted !==
            undefined
          ) {
            searchParams.set(
              "include_deleted",
              String(
                params.include_deleted
              )
            );
          }

          if (params.page) {
            searchParams.set(
              "page",
              String(params.page)
            );
          }

          if (params.page_size) {
            searchParams.set(
              "page_size",
              String(
                params.page_size
              )
            );
          }

          const query =
            searchParams.toString();

          const response =
            await fetch(
              `${API_BASE_URL}/v1/users${
                query
                  ? `?${query}`
                  : ""
              }`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return {
              ok: false,
              error: "Session expired. Please log in again.",
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load users.",
            };
          }

          const users =
            Array.isArray(
              data.items
            )
              ? data.items.map(
                  mapBackendUser
                )
              : [];

          dispatch({
            type: "SET_USERS",
            payload: users,
          });

          return {
            ok: true,

            users,

            items: users,

            total:
              data.total ??
              users.length,

            page:
              data.page ?? 1,

            page_size:
              data.page_size ??
              users.length,
          };
        } catch (error) {
          console.error(
            "Load users error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Users API.",
          };
        }
      },

      /* ===================================================
         ROLES - GET ALL
      =================================================== */

      loadRoles: async (
        params = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        try {
          const searchParams =
            new URLSearchParams();

          if (
            params.include_deleted !==
            undefined
          ) {
            searchParams.set(
              "include_deleted",
              String(
                params.include_deleted
              )
            );
          }

          const query =
            searchParams.toString();

          const response =
            await fetch(
              `${API_BASE_URL}/v1/roles${
                query
                  ? `?${query}`
                  : ""
              }`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return {
              ok: false,
              error: "Session expired. Please log in again.",
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load roles.",
            };
          }

          const roles =
            Array.isArray(
              data.items
            )
              ? data.items
              : [];

          return {
            ok: true,
            roles,
            items: roles,
            total:
              data.total ??
              roles.length,
          };
        } catch (error) {
          console.error(
            "Load roles error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Roles API.",
          };
        }
      },

      /* ===================================================
         USERS - GET ONE
      =================================================== */

      getUser: async (
        userId
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load user.",
            };
          }

          return {
            ok: true,
            user:
              mapBackendUser(data),
          };
        } catch (error) {
          console.error(
            "Get user error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Users API.",
          };
        }
      },

      /* ===================================================
         USERS - CREATE
      =================================================== */

      createUser: async (
        userData = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        const payload = {
          employee_code:
            userData.employee_code ??
            userData.employeeCode ??
            "",

          full_name:
            userData.full_name ??
            userData.name ??
            "",

          role_id:
            userData.role_id ??
            userData.roleId ??
            null,

          username:
            userData.username ??
            "",

          password:
            userData.password ??
            "",

          phone:
            userData.phone ??
            null,

          email:
            userData.email ??
            null,

          status: String(
            userData.status ??
              "active"
          ).toLowerCase(),
        };

        if (
          !payload.employee_code ||
          !payload.full_name ||
          !payload.role_id ||
          !payload.username ||
          !payload.password
        ) {
          return {
            ok: false,
            error:
              "Employee code, full name, role, username and password are required.",
          };
        }

        if (
          payload.password.length <
          8
        ) {
          return {
            ok: false,
            error:
              "Password must be at least 8 characters.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/users`,
              {
                method: "POST",

                headers:
                  authHeaders(),

                body: JSON.stringify(
                  payload
                ),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to create user.",
            };
          }

          const backendUser =
            data.item ||
            data.user ||
            data;

          const createdUser =
            mapBackendUser(
              backendUser
            );

          dispatch({
            type: "ADD_USER",
            payload:
              createdUser,
          });

          return {
            ok: true,
            user:
              createdUser,
          };
        } catch (error) {
          console.error(
            "Create user error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Users API.",
          };
        }
      },

      /* ===================================================
         USERS - UPDATE
      =================================================== */

      updateUserApi: async (
        userId,
        userData = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        const payload = {};

        if (
          userData.full_name !==
            undefined ||
          userData.name !==
            undefined
        ) {
          payload.full_name =
            userData.full_name ??
            userData.name;
        }

        if (
          userData.role_id !==
            undefined ||
          userData.roleId !==
            undefined
        ) {
          payload.role_id =
            userData.role_id ??
            userData.roleId;
        }

        if (
          userData.username !==
          undefined
        ) {
          payload.username =
            userData.username;
        }

        if (
          userData.phone !==
          undefined
        ) {
          payload.phone =
            userData.phone;
        }

        if (
          userData.email !==
          undefined
        ) {
          payload.email =
            userData.email;
        }

        if (
          userData.status !==
          undefined
        ) {
          payload.status =
            String(
              userData.status
            ).toLowerCase();
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}`,
              {
                method: "PUT",

                headers:
                  authHeaders(),

                body: JSON.stringify(
                  payload
                ),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to update user.",
            };
          }

          const backendUser =
            data.item ||
            data.user ||
            data;

          const updatedUser =
            mapBackendUser(
              backendUser
            );

          dispatch({
            type: "UPDATE_USER",

            payload: {
              id: userId,
              data:
                updatedUser,
            },
          });

          return {
            ok: true,
            user:
              updatedUser,
          };
        } catch (error) {
          console.error(
            "Update user error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Users API.",
          };
        }
      },

      /* ===================================================
         LOCAL USER UPDATE
      =================================================== */

      updateUser: (
        id,
        data
      ) =>
        dispatch({
          type: "UPDATE_USER",

          payload: {
            id,
            data,
          },
        }),

      /* ===================================================
         USERS - DELETE
      =================================================== */

      deleteUser: async (
        userId
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}`,
              {
                method: "DELETE",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to deactivate user.",
            };
          }

          dispatch({
            type: "DELETE_USER",

            payload: {
              id: userId,
            },
          });

          return {
            ok: true,

            message:
              data.message ||
              "User deactivated.",
          };
        } catch (error) {
          console.error(
            "Delete user error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Users API.",
          };
        }
      },

      /* ===================================================
         CHANGE PASSWORD
      =================================================== */

      resetPassword: async (
        userId,
        oldPassword = "",
        newPassword = ""
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        if (!newPassword) {
          return {
            ok: false,
            error:
              "New password is required.",
          };
        }

        if (
          newPassword.length <
          8
        ) {
          return {
            ok: false,
            error:
              "New password must be at least 8 characters.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}/reset-password`,
              {
                method: "POST",

                headers:
                  authHeaders(),

                body: JSON.stringify({
                  new_password:
                    newPassword,
                }),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to reset password.",
            };
          }

          return {
            ok: true,

            message:
              data.message ||
              "Password changed successfully.",
          };
        } catch (error) {
          console.error(
            "Reset password error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to reset password API.",
          };
        }
      },

      /* ===================================================
         USER SESSIONS
      =================================================== */

      getUserSessions: async (
        userId,
        params = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        try {
          const searchParams =
            new URLSearchParams();

          if (params.page) {
            searchParams.set(
              "page",
              String(params.page)
            );
          }

          if (params.page_size) {
            searchParams.set(
              "page_size",
              String(
                params.page_size
              )
            );
          }

          const query =
            searchParams.toString();

          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}/sessions${
                query
                  ? `?${query}`
                  : ""
              }`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load user sessions.",
            };
          }

          const items =
            Array.isArray(
              data.items
            )
              ? data.items
              : [];

          return {
            ok: true,

            sessions: items,

            items,

            total:
              data.total ??
              items.length,

            page:
              data.page ?? 1,

            page_size:
              data.page_size ?? 20,
          };
        } catch (error) {
          console.error(
            "User sessions error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Sessions API.",
          };
        }
      },

      /* ===================================================
         USER PERFORMANCE
      =================================================== */

      getUserPerformance: async (
        userId,
        params = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        if (!userId) {
          return {
            ok: false,
            error:
              "User ID is required.",
          };
        }

        try {
          const searchParams =
            new URLSearchParams();

          if (params.start_date) {
            searchParams.set(
              "start_date",
              params.start_date
            );
          }

          if (params.end_date) {
            searchParams.set(
              "end_date",
              params.end_date
            );
          }

          const query =
            searchParams.toString();

          const response =
            await fetch(
              `${API_BASE_URL}/v1/users/${encodeURIComponent(
                userId
              )}/performance${
                query
                  ? `?${query}`
                  : ""
              }`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const data =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load user performance.",
            };
          }

          return {
            ok: true,
            performance: data,
            data,
          };
        } catch (error) {
          console.error(
            "User performance error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Performance API.",
          };
        }
      },

      /* ===================================================
         GUARD POSTS - GET ALL
      =================================================== */

      loadPosts: async () => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        try {
          const response =
            await fetch(
              `${API_BASE_URL}/guard-posts`,
              {
                method: "GET",
                headers:
                  authHeaders(),
              }
            );

          const result =
            await parseResponse(
              response
            );

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return {
              ok: false,
              error: "Session expired. Please log in again.",
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to load guard posts.",
            };
          }

          const items =
            Array.isArray(result.items)
              ? result.items
              : Array.isArray(result.posts)
              ? result.posts
              : Array.isArray(result)
              ? result
              : [];

          const posts = items.map((post) => {
            const backendId =
              post.post_id ??
              post.id ??
              post.postId ??
              null;

            const postCode =
              post.post_code ??
              post.postCode ??
              null;

            const gpsLat =
              post.gps_lat ??
              post.latitude ??
              null;

            const gpsLng =
              post.gps_lng ??
              post.longitude ??
              null;

            const qr =
              post.qr_code ??
              post.qrCode ??
              null;

            return {
              ...post,

              id:
                postCode ||
                (backendId !== null
                  ? `PST-${String(
                      backendId
                    ).padStart(3, "0")}`
                  : generateId(
                      "PST"
                    ).toUpperCase()),

              backendId,

              name:
                post.post_name ??
                post.name ??
                "",

              zone:
                post.zone_name ??
                post.zone ??
                "",

              location:
                post.location_description ??
                post.location ??
                "",

              gps:
                post.gps ??
                (gpsLat !== null ||
                gpsLng !== null
                  ? {
                      lat: gpsLat,
                      lng: gpsLng,
                    }
                  : ""),

              notes:
                post.notes ??
                "",

              // Backend sends `status` ("ACTIVE"/"INACTIVE"), never
              // is_active - see the matching fix in loadGuardPosts above.
              active:
                post.status !== undefined
                  ? String(post.status).toUpperCase() === "ACTIVE"
                  : post.is_active ??
                    post.active ??
                    true,

              qrGenerated:
                Boolean(
                  qr ||
                  post.qr_generated ||
                  post.qrGenerated
                ),

              qrCodeId:
                qr?.qr_value ??
                qr?.qr_uuid ??
                qr?.qr_id ??
                post.qr_value ??
                post.qr_uuid ??
                post.qr_id ??
                null,

              qrValue:
                qr?.qr_value ??
                post.qr_value ??
                null,

              qrUuid:
                qr?.qr_uuid ??
                post.qr_uuid ??
                null,

              qrBackendId:
                qr?.qr_id ??
                post.qr_id ??
                null,

              qrPrintStatus:
                normalizeQRPrintStatus(
                  qr || post
                ),

              qrGeneratedAt:
                qr?.created_at ??
                post.qr_created_at ??
                post.created_at ??
                null,

              createdAt:
                post.created_at ??
                null,
            };
          });

          dispatch({
            type: "SET_POSTS",
            payload: posts,
          });

          return {
            ok: true,
            posts,
            items: posts,
            total:
              result.total ??
              posts.length,
          };
        } catch (error) {
          console.error(
            "Load guard posts error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to guard posts API.",
          };
        }
      },

      /* ===================================================
         GUARD POSTS - CREATE
      =================================================== */

      addPost: async (
        data = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        try {
          const gpsLat =
            data.gps?.lat ??
            data.gps_lat ??
            null;

          const gpsLng =
            data.gps?.lng ??
            data.gps_lng ??
            null;

          /*
           * The Guard Posts API requires both post_code and post_name.
           * The existing form only asks for Post Name, so generate the
           * next POST-001 / POST-002 / POST-003... code here.
           */
          const existingPostCodes =
            (state.posts || [])
              .map(
                (post) =>
                  post.post_code ||
                  post.postCode ||
                  post.id ||
                  ""
              )
              .map((code) => {
                const match =
                  String(code).match(/(\d+)$/);

                return match
                  ? Number(match[1])
                  : 0;
              })
              .filter((number) => Number.isFinite(number));

          const nextPostNumber =
            existingPostCodes.length > 0
              ? Math.max(...existingPostCodes) + 1
              : 1;

          const generatedPostCode =
            `POST-${String(
              nextPostNumber
            ).padStart(3, "0")}`;

          const payload = {
            site_id:
              Number(data.site_id ?? data.siteId ?? DEFAULT_SITE_ID),
            post_code:
              data.post_code?.trim() ||
              data.postCode?.trim() ||
              generatedPostCode,

            post_name:
              data.name?.trim() ||
              data.post_name?.trim() ||
              "",

            location_description:
              data.location ||
              data.location_description ||
              null,

            gps_lat: gpsLat,

            gps_lng: gpsLng,

            generate_qr_code: true,
          };

          if (!payload.post_name) {
            return {
              ok: false,
              error:
                "Post name is required.",
            };
          }

          const response =
            await fetch(
              `${API_BASE_URL}/guard-posts`,
              {
                method: "POST",

                headers:
                  authHeaders(),

                body: JSON.stringify(
                  payload
                ),
              }
            );

          const result =
            await parseResponse(
              response
            );

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to create guard post.",
            };
          }

          const backendPost =
            result.item ||
            result.post ||
            result;

          const backendPostId =
            backendPost.post_id ??
            backendPost.id;

          const backendPostCode =
            backendPost.post_code;

          const frontendPostId =
            backendPostCode ||
            `PST-${String(
              backendPostId
            ).padStart(3, "0")}`;

          const qr =
            backendPost.qr_code ||
            result.qr_code ||
            null;

          const newPost = {
            id: frontendPostId,

            backendId:
              backendPostId,

            siteId:
              backendPost.site_id ??
              payload.site_id ??
              DEFAULT_SITE_ID,

            site_id:
              backendPost.site_id ??
              payload.site_id ??
              DEFAULT_SITE_ID,

            post_code:
              backendPost.post_code ??
              payload.post_code,

            name:
              backendPost.post_name ||
              data.name ||
              "",

            zone:
              data.zone ||
              "",

            location:
              backendPost.location_description ||
              data.location ||
              "",

            gps:
              data.gps ||
              {
                lat: gpsLat,
                lng: gpsLng,
              },

            notes:
              data.notes ||
              "",

            // Backend sends `status` ("ACTIVE"/"INACTIVE"), never
            // is_active - see the matching fix in loadGuardPosts above.
            active:
              backendPost.status !== undefined
                ? String(backendPost.status).toUpperCase() === "ACTIVE"
                : backendPost.is_active !== false,

            qrGenerated:
              Boolean(qr),

            qrCodeId:
              qr?.qr_value ||
              qr?.qr_uuid ||
              qr?.qr_id ||
              null,

            qrValue:
              qr?.qr_value ||
              null,

            qrUuid:
              qr?.qr_uuid ||
              null,

            qrBackendId:
              qr?.qr_id ||
              null,

            qrPrintStatus:
              qr
                ? "Not Printed"
                : "Not Generated",

            qrGeneratedAt:
              qr?.created_at ||
              backendPost.created_at ||
              nowISO(),

            createdAt:
              backendPost.created_at ||
              nowISO(),
          };

          dispatch({
            type: "ADD_POST",
            payload: newPost,
          });

          if (qr) {
            dispatch({
              type: "GENERATE_QR",

              payload: {
                id:
                  newPost.id,

                post_id:
                  backendPostId,

                qr,
              },
            });
          }

          return {
            ok: true,

            post:
              backendPost,

            qr,
          };
        } catch (error) {
          console.error(
            "Guard post creation error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to guard post API.",
          };
        }
      },

      /* ===================================================
         GUARD POSTS - UPDATE (calls backend)
      =================================================== */

      updatePost: async (id, data = {}) => {
        const post = state.posts.find(
          (item) => item.id === id
        );

        if (!post) {
          return {
            ok: false,
            error: "Guard post not found.",
          };
        }

        if (!token) {
          return {
            ok: false,
            error:
              "Authentication token is missing.",
          };
        }

        const backendPostId =
          getBackendPostId(post);

        if (!backendPostId) {
          return {
            ok: false,
            error:
              "Backend post ID is missing.",
          };
        }

        try {
          const gpsLat =
            data.gps?.lat ??
            data.gps_lat ??
            null;

          const gpsLng =
            data.gps?.lng ??
            data.gps_lng ??
            null;

          const payload = {
            post_name:
              data.name?.trim() ||
              data.post_name?.trim() ||
              post.name,

            location_description:
              data.location ??
              data.location_description ??
              post.location,

            gps_lat: gpsLat,

            gps_lng: gpsLng,
          };

          const response = await fetch(
            `${API_BASE_URL}/guard-posts/${backendPostId}`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify(payload),
            }
          );

          const result =
            await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to update guard post.",
            };
          }

          dispatch({
            type: "UPDATE_POST",

            payload: {
              id,

              data: {
                name:
                  result.post_name ??
                  data.name ??
                  post.name,

                location:
                  result.location_description ??
                  data.location ??
                  post.location,

                gps:
                  data.gps ??
                  post.gps,

                notes:
                  data.notes ??
                  post.notes,

                zone:
                  data.zone ??
                  post.zone,

                // Backend sends `status` ("ACTIVE"/"INACTIVE"), never
                // is_active - see the matching fix in loadGuardPosts above.
                active:
                  result.status !== undefined
                    ? String(result.status).toUpperCase() === "ACTIVE"
                    : result.is_active ?? post.active,
              },
            },
          });

          return {
            ok: true,
            post: result,
          };
        } catch (error) {
          console.error(
            "Guard post update error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to guard post API.",
          };
        }
      },

      /* ===================================================
         GUARD POSTS - LOCAL DELETE
      =================================================== */

      deletePost: (
        id
      ) =>
        dispatch({
          type: "DELETE_POST",

          payload: {
            id,
          },
        }),

      /* ===================================================
         GUARD POST ACTIVE/INACTIVE
      =================================================== */

      togglePostActive:
        async (id) => {
          const post =
            state.posts.find(
              (item) =>
                item.id === id
            );

          if (!post) {
            return {
              ok: false,
              error:
                "Guard post not found.",
            };
          }

          if (!token) {
            return {
              ok: false,
              error:
                "Authentication token is missing.",
            };
          }

          const newActiveStatus =
            !post.active;

          const backendPostId =
            getBackendPostId(post);

          if (!backendPostId) {
            return {
              ok: false,
              error:
                "Backend post ID is missing.",
            };
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/guard-posts/${backendPostId}`,
                {
                  method: "PUT",

                  headers:
                    authHeaders(),

                  body: JSON.stringify({
                    status: newActiveStatus
                      ? "active"
                      : "inactive",
                  }),
                }
              );

            const data =
              await parseResponse(
                response
              );

            if (!response.ok) {
              return {
                ok: false,
                error:
                  data.error ||
                  data.message ||
                  "Unable to update guard post status.",
              };
            }

            dispatch({
              type:
                "TOGGLE_POST_ACTIVE",

              payload: {
                id,
              },
            });

            return {
              ok: true,
              post: data,
            };
          } catch (error) {
            console.error(
              "Guard post status update error:",
              error
            );

            return {
              ok: false,
              error:
                "Unable to connect to guard post API.",
            };
          }
        },

      /* ===================================================
         QR CODES - GET ALL (fetch on demand)
         ---------------------------------------------------
         Same fix as loadOfficers above: QR codes were only
         ever fetched once by a provider-level effect at
         login/full-page-load. Navigating into QR Code
         Management never re-triggered a fresh call. This is
         the same fetch, exposed as a callable action so the
         page can call it on every mount.
      =================================================== */

      loadQRCodes: async () => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/qr-codes`,
            {
              method: "GET",
              headers: authHeaders(),
            }
          );

          const data = await parseResponse(response);

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return {
              ok: false,
              error: "Session expired. Please log in again.",
            };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error ||
                data.message ||
                "Unable to load QR codes.",
            };
          }

          const qrItems = Array.isArray(data.items)
            ? data.items
            : [];

          const mergedQRItems = qrItems.map((qr) => {
            const existingQR = state.qrCodes.find(
              (existing) =>
                Number(existing.post_id) ===
                Number(qr.post_id)
            );

            const post = state.posts.find(
              (item) =>
                Number(item.backendId) ===
                  Number(qr.post_id) ||
                item.id ===
                  `PST-${String(qr.post_id).padStart(
                    3,
                    "0"
                  )}`
            );

            const backendStatus = normalizeQRPrintStatus(qr);

            const wasPrintedLocally =
              isSameQrCode(existingQR, qr) &&
              (post?.qrPrintStatus === "Printed" ||
                existingQR?.status === "printed");

            return {
              ...qr,

              status:
                backendStatus === "Printed" ||
                wasPrintedLocally
                  ? "printed"
                  : qr.status || "not_printed",

              printed_at:
                qr.printed_at ||
                existingQR?.printed_at ||
                null,

              printed_by:
                qr.printed_by ||
                existingQR?.printed_by ||
                null,
            };
          });

          dispatch({
            type: "SET_QR_CODES",
            payload: mergedQRItems,
          });

          // Only the ACTIVE QR code should ever drive what a post
          // displays as "its" QR. Previously this looped over every
          // row returned - including REPLACED/INACTIVE history from
          // past regenerations - and dispatched GENERATE_QR for each
          // one, letting whichever happened to be LAST in the array
          // silently win. That's not tied to "newest" or "active" at
          // all, just incidental backend ordering - which is why an
          // old, replaced QR could end up as the one actually shown.
          const activeQrByPostId = new Map();
          mergedQRItems.forEach((qr) => {
            if (qr.status !== "ACTIVE") return;
            activeQrByPostId.set(Number(qr.post_id), qr);
          });

          activeQrByPostId.forEach((qr) => {
            const post = state.posts.find(
              (item) =>
                Number(item.backendId) ===
                  Number(qr.post_id) ||
                item.id ===
                  `PST-${String(qr.post_id).padStart(
                    3,
                    "0"
                  )}`
            );

            if (!post) {
              return;
            }

            dispatch({
              type: "GENERATE_QR",

              payload: {
                id: post.id,
                post_id: qr.post_id,
                qr,
              },
            });
          });

          return {
            ok: true,
            qrCodes: mergedQRItems,
          };
        } catch (error) {
          console.error(
            "Load QR codes error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to QR codes API.",
          };
        }
      },

      /* ===================================================
         QR - GENERATE
      =================================================== */

      generateQR:
        async (id) => {
          const post =
            state.posts.find(
              (item) =>
                item.id === id
            );

          if (!post) {
            return {
              ok: false,
              error:
                "Guard post not found.",
            };
          }

          if (!token) {
            return {
              ok: false,
              error:
                "Authentication token is missing.",
            };
          }

          const backendPostId =
            getBackendPostId(post);

          if (!backendPostId) {
            return {
              ok: false,
              error:
                "Backend post ID is missing.",
            };
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/qr-codes`,
                {
                  method: "POST",

                  headers:
                    authHeaders(),

                  body: JSON.stringify({
                    post_id:
                      backendPostId,
                  }),
                }
              );

            const data =
              await parseResponse(
                response
              );

            if (!response.ok) {
              return {
                ok: false,
                error:
                  data.error ||
                  data.message ||
                  "Unable to generate QR code.",
              };
            }

            const qr =
              data.item ||
              data.qr_code ||
              data;

            dispatch({
              type: "GENERATE_QR",

              payload: {
                id: post.id,

                post_id:
                  qr.post_id ||
                  backendPostId,

                qr,
              },
            });

            return {
              ok: true,
              qr,
            };
          } catch (error) {
            console.error(
              "QR generation error:",
              error
            );

            return {
              ok: false,
              error:
                "Unable to connect to QR API.",
            };
          }
        },

      /* ===================================================
         QR - LOOKUP
      =================================================== */

      lookupQR:
        async (qrValue) => {
          if (!token) {
            return {
              ok: false,
              error:
                "Authentication token is missing.",
            };
          }

          if (!qrValue) {
            return {
              ok: false,
              error:
                "QR value is required.",
            };
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/qr-codes/lookup?value=${encodeURIComponent(
                  qrValue
                )}`,
                {
                  method: "GET",

                  headers:
                    authHeaders(),
                }
              );

            const data =
              await parseResponse(
                response
              );

            if (!response.ok) {
              return {
                ok: false,
                error:
                  data.error ||
                  data.message ||
                  "QR code not found.",
              };
            }

            return {
              ok: true,
              qr: data,
            };
          } catch (error) {
            console.error(
              "QR lookup error:",
              error
            );

            return {
              ok: false,
              error:
                "Unable to connect to QR lookup API.",
            };
          }
        },

      /* ===================================================
         QR - GET ONE
      =================================================== */

      getQR:
        async (qrId) => {
          if (!token) {
            return {
              ok: false,
              error:
                "Authentication token is missing.",
            };
          }

          if (!qrId) {
            return {
              ok: false,
              error:
                "QR ID is required.",
            };
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/qr-codes/${encodeURIComponent(
                  qrId
                )}`,
                {
                  method: "GET",

                  headers:
                    authHeaders(),
                }
              );

            const data =
              await parseResponse(
                response
              );

            if (!response.ok) {
              return {
                ok: false,
                error:
                  data.error ||
                  data.message ||
                  "QR code not found.",
              };
            }

            return {
              ok: true,
              qr: data,
            };
          } catch (error) {
            console.error(
              "Get QR error:",
              error
            );

            return {
              ok: false,
              error:
                "Unable to connect to QR API.",
            };
          }
        },

      /* ===================================================
         QR - PRINT
      =================================================== */

      printQR:
        async (qrId) => {
          if (!token) {
            return {
              ok: false,
              error:
                "Authentication token is missing.",
            };
          }

          if (!qrId) {
            return {
              ok: false,
              error:
                "QR ID is required.",
            };
          }

          try {
            const response =
              await fetch(
                `${API_BASE_URL}/qr-codes/${encodeURIComponent(
                  qrId
                )}/print`,
                {
                  method: "GET",

                  headers:
                    authHeaders(),
                }
              );

            const data =
              await parseResponse(
                response
              );

            if (!response.ok) {
              return {
                ok: false,
                error:
                  data.error ||
                  data.message ||
                  "Unable to print QR code.",
              };
            }

            const qr =
              data.item ||
              data.qr_code ||
              data;

            const existingQR =
              state.qrCodes.find(
                (item) =>
                  Number(item.qr_id) ===
                  Number(qrId)
              );

            const postId =
              qr.post_id ??
              existingQR?.post_id;

            const post =
              state.posts.find(
                (item) =>
                  Number(
                    item.backendId
                  ) === Number(postId) ||
                  item.id ===
                    `PST-${String(
                      postId
                    ).padStart(3, "0")}`
              );

            if (post) {
              dispatch({
                type:
                  "SET_PRINT_STATUS",

                payload: {
                  id:
                    post.id,

                  post_id:
                    postId,

                  status:
                    "Printed",

                  printed_by:
                    state.webSession
                      ?.id ||
                    null,

                  printed_at:
                    qr.printed_at ||
                    nowISO(),
                },
              });
            }

            return {
              ok: true,
              qr,
            };
          } catch (error) {
            console.error(
              "QR print error:",
              error
            );

            return {
              ok: false,
              error:
                "Unable to connect to QR print API.",
            };
          }
        },

      /* ===================================================
         LOCAL PRINT STATUS
      =================================================== */

      setPrintStatus: (
        id,
        status
      ) => {
        const post =
          state.posts.find(
            (item) =>
              item.id === id
          );

        dispatch({
          type:
            "SET_PRINT_STATUS",

          payload: {
            id,

            post_id:
              post?.backendId ||
              Number(
                String(id).replace(
                  "PST-",
                  ""
                )
              ),

            status,
          },
        });
      },

      /* ===================================================
         SHIFTS
      =================================================== */

      loadShifts: async () => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/shifts`, {
            method: "GET",
            headers: authHeaders(),
          });

          const data = await parseResponse(response);

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return { ok: false, error: "Session expired. Please log in again." };
          }

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load shifts.",
            };
          }

          const shifts = (Array.isArray(data.items) ? data.items : []).map(
            (shift) => ({
              ...shift,
              id: shift.shift_id,
              name: shift.shift_name,
              startTime: toHHMM(shift.start_time),
              endTime: toHHMM(shift.end_time),
              active: shift.status === "ACTIVE",
            })
          );

          dispatch({ type: "SET_SHIFTS", payload: shifts });

          return { ok: true, shifts };
        } catch (error) {
          console.error("Load shifts error:", error);
          return { ok: false, error: "Unable to connect to Shifts API." };
        }
      },

      createShift: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          shift_name: (data.name || data.shift_name || "").trim(),
          start_time: data.startTime || data.start_time,
          end_time: data.endTime || data.end_time,
        };

        if (!payload.shift_name || !payload.start_time || !payload.end_time) {
          return {
            ok: false,
            error: "Shift name, start time and end time are required.",
          };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/shifts`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to create shift.",
            };
          }

          const shift = {
            ...result,
            id: result.shift_id,
            name: result.shift_name,
            startTime: toHHMM(result.start_time),
            endTime: toHHMM(result.end_time),
            active: result.status === "ACTIVE",
          };

          dispatch({ type: "ADD_SHIFT", payload: shift });

          return { ok: true, shift };
        } catch (error) {
          console.error("Create shift error:", error);
          return { ok: false, error: "Unable to connect to Shifts API." };
        }
      },

      updateShift: async (id, data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {};
        if (data.name !== undefined || data.shift_name !== undefined) {
          payload.shift_name = (data.name ?? data.shift_name ?? "").trim();
        }
        if (data.startTime !== undefined || data.start_time !== undefined) {
          payload.start_time = data.startTime ?? data.start_time;
        }
        if (data.endTime !== undefined || data.end_time !== undefined) {
          payload.end_time = data.endTime ?? data.end_time;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/shifts/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to update shift.",
            };
          }

          dispatch({
            type: "UPDATE_SHIFT",
            payload: {
              id,
              data: {
                ...result,
                name: result.shift_name,
                startTime: toHHMM(result.start_time),
                endTime: toHHMM(result.end_time),
                active: result.status === "ACTIVE",
              },
            },
          });

          return { ok: true, shift: result };
        } catch (error) {
          console.error("Update shift error:", error);
          return { ok: false, error: "Unable to connect to Shifts API." };
        }
      },

      // Active/Inactive toggle for a shift, same pattern as
      // togglePostActive for guard posts - sends the new status as a
      // lowercase string, which the backend's RecordStatus() parses
      // case-insensitively via .upper().
      toggleShiftActive: async (id) => {
        const shift = state.shifts.find((item) => item.id === id);

        if (!shift) {
          return { ok: false, error: "Shift not found." };
        }

        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const newActiveStatus = !shift.active;

        try {
          const response = await fetch(`${API_BASE_URL}/shifts/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({
              status: newActiveStatus ? "active" : "inactive",
            }),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to update shift status.",
            };
          }

          dispatch({
            type: "UPDATE_SHIFT",
            payload: {
              id,
              data: {
                ...result,
                name: result.shift_name,
                startTime: toHHMM(result.start_time),
                endTime: toHHMM(result.end_time),
                active: result.status === "ACTIVE",
              },
            },
          });

          return { ok: true, shift: result };
        } catch (error) {
          console.error("Toggle shift status error:", error);
          return { ok: false, error: "Unable to connect to Shifts API." };
        }
      },

      deleteShift: async (id) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/shifts/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to delete shift.",
            };
          }

          dispatch({ type: "DELETE_SHIFT", payload: { id } });

          return { ok: true };
        } catch (error) {
          console.error("Delete shift error:", error);
          return { ok: false, error: "Unable to connect to Shifts API." };
        }
      },

      /* ===================================================
         SHIFT ASSIGNMENTS
      =================================================== */

      loadShiftAssignments: async (params = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const ticket = ++shiftAssignmentsRequestRef.current;

        try {
          const searchParams = new URLSearchParams();
          if (params.user_id !== undefined) {
            searchParams.set("user_id", String(params.user_id));
          }
          if (params.shift_id !== undefined) {
            searchParams.set("shift_id", String(params.shift_id));
          }
          if (params.assignment_date) {
            searchParams.set("assignment_date", params.assignment_date);
          }
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/shift-assignments${query ? `?${query}` : ""}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return { ok: false, error: "Session expired. Please log in again." };
          }

          if (!response.ok) {
            return {
              ok: false,
              error:
                data.error || data.message || "Unable to load shift assignments.",
            };
          }

          const assignments = (Array.isArray(data.items) ? data.items : []).map(
            (a) => ({ ...a, id: a.assignment_id })
          );

          if (ticket === shiftAssignmentsRequestRef.current) {
            dispatch({ type: "SET_SHIFT_ASSIGNMENTS", payload: assignments });
          }

          return { ok: true, assignments };
        } catch (error) {
          console.error("Load shift assignments error:", error);
          return { ok: false, error: "Unable to connect to Shift Assignments API." };
        }
      },

      createShiftAssignment: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          user_id: data.user_id ?? data.userId,
          shift_id: data.shift_id ?? data.shiftId,
          assignment_date: data.assignment_date ?? data.assignmentDate,
          route_id: data.route_id ?? data.routeId ?? null,
          device_id: data.device_id ?? data.deviceId ?? null,
        };

        if (!payload.user_id || !payload.shift_id || !payload.assignment_date) {
          return {
            ok: false,
            error: "Officer, shift and assignment date are required.",
          };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/shift-assignments`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to create assignment.",
            };
          }

          const assignment = { ...result, id: result.assignment_id };
          dispatch({ type: "ADD_SHIFT_ASSIGNMENT", payload: assignment });

          return { ok: true, assignment };
        } catch (error) {
          console.error("Create shift assignment error:", error);
          return { ok: false, error: "Unable to connect to Shift Assignments API." };
        }
      },

      deleteShiftAssignment: async (id) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/shift-assignments/${id}`,
            { method: "DELETE", headers: authHeaders() }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to delete assignment.",
            };
          }

          dispatch({ type: "DELETE_SHIFT_ASSIGNMENT", payload: { id } });

          return { ok: true };
        } catch (error) {
          console.error("Delete shift assignment error:", error);
          return { ok: false, error: "Unable to connect to Shift Assignments API." };
        }
      },

      /* ===================================================
         ROUTES
      =================================================== */

      loadRoutes: async () => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/routes`, {
            method: "GET",
            headers: authHeaders(),
          });

          const data = await parseResponse(response);

          if (response.status === 401) {
            dispatch({ type: "WEB_LOGOUT" });
            return { ok: false, error: "Session expired. Please log in again." };
          }

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load routes.",
            };
          }

          const routes = (Array.isArray(data.items) ? data.items : []).map(
            (route) => ({
              ...route,
              id: route.route_id,
              name: route.route_name,
              active: route.status === "ACTIVE",
            })
          );

          dispatch({ type: "SET_ROUTES", payload: routes });

          return { ok: true, routes };
        } catch (error) {
          console.error("Load routes error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      createRoute: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          route_name: (data.name || data.route_name || "").trim(),
          enforce_sequence: Boolean(data.enforceSequence ?? data.enforce_sequence),
        };

        if (!payload.route_name) {
          return { ok: false, error: "Route name is required." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/routes`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to create route.",
            };
          }

          const route = {
            ...result,
            id: result.route_id,
            name: result.route_name,
            active: result.status === "ACTIVE",
          };

          dispatch({ type: "ADD_ROUTE", payload: route });

          return { ok: true, route };
        } catch (error) {
          console.error("Create route error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      updateRoute: async (id, data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {};
        if (data.name !== undefined || data.route_name !== undefined) {
          payload.route_name = (data.name ?? data.route_name ?? "").trim();
        }
        if (data.enforceSequence !== undefined || data.enforce_sequence !== undefined) {
          payload.enforce_sequence = Boolean(
            data.enforceSequence ?? data.enforce_sequence
          );
        }
        if (data.status !== undefined) {
          payload.status = data.status;
        }

        try {
          const response = await fetch(`${API_BASE_URL}/routes/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to update route.",
            };
          }

          dispatch({
            type: "UPDATE_ROUTE",
            payload: {
              id,
              data: {
                ...result,
                name: result.route_name,
                active: result.status === "ACTIVE",
              },
            },
          });

          return { ok: true, route: result };
        } catch (error) {
          console.error("Update route error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      // Active/Inactive toggle, same pattern as togglePostActive/toggleShiftActive.
      toggleRouteActive: async (id) => {
        const route = state.routes.find((item) => item.id === id);

        if (!route) {
          return { ok: false, error: "Route not found." };
        }

        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const newActiveStatus = !route.active;

        try {
          const response = await fetch(`${API_BASE_URL}/routes/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify({
              status: newActiveStatus ? "active" : "inactive",
            }),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to update route status.",
            };
          }

          dispatch({
            type: "UPDATE_ROUTE",
            payload: {
              id,
              data: {
                ...result,
                name: result.route_name,
                active: result.status === "ACTIVE",
              },
            },
          });

          return { ok: true, route: result };
        } catch (error) {
          console.error("Toggle route status error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      /* ===================================================
         ROUTE POSTS
      =================================================== */

      loadRoutePosts: async (routeId) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/routes/${routeId}/posts`, {
            method: "GET",
            headers: authHeaders(),
          });

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load route posts.",
            };
          }

          const items = (Array.isArray(data.items) ? data.items : []).map((rp) => ({
            ...rp,
            id: rp.route_post_id,
          }));

          dispatch({
            type: "SET_ROUTE_POSTS",
            payload: { route_id: routeId, items },
          });

          return { ok: true, items };
        } catch (error) {
          console.error("Load route posts error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      addRoutePost: async (routeId, data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          post_id: data.post_id ?? data.postId,
        };
        if (data.expected_offset_mins !== undefined) {
          payload.expected_offset_mins = data.expected_offset_mins;
        }

        if (!payload.post_id) {
          return { ok: false, error: "A guard post is required." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/routes/${routeId}/posts`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to add post to route.",
            };
          }

          const routePost = { ...result, id: result.route_post_id };
          dispatch({ type: "ADD_ROUTE_POST", payload: routePost });

          return { ok: true, routePost };
        } catch (error) {
          console.error("Add route post error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      reorderRoutePosts: async (routeId, order) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/routes/${routeId}/posts/reorder`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify({ order }),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to reorder route posts.",
            };
          }

          const items = (Array.isArray(result.items) ? result.items : []).map(
            (rp) => ({ ...rp, id: rp.route_post_id })
          );

          dispatch({
            type: "SET_ROUTE_POSTS",
            payload: { route_id: routeId, items },
          });

          return { ok: true, items };
        } catch (error) {
          console.error("Reorder route posts error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      removeRoutePost: async (routeId, routePostId) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/routes/${routeId}/posts/${routePostId}`,
            { method: "DELETE", headers: authHeaders() }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to remove post.",
            };
          }

          dispatch({ type: "DELETE_ROUTE_POST", payload: { id: routePostId } });

          return { ok: true };
        } catch (error) {
          console.error("Remove route post error:", error);
          return { ok: false, error: "Unable to connect to Routes API." };
        }
      },

      /* ===================================================
         ROUND SCHEDULES
      =================================================== */

      loadRoundSchedules: async (shiftId) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const ticket =
          (roundSchedulesRequestRef.current[shiftId] || 0) + 1;
        roundSchedulesRequestRef.current[shiftId] = ticket;

        try {
          const response = await fetch(
            `${API_BASE_URL}/round-schedules?shift_id=${shiftId}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load round schedules.",
            };
          }

          const items = (Array.isArray(data.items) ? data.items : []).map((s) => ({
            ...s,
            id: s.schedule_id,
          }));

          // Only apply if this is still the latest request for this
          // specific shift - a slow response to a previously-selected
          // shift could otherwise overwrite the current one's data.
          if (roundSchedulesRequestRef.current[shiftId] === ticket) {
            dispatch({
              type: "SET_ROUND_SCHEDULES",
              payload: { shift_id: shiftId, items },
            });
          }

          return { ok: true, items };
        } catch (error) {
          console.error("Load round schedules error:", error);
          return { ok: false, error: "Unable to connect to Round Schedules API." };
        }
      },

      // Single-schedule lookup, e.g. for showing round_no/scheduled_time
      // on a round instance when the caller has no shift context to load
      // the full per-shift list (see Scan Now). Deliberately does NOT
      // dispatch into the shared roundSchedules state - that state is
      // shift-scoped (see SET_ROUND_SCHEDULES), and mixing in schedules
      // from arbitrary shifts here would break that assumption for the
      // admin screens that rely on it.
      getRoundSchedule: async (scheduleId) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/round-schedules/${scheduleId}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load round schedule.",
            };
          }

          return { ok: true, schedule: { ...data, id: data.schedule_id } };
        } catch (error) {
          console.error("Get round schedule error:", error);
          return { ok: false, error: "Unable to connect to Round Schedules API." };
        }
      },

      createRoundSchedule: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          shift_id: data.shift_id,
          route_id: data.route_id,
          round_no: data.round_no,
          scheduled_time: data.scheduled_time,
          tolerance_minutes: data.tolerance_minutes,
        };

        if (!payload.shift_id || !payload.route_id || !payload.round_no) {
          return {
            ok: false,
            error: "Shift, route and round number are required.",
          };
        }
        if (!payload.scheduled_time) {
          return { ok: false, error: "Scheduled time is required." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/round-schedules`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to create round schedule.",
            };
          }

          const schedule = { ...result, id: result.schedule_id };
          dispatch({ type: "ADD_ROUND_SCHEDULE", payload: schedule });

          return { ok: true, schedule };
        } catch (error) {
          console.error("Create round schedule error:", error);
          return { ok: false, error: "Unable to connect to Round Schedules API." };
        }
      },

      updateRoundSchedule: async (id, data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {};
        if (data.round_no !== undefined) payload.round_no = data.round_no;
        if (data.scheduled_time !== undefined) {
          payload.scheduled_time = data.scheduled_time;
        }
        if (data.tolerance_minutes !== undefined) {
          payload.tolerance_minutes = data.tolerance_minutes;
        }
        if (data.is_active !== undefined) payload.is_active = data.is_active;

        try {
          const response = await fetch(`${API_BASE_URL}/round-schedules/${id}`, {
            method: "PUT",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to update round schedule.",
            };
          }

          dispatch({
            type: "UPDATE_ROUND_SCHEDULE",
            payload: { id, data: result },
          });

          return { ok: true, schedule: result };
        } catch (error) {
          console.error("Update round schedule error:", error);
          return { ok: false, error: "Unable to connect to Round Schedules API." };
        }
      },

      deleteRoundSchedule: async (id) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/round-schedules/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to delete round schedule.",
            };
          }

          dispatch({ type: "DELETE_ROUND_SCHEDULE", payload: { id } });

          return { ok: true };
        } catch (error) {
          console.error("Delete round schedule error:", error);
          return { ok: false, error: "Unable to connect to Round Schedules API." };
        }
      },

      /* ===================================================
         ROUND INSTANCES
      =================================================== */

      loadRoundInstances: async (params = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const ticket = ++roundInstancesRequestRef.current;

        try {
          const searchParams = new URLSearchParams();
          if (params.round_date) {
            searchParams.set("round_date", params.round_date);
          }
          if (params.officer_id !== undefined) {
            searchParams.set("officer_id", String(params.officer_id));
          }
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/v1/round-instances${query ? `?${query}` : ""}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load round instances.",
            };
          }

          const items = (Array.isArray(data.items) ? data.items : []).map((ri) => ({
            ...ri,
            id: ri.round_instance_id,
          }));

          // Only apply this response if no newer request has been
          // issued since - otherwise a slow response to an older
          // reselect could overwrite fresher data.
          if (ticket === roundInstancesRequestRef.current) {
            dispatch({ type: "SET_ROUND_INSTANCES", payload: items });
          }

          return { ok: true, items };
        } catch (error) {
          console.error("Load round instances error:", error);
          return { ok: false, error: "Unable to connect to Round Instances API." };
        }
      },

      createRoundInstance: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          schedule_id: data.schedule_id,
          officer_id: data.officer_id,
          round_date: data.round_date,
        };
        // scheduled_start_time is optional - the backend computes it from
        // the schedule + round_date when omitted.
        if (data.scheduled_start_time) {
          payload.scheduled_start_time = data.scheduled_start_time;
        }

        if (!payload.schedule_id || !payload.officer_id || !payload.round_date) {
          return {
            ok: false,
            error: "A round schedule, officer and date are required.",
          };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/v1/round-instances`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to create round instance.",
            };
          }

          const roundInstance = { ...result, id: result.round_instance_id };
          dispatch({ type: "ADD_ROUND_INSTANCE", payload: roundInstance });

          return { ok: true, roundInstance };
        } catch (error) {
          console.error("Create round instance error:", error);
          return { ok: false, error: "Unable to connect to Round Instances API." };
        }
      },

      deleteRoundInstance: async (id) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/v1/round-instances/${id}`, {
            method: "DELETE",
            headers: authHeaders(),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to delete round instance.",
            };
          }

          dispatch({ type: "DELETE_ROUND_INSTANCE", payload: { id } });

          return { ok: true };
        } catch (error) {
          console.error("Delete round instance error:", error);
          return { ok: false, error: "Unable to connect to Round Instances API." };
        }
      },

      closeRoundInstance: async (id) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/v1/round-instances/${id}/close`,
            { method: "POST", headers: authHeaders() }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error || result.message || "Unable to close round instance.",
            };
          }

          dispatch({
            type: "UPDATE_ROUND_INSTANCE",
            payload: { id, data: result.round_instance },
          });

          return {
            ok: true,
            roundInstance: result.round_instance,
            newExceptions: result.new_exceptions,
          };
        } catch (error) {
          console.error("Close round instance error:", error);
          return { ok: false, error: "Unable to connect to Round Instances API." };
        }
      },

      /* ===================================================
         DEVICE SELF-REGISTRATION (for the Scan Now kiosk)
         ---------------------------------------------------
         The browser/kiosk doing the scanning has no device_id of
         its own. On first scan it generates a random device_code,
         registers it with the backend to get a real device_id,
         and caches it in localStorage together with the owning
         officer. Other officers are refused on this device.
      =================================================== */

      // Synchronous, no network call - used by Scan Now on load to
      // block an officer who isn't this device's owner.
      checkDeviceOwnership: () => checkLocalDeviceOwner(),

      // Drop a cached device_id the backend no longer knows (e.g. DB
      // reset). Keeps device_code, so re-registering maps to the same
      // physical device.
      forgetCachedDeviceId: () => {
        try {
          localStorage.removeItem(DEVICE_ID_KEY);
          localStorage.removeItem(DEVICE_OWNER_KEY);
        } catch {
          // ignore
        }
      },

      getOrRegisterDeviceId: () => {
        if (deviceRegistrationRef.current) {
          return deviceRegistrationRef.current;
        }
        const promise = resolveDeviceId().finally(() => {
          if (deviceRegistrationRef.current === promise) {
            deviceRegistrationRef.current = null;
          }
        });
        deviceRegistrationRef.current = promise;
        return promise;
      },

      /* ===================================================
         SCANS
      =================================================== */

      loadScans: async (params = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const searchParams = new URLSearchParams();
          if (params.post_id !== undefined) {
            searchParams.set("post_id", String(params.post_id));
          }
          if (params.round_instance_id !== undefined) {
            searchParams.set(
              "round_instance_id",
              String(params.round_instance_id)
            );
          }
          if (params.status) {
            searchParams.set("status", params.status);
          }
          if (params.page !== undefined) {
            searchParams.set("page", String(params.page));
          }
          if (params.page_size !== undefined) {
            searchParams.set("page_size", String(params.page_size));
          }
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/scans${query ? `?${query}` : ""}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load scans.",
            };
          }

          const items = (Array.isArray(data.items) ? data.items : []).map(
            (s) => ({ ...s, id: s.scan_id })
          );

          return {
            ok: true,
            items,
            total: data.total ?? items.length,
            page: data.page ?? 1,
            pageSize: data.page_size ?? items.length,
          };
        } catch (error) {
          console.error("Load scans error:", error);
          return { ok: false, error: "Unable to connect to Scans API." };
        }
      },

      /* ===================================================
         EXCEPTIONS
      =================================================== */

      loadExceptions: async (params = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const searchParams = new URLSearchParams();
          if (params.round_instance_id !== undefined) {
            searchParams.set(
              "round_instance_id",
              String(params.round_instance_id)
            );
          }
          if (params.round_date) {
            searchParams.set("round_date", params.round_date);
          }
          if (params.exception_type) {
            searchParams.set("exception_type", params.exception_type);
          }
          if (params.notified !== undefined) {
            searchParams.set("notified", String(params.notified));
          }
          if (params.page !== undefined) {
            searchParams.set("page", String(params.page));
          }
          if (params.page_size !== undefined) {
            searchParams.set("page_size", String(params.page_size));
          }
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/exceptions${query ? `?${query}` : ""}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load exceptions.",
            };
          }

          const items = (Array.isArray(data.items) ? data.items : []).map(
            (e) => ({ ...e, id: e.exception_id })
          );

          return {
            ok: true,
            items,
            total: data.total ?? items.length,
            page: data.page ?? 1,
            pageSize: data.page_size ?? items.length,
          };
        } catch (error) {
          console.error("Load exceptions error:", error);
          return { ok: false, error: "Unable to connect to Exceptions API." };
        }
      },

      /* ===================================================
         REPORTS
         ---------------------------------------------------
         reports_bp is registered under /api/reports (not
         /api/v1/... or the plain /api/... every other blueprint
         uses) - see reports.py.
      =================================================== */

      loadReport: async (reportType, params = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        try {
          const searchParams = new URLSearchParams();
          Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
              searchParams.set(key, String(value));
            }
          });
          const query = searchParams.toString();

          const response = await fetch(
            `${API_BASE_URL}/reports/${reportType}${query ? `?${query}` : ""}`,
            { method: "GET", headers: authHeaders() }
          );

          const data = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: data.error || data.message || "Unable to load report.",
            };
          }

          return { ok: true, data };
        } catch (error) {
          console.error("Load report error:", error);
          return { ok: false, error: "Unable to connect to Reports API." };
        }
      },

      createScan: async (data = {}) => {
        if (!token) {
          return { ok: false, error: "Authentication token is missing." };
        }

        const payload = {
          round_instance_id: data.round_instance_id,
          qr_value: data.qr_value,
          device_id: data.device_id,
        };
        // post_id is optional - the backend resolves it from qr_value
        // when omitted.
        if (data.post_id !== undefined) {
          payload.post_id = data.post_id;
        }
        if (data.gps_lat !== undefined) payload.gps_lat = data.gps_lat;
        if (data.gps_lng !== undefined) payload.gps_lng = data.gps_lng;

        if (!payload.round_instance_id || !payload.qr_value || !payload.device_id) {
          return {
            ok: false,
            error: "round_instance_id, qr_value and device_id are required.",
          };
        }

        try {
          const response = await fetch(`${API_BASE_URL}/scans`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload),
          });

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error: result.error || result.message || "Unable to submit scan.",
            };
          }

          return { ok: true, scan: result };
        } catch (error) {
          console.error("Create scan error:", error);
          return { ok: false, error: "Unable to connect to Scans API." };
        }
      },

      /* ===================================================
         OFFICERS
         ---------------------------------------------------
         Officers are stored as users in the backend. Existing
         action names are kept so the Officer UI does not need
         to change.
      =================================================== */

      addOfficer: async (data = {}) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        const roleId =
          data.role_id ??
          data.roleId ??
          OFFICER_ROLE_NAME_TO_ID[data.role] ??
          OFFICER_ROLE_NAME_TO_ID[data.role_name] ??
          null;

        const payload = {
          employee_code:
            data.employee_code ??
            data.employeeCode ??
            nextSequentialId(
              state.officers.map((officer) => officer.id),
              "OFC"
            ),

          full_name:
            data.full_name ??
            data.fullName ??
            data.name ??
            "",

          role_id: roleId,

          username:
            data.username ??
            data.name ??
            "",

          password:
            data.password ??
            data.pin ??
            "12345678",

          phone:
            data.phone ??
            data.contact ??
            null,

          email:
            data.email ??
            null,

          status: String(
            data.status ?? "active"
          ).toLowerCase(),
        };

        /* Keep the existing Officer form compatible even when
           the backend does not have Shift / Device columns yet. */
        const localOfficerFields = {
          shift:
            data.shift ??
            data.shift_name ??
            "",
          shift_name:
            data.shift_name ??
            data.shift ??
            "",
          deviceId:
            data.deviceId ??
            data.device_id ??
            "",
          device_id:
            data.device_id ??
            data.deviceId ??
            "",
          contact:
            data.contact ??
            data.phone ??
            "",
        };

        try {
          /*
           * The existing backend user API requires role_id. If the
           * Officer screen does not provide one, preserve the
           * existing frontend behavior instead of failing the Add
           * Officer action just because optional backend fields are
           * unavailable.
           */
          if (
            !payload.full_name ||
            !payload.role_id
          ) {
            const localOfficer = mapBackendUserToOfficerShape({
              ...data,
              user_id:
                nextSequentialId(
                  state.officers.map(
                    (officer) => officer.id
                  ),
                  "OFC"
                ),
              status: payload.status,
              ...localOfficerFields,
            });

            dispatch({
              type: "ADD_OFFICER",
              payload: {
                ...localOfficer,
                ...localOfficerFields,
              },
            });

            return {
              ok: true,
              officer: localOfficer,
              localOnly: true,
            };
          }

          const response = await fetch(
            `${API_BASE_URL}/v1/users`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify(payload),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to create officer.",
            };
          }

          const backendUser =
            result.item ||
            result.user ||
            result;

          const createdOfficer = {
            ...mapBackendUserToOfficerShape(
              backendUser
            ),
            ...localOfficerFields,
            role:
              mapBackendUserToOfficerShape(backendUser).role ||
              data.role ||
              "",
            role_name:
              mapBackendUserToOfficerShape(backendUser).role_name ||
              data.role ||
              "",
          };

          dispatch({
            type: "ADD_OFFICER",
            payload: createdOfficer,
          });

          return {
            ok: true,
            officer: createdOfficer,
          };
        } catch (error) {
          console.error(
            "Create officer error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Officers API.",
          };
        }
      },

      updateOfficer: async (
        id,
        data = {}
      ) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        if (!id) {
          return {
            ok: false,
            error: "Officer ID is required.",
          };
        }

        const existingOfficer =
          state.officers.find(
            (officer) =>
              String(officer.id) === String(id)
          ) || {};

        const payload = {};

        if (
          data.full_name !== undefined ||
          data.fullName !== undefined ||
          data.name !== undefined
        ) {
          payload.full_name =
            data.full_name ??
            data.fullName ??
            data.name;
        }

        if (
          data.employee_code !== undefined ||
          data.employeeCode !== undefined
        ) {
          payload.employee_code =
            data.employee_code ??
            data.employeeCode;
        }

        if (
          data.role_id !== undefined ||
          data.roleId !== undefined ||
          data.role !== undefined ||
          data.role_name !== undefined
        ) {
          payload.role_id =
            data.role_id ??
            data.roleId ??
            OFFICER_ROLE_NAME_TO_ID[data.role] ??
            OFFICER_ROLE_NAME_TO_ID[data.role_name] ??
            existingOfficer.role_id ??
            existingOfficer.roleId;
        }

        if (data.username !== undefined) {
          payload.username = data.username;
        }

        if (
          data.phone !== undefined ||
          data.contact !== undefined
        ) {
          payload.phone =
            data.phone ??
            data.contact;
        }

        if (data.email !== undefined) {
          payload.email = data.email;
        }

        if (data.status !== undefined) {
          payload.status = String(
            data.status
          ).toLowerCase();
        }

        const localOfficerFields = {
          shift:
            data.shift ??
            data.shift_name ??
            existingOfficer.shift ??
            existingOfficer.shift_name ??
            "",
          shift_name:
            data.shift_name ??
            data.shift ??
            existingOfficer.shift_name ??
            existingOfficer.shift ??
            "",
          deviceId:
            data.deviceId ??
            data.device_id ??
            existingOfficer.deviceId ??
            existingOfficer.device_id ??
            "",
          device_id:
            data.device_id ??
            data.deviceId ??
            existingOfficer.device_id ??
            existingOfficer.deviceId ??
            "",
          contact:
            data.contact ??
            data.phone ??
            existingOfficer.contact ??
            existingOfficer.phone ??
            "",
        };

        /*
         * If the backend has no Shift / Device support, those values
         * still remain in frontend state and localStorage. We only
         * send fields that the existing Users API already supports.
         */
        try {
          const response = await fetch(
            `${API_BASE_URL}/v1/users/${encodeURIComponent(
              id
            )}`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify(payload),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to update officer.",
            };
          }

          const backendUser =
            result.item ||
            result.user ||
            result;

          const mappedOfficer =
            mapBackendUserToOfficerShape(
              backendUser
            );

          const updatedOfficer = {
            ...existingOfficer,
            ...mappedOfficer,
            ...data,
            ...localOfficerFields,
            id,
            user_id:
              mappedOfficer.user_id ??
              existingOfficer.user_id ??
              id,
            name:
              mappedOfficer.name ||
              data.name ||
              existingOfficer.name ||
              "",
            role:
              data.role ||
              mappedOfficer.role ||
              existingOfficer.role ||
              "",
            role_name:
              data.role ||
              mappedOfficer.role_name ||
              existingOfficer.role_name ||
              "",
            frontendRole:
              data.role ??
              existingOfficer.frontendRole ??
              "",
            phone:
              mappedOfficer.phone ||
              data.phone ||
              data.contact ||
              existingOfficer.phone ||
              existingOfficer.contact ||
              "",
            contact:
              localOfficerFields.contact,
            status:
              data.status !== undefined
                ? String(data.status)
                    .toLowerCase()
                    .replace(/^./, (char) => char.toUpperCase())
                : mappedOfficer.status ||
                  existingOfficer.status ||
                  "Active",
          };

          dispatch({
            type: "UPDATE_OFFICER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          dispatch({
            type: "UPDATE_USER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          return {
            ok: true,
            officer: updatedOfficer,
          };
        } catch (error) {
          console.error(
            "Update officer error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Officers API.",
          };
        }
      },

      activateOfficer: async (id) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        if (!id) {
          return {
            ok: false,
            error: "Officer ID is required.",
          };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/v1/users/${encodeURIComponent(
              id
            )}`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify({
                status: "active",
              }),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to activate officer.",
            };
          }

          const backendUser =
            result.item ||
            result.user ||
            result;

          const existingOfficer =
            state.officers.find(
              (officer) =>
                String(officer.id) === String(id)
            ) || {};

          const updatedOfficer = {
            ...existingOfficer,
            ...mapBackendUserToOfficerShape(
              backendUser
            ),
            id,
            status: "Active",
            shift:
              mapBackendUserToOfficerShape(backendUser).shift ||
              existingOfficer.shift ||
              "",
            shift_name:
              mapBackendUserToOfficerShape(backendUser).shift_name ||
              existingOfficer.shift_name ||
              "",
            deviceId:
              mapBackendUserToOfficerShape(backendUser).deviceId ||
              existingOfficer.deviceId ||
              "",
            device_id:
              mapBackendUserToOfficerShape(backendUser).device_id ||
              existingOfficer.device_id ||
              "",
            contact:
              mapBackendUserToOfficerShape(backendUser).contact ||
              existingOfficer.contact ||
              existingOfficer.phone ||
              "",
          };

          dispatch({
            type: "UPDATE_OFFICER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          dispatch({
            type: "UPDATE_USER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          return {
            ok: true,
            officer: updatedOfficer,
          };
        } catch (error) {
          console.error(
            "Activate officer error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Officers API.",
          };
        }
      },

      deactivateOfficer: async (id) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        if (!id) {
          return {
            ok: false,
            error: "Officer ID is required.",
          };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/v1/users/${encodeURIComponent(
              id
            )}`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify({
                status: "inactive",
              }),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to deactivate officer.",
            };
          }

          const backendUser =
            result.item ||
            result.user ||
            result;

          const existingOfficer =
            state.officers.find(
              (officer) =>
                String(officer.id) === String(id)
            ) || {};

          const mappedOfficer =
            mapBackendUserToOfficerShape(
              backendUser
            );

          const updatedOfficer = {
            ...existingOfficer,
            ...mappedOfficer,
            id,
            status: "Inactive",
            shift:
              mappedOfficer.shift ||
              existingOfficer.shift ||
              "",
            shift_name:
              mappedOfficer.shift_name ||
              existingOfficer.shift_name ||
              "",
            deviceId:
              mappedOfficer.deviceId ||
              existingOfficer.deviceId ||
              "",
            device_id:
              mappedOfficer.device_id ||
              existingOfficer.device_id ||
              "",
            contact:
              mappedOfficer.contact ||
              existingOfficer.contact ||
              existingOfficer.phone ||
              "",
          };

          dispatch({
            type: "UPDATE_OFFICER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          dispatch({
            type: "UPDATE_USER",
            payload: {
              id,
              data: updatedOfficer,
            },
          });

          return {
            ok: true,
            officer: updatedOfficer,
          };
        } catch (error) {
          console.error(
            "Deactivate officer error:",
            error
          );

          return {
            ok: false,
            error:
              "Unable to connect to Officers API.",
          };
        }
      },

      /*
       * Existing "Remove" calls are intentionally mapped to
       * deactivation. The officer is never deleted.
       */
      deleteOfficer: async (id) => {
        if (!token) {
          return {
            ok: false,
            error: "Authentication token is missing.",
          };
        }

        if (!id) {
          return {
            ok: false,
            error: "Officer ID is required.",
          };
        }

        try {
          const response = await fetch(
            `${API_BASE_URL}/v1/users/${encodeURIComponent(id)}`,
            {
              method: "PUT",
              headers: authHeaders(),
              body: JSON.stringify({ status: "inactive" }),
            }
          );

          const result = await parseResponse(response);

          if (!response.ok) {
            return {
              ok: false,
              error:
                result.error ||
                result.message ||
                "Unable to deactivate officer.",
            };
          }

          const backendUser =
            result.item || result.user || result;

          const existingOfficer =
            state.officers.find(
              (officer) => String(officer.id) === String(id)
            ) || {};

          const mappedOfficer =
            mapBackendUserToOfficerShape(backendUser);

          const updatedOfficer = {
            ...existingOfficer,
            ...mappedOfficer,
            id,
            status: "Inactive",
            shift: mappedOfficer.shift || existingOfficer.shift || "",
            deviceId: mappedOfficer.deviceId || existingOfficer.deviceId || "",
            contact: mappedOfficer.contact || existingOfficer.contact || existingOfficer.phone || "",
          };

          dispatch({
            type: "UPDATE_OFFICER",
            payload: { id, data: updatedOfficer },
          });

          dispatch({
            type: "UPDATE_USER",
            payload: { id, data: updatedOfficer },
          });

          return { ok: true, officer: updatedOfficer };
        } catch (error) {
          console.error("Delete officer error:", error);
          return {
            ok: false,
            error: "Unable to connect to Officers API.",
          };
        }
      },

      /* ===================================================
         ROUNDS
      =================================================== */

      addRound: (data) =>
        dispatch({
          type: "ADD_ROUND",

          payload: {
            id:
              generateId(
                "RND"
              ).toUpperCase(),

            routePostIds: [],

            officerIds: [],

            activeDays: [],

            ...data,
          },
        }),

      updateRound: (
        id,
        data
      ) =>
        dispatch({
          type:
            "UPDATE_ROUND",

          payload: {
            id,
            data,
          },
        }),

      deleteRound: (
        id
      ) =>
        dispatch({
          type:
            "DELETE_ROUND",

          payload: {
            id,
          },
        }),

      moveRoundPost: (
        roundId,
        fromIndex,
        toIndex
      ) =>
        dispatch({
          type:
            "MOVE_ROUND_POST",

          payload: {
            roundId,
            fromIndex,
            toIndex,
          },
        }),

      /* ===================================================
         START ROUND SESSION
      =================================================== */

      startSession: (
        roundId,
        officerId
      ) => {
        const round =
          state.rounds.find(
            (item) =>
              item.id ===
              roundId
          );

        if (!round) {
          return {
            ok: false,
            error:
              "Round not found.",
          };
        }

        const routePostIds =
          round.routePostIds ||
          [];

        const stops =
          routePostIds.length;

        const perStopMinutes =
          stops > 1
            ? Math.max(
                3,
                Math.round(
                  Number(
                    round.frequencyMinutes ||
                      0
                  ) /
                    (stops - 1)
                )
              )
            : Number(
                round.frequencyMinutes ||
                  0
              );

        const session = {
          id:
            generateId(
              "SESSION"
            ).toUpperCase(),

          roundId,

          officerId,

          startedAt:
            nowISO(),

          endedAt: null,

          status:
            "in_progress",

          currentIndex: 0,

          perStopMinutes,

          scans: [],
        };

        dispatch({
          type:
            "START_SESSION",

          payload:
            session,
        });

        return {
          ok: true,
          session,
        };
      },

      /* ===================================================
         RECORD SCAN
      =================================================== */

      recordScan: (
        sessionId,
        scannedPostId,
        remark = "",
        photo = null,
        actualTimeOverride = null
      ) => {
        const session =
          state.sessions.find(
            (item) =>
              item.id ===
              sessionId
          );

        if (
          !session ||
          session.status !==
            "in_progress"
        ) {
          return {
            ok: false,
            error:
              "Round is not active.",
          };
        }

        const round =
          state.rounds.find(
            (item) =>
              item.id ===
              session.roundId
          );

        if (!round) {
          return {
            ok: false,
            error:
              "Round not found.",
          };
        }

        const routePostIds =
          round.routePostIds ||
          [];

        const expectedPostId =
          routePostIds[
            session.currentIndex
          ];

        if (
          expectedPostId ===
          undefined
        ) {
          return {
            ok: false,
            error:
              "No more posts are available in this round.",
          };
        }

        const scheduledTime =
          new Date(
            new Date(
              session.startedAt
            ).getTime() +
              session.currentIndex *
                session.perStopMinutes *
                60000
          ).toISOString();

        const actualTime =
          actualTimeOverride ||
          nowISO();

        const inSequence =
          scannedPostId ===
          expectedPostId;

        const {
          status: timeStatus,
          delayMinutes,
        } =
          classifyScan(
            scheduledTime,
            actualTime,
            round.lateThresholdMinutes
          );

        const status =
          !inSequence
            ? "out_of_sequence"
            : timeStatus;

        const scan = {
          postId:
            scannedPostId,

          expectedPostId,

          scheduledTime,

          actualTime,

          status,

          remark,

          photo,
        };

        let alert = null;

        if (
          status !==
          "on_time"
        ) {
          alert = {
            id:
              generateId(
                "ALT"
              ).toUpperCase(),

            type:
              status,

            postId:
              scannedPostId,

            officerId:
              session.officerId,

            roundId:
              session.roundId,

            scheduledTime,

            actualTime,

            delayMinutes,

            status: "open",

            remark,

            createdAt:
              actualTime,
          };
        }

        dispatch({
          type:
            "RECORD_SCAN",

          payload: {
            sessionId,

            scan,

            alert,
          },
        });

        return {
          ok: true,

          scan,

          alert,

          isLastStop:
            session.currentIndex +
              1 >=
            routePostIds.length,
        };
      },

      /* ===================================================
         COMPLETE SESSION
      =================================================== */

      completeSession: (
        sessionId
      ) => {
        const session =
          state.sessions.find(
            (item) =>
              item.id ===
              sessionId
          );

        if (!session) {
          return {
            ok: false,
            error:
              "Session not found.",
          };
        }

        const round =
          state.rounds.find(
            (item) =>
              item.id ===
              session.roundId
          );

        if (!round) {
          return {
            ok: false,
            error:
              "Round not found.",
          };
        }

        const routePostIds =
          round.routePostIds ||
          [];

        const remainingIds =
          routePostIds.slice(
            session.currentIndex
          );

        const now =
          nowISO();

        const missedScans =
          remainingIds.map(
            (postId, index) => ({
              postId,

              expectedPostId:
                postId,

              scheduledTime:
                new Date(
                  new Date(
                    session.startedAt
                  ).getTime() +
                    (session.currentIndex +
                      index) *
                      session.perStopMinutes *
                      60000
                ).toISOString(),

              actualTime: null,

              status:
                "missed",

              remark: "",

              photo: null,
            })
          );

        const missedAlerts =
          missedScans.map(
            (scan) => ({
              id:
                generateId(
                  "ALT"
                ).toUpperCase(),

              type:
                "missed",

              postId:
                scan.postId,

              officerId:
                session.officerId,

              roundId:
                session.roundId,

              scheduledTime:
                scan.scheduledTime,

              actualTime: null,

              status:
                "open",

              remark: "",

              createdAt:
                now,
            })
          );

        dispatch({
          type:
            "COMPLETE_SESSION",

          payload: {
            sessionId,

            missedScans,

            missedAlerts,
          },
        });

        return {
          ok: true,

          missedCount:
            missedScans.length,
        };
      },

      /* ===================================================
         EMERGENCY ALERT
      =================================================== */

      sendEmergencyAlert: (
        category,
        context = {}
      ) =>
        dispatch({
          type:
            "ADD_ALERT",

          payload: {
            id:
              generateId(
                "ALT"
              ).toUpperCase(),

            type:
              "emergency",

            category,

            postId:
              context.postId ||
              null,

            officerId:
              context.officerId ||
              null,

            roundId:
              context.roundId ||
              null,

            scheduledTime:
              null,

            actualTime:
              nowISO(),

            status:
              "open",

            remark:
              category,

            createdAt:
              nowISO(),
          },
        }),

      acknowledgeAlert: (
        id
      ) =>
        dispatch({
          type:
            "ACK_ALERT",

          payload: {
            id,
          },
        }),

      resolveAlert: (
        id
      ) =>
        dispatch({
          type:
            "RESOLVE_ALERT",

          payload: {
            id,
          },
        }),

      /* ===================================================
         PERMISSIONS
      =================================================== */

      updatePermission: (
        role,
        module,
        field,
        value
      ) =>
        dispatch({
          type:
            "UPDATE_PERMISSION",

          payload: {
            role,
            module,
            field,
            value,
          },
        }),

      /* ===================================================
         SETTINGS
      =================================================== */

      updateSettings: (
        data
      ) =>
        dispatch({
          type:
            "UPDATE_SETTINGS",

          payload:
            data,
        }),

      /* ===================================================
         DEVICE SYNC
      =================================================== */

      syncDevice: (
        deviceId
      ) =>
        dispatch({
          type:
            "SYNC_DEVICE",

          payload: {
            deviceId,
          },
        }),
    };
  }, [state]);

  /* =======================================================
     PROVIDERS
  ======================================================= */

  return (
    <DataStateContext.Provider
      value={state}
    >
      <DataActionsContext.Provider
        value={actions}
      >
        {children}
      </DataActionsContext.Provider>
    </DataStateContext.Provider>
  );
}

/* =========================================================
   HOOKS
========================================================= */

export function useDataState() {
  const context =
    useContext(
      DataStateContext
    );

  if (!context) {
    throw new Error(
      "useDataState must be used within DataProvider"
    );
  }

  return context;
}

export function useDataActions() {
  const context =
    useContext(
      DataActionsContext
    );

  if (!context) {
    throw new Error(
      "useDataActions must be used within DataProvider"
    );
  }

  return context;
}

export function useData() {
  const state =
    useDataState();

  const actions =
    useDataActions();

  return {
    ...state,
    actions,
  };
}

/* =========================================================
   DERIVED SELECTORS
========================================================= */

export function usePostMap() {
  const { posts } =
    useDataState();

  return useMemo(
    () =>
      Object.fromEntries(
        posts.map((post) => [
          post.id,
          post,
        ])
      ),
    [posts]
  );
}

export function useOfficerMap() {
  const { officers } =
    useDataState();

  return useMemo(
    () =>
      Object.fromEntries(
        officers.map((officer) => [
          officer.id,
          officer,
        ])
      ),
    [officers]
  );
}

export function useRoundMap() {
  const { rounds } =
    useDataState();

  return useMemo(
    () =>
      Object.fromEntries(
        rounds.map((round) => [
          round.id,
          round,
        ])
      ),
    [rounds]
  );
}

/* =========================================================
   EXPORT
========================================================= */

export {
  minutesBetween,
  API_BASE_URL,
};