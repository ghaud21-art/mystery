import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-sub)" }}>
        불러오는 중…
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return <Outlet />;
}
