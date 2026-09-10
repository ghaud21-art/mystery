import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import AdminRoute from "./components/AdminRoute.jsx";
import Landing from "./pages/Landing.jsx";
import Terms from "./pages/Terms.jsx";
import Privacy from "./pages/Privacy.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Agenda from "./pages/Agenda.jsx";
import StyleTest from "./pages/StyleTest.jsx";
import StyleResult from "./pages/StyleResult.jsx";
import Friends from "./pages/Friends.jsx";
import Schedule from "./pages/Schedule.jsx";
import GroupDetail from "./pages/GroupDetail.jsx";
import Records from "./pages/Records.jsx";
import ScenarioSearch from "./pages/ScenarioSearch.jsx";
import Profile from "./pages/Profile.jsx";
import Admin from "./pages/Admin.jsx";
import CaseHub from "./pages/case/CaseHub.jsx";
import CaseLanding from "./pages/case/CaseLanding.jsx";
import CasePlay from "./pages/case/CasePlay.jsx";
import CaseResult from "./pages/case/CaseResult.jsx";
import AdminCaseSeasons from "./pages/case/AdminCaseSeasons.jsx";
import AdminCaseSeasonEdit from "./pages/case/AdminCaseSeasonEdit.jsx";
import AdminCaseStats from "./pages/case/AdminCaseStats.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<Privacy />} />
        {/* 공유 링크로 비로그인 사용자도 랜딩 카피를 볼 수 있도록 AppShell/ProtectedRoute 밖에 둠 */}
        <Route path="/case/:seasonId" element={<CaseLanding />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/style-test" element={<StyleTest />} />
            <Route path="/style-result" element={<StyleResult />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/schedule/:groupId" element={<GroupDetail />} />
            <Route path="/records" element={<Records />} />
            <Route path="/scenarios" element={<ScenarioSearch />} />
            <Route path="/case" element={<CaseHub />} />
            <Route path="/case/:seasonId/play" element={<CasePlay />} />
            <Route path="/case/:seasonId/result" element={<CaseResult />} />
            <Route path="/profile" element={<Profile />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<Admin />} />
              <Route path="/admin/case" element={<AdminCaseSeasons />} />
              <Route path="/admin/case/:seasonId" element={<AdminCaseSeasonEdit />} />
              <Route path="/admin/case/:seasonId/stats" element={<AdminCaseStats />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
