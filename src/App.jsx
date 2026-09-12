import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DataProvider } from "./context/DataContext";

import Login from "./pages/web/Login";
import Dashboard from "./pages/web/Dashboard";
import LiveMonitoring from "./pages/web/LiveMonitoring";
import GuardPosts from "./pages/web/GuardPosts";
import QRManagement from "./pages/web/QRManagement";
import Officers from "./pages/web/Officers";
import RoundsRoutes from "./pages/web/RoundsRoutes";
import RouteManagement from "./pages/web/RouteManagement";
import ShiftManagement from "./pages/web/ShiftManagement";
import Alerts from "./pages/web/Alerts";
import Reports from "./pages/web/Reports";
import AuditTrail from "./pages/web/AuditTrail";
import UserRoles from "./pages/web/UserRoles";
import Settings from "./pages/web/Settings";

import MobileLogin from "./pages/mobile/MobileLogin";
import RoundSelection from "./pages/mobile/RoundSelection";
import QRScan from "./pages/mobile/QRScan";
import PostConfirmation from "./pages/mobile/PostConfirmation";
import RoundProgress from "./pages/mobile/RoundProgress";
import RoundCompletion from "./pages/mobile/RoundCompletion";
import SyncStatus from "./pages/mobile/SyncStatus";
import Emergency from "./pages/mobile/Emergency";

export default function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/web/login" replace />} />

          {/* Web control-room / admin dashboard */}
          <Route path="/web/login" element={<Login />} />
          <Route path="/web/dashboard" element={<Dashboard />} />
          <Route path="/web/monitoring" element={<LiveMonitoring />} />
          <Route path="/web/posts" element={<GuardPosts />} />
          <Route path="/web/qr" element={<QRManagement />} />
          <Route path="/web/officers" element={<Officers />} />
          <Route path="/web/rounds" element={<RoundsRoutes />} />
          <Route path="/web/routes" element={<RouteManagement />} />
          <Route path="/web/shifts" element={<ShiftManagement />} />
          <Route path="/web/alerts" element={<Alerts />} />
          <Route path="/web/reports" element={<Reports />} />
          <Route path="/web/audit-trail" element={<AuditTrail />} />
          <Route path="/web/roles" element={<UserRoles />} />
          <Route path="/web/settings" element={<Settings />} />

          {/* Handheld scanner app */}
          <Route path="/mobile/login" element={<MobileLogin />} />
          <Route path="/mobile/rounds" element={<RoundSelection />} />
          <Route path="/mobile/scan" element={<QRScan />} />
          <Route path="/mobile/confirm" element={<PostConfirmation />} />
          <Route path="/mobile/progress" element={<RoundProgress />} />
          <Route path="/mobile/completion" element={<RoundCompletion />} />
          <Route path="/mobile/sync" element={<SyncStatus />} />
          <Route path="/mobile/emergency" element={<Emergency />} />

          <Route path="*" element={<Navigate to="/web/login" replace />} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}