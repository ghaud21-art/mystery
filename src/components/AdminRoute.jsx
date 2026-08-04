import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function AdminRoute() {
  const { profile } = useAuth();
  if (!profile?.isAdmin) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
