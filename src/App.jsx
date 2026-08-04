import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import AppShell from "./components/AppShell.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Landing from "./pages/Landing.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import StyleTest from "./pages/StyleTest.jsx";
import StyleResult from "./pages/StyleResult.jsx";
import Friends from "./pages/Friends.jsx";
import Schedule from "./pages/Schedule.jsx";
import Records from "./pages/Records.jsx";
import Community from "./pages/Community.jsx";
import Profile from "./pages/Profile.jsx";

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/style-test" element={<StyleTest />} />
            <Route path="/style-result" element={<StyleResult />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/records" element={<Records />} />
            <Route path="/community" element={<Community />} />
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
