import { Link, Navigate, useLocation } from "react-router-dom";
import { ArrowLeft, Leaf, ShieldAlert } from "lucide-react";
import { useAuth } from "./AuthContext.jsx";

function SessionLoader() {
  return (
    <main className="k-session-page">
      <div className="k-session-card">
        <span className="k-session-mark" aria-hidden="true"><Leaf size={24} /></span>
        <span className="k-spinner" aria-hidden="true" />
        <p>Checking your session…</p>
      </div>
    </main>
  );
}

function AccessDenied() {
  return (
    <main className="k-session-page">
      <div className="k-session-card k-session-card-wide">
        <span className="k-session-mark k-session-mark-alert" aria-hidden="true">
          <ShieldAlert size={24} />
        </span>
        <p className="k-eyebrow">ACCESS RESTRICTED</p>
        <h1>This workspace is for kitchen staff.</h1>
        <p className="k-muted-text">
          Your account does not have access to the kitchen workspace. If you believe this is a
          mistake, contact your AnnaChakra administrator.
        </p>
        <Link className="k-btn k-btn-secondary" to="/">
          <ArrowLeft size={16} /> Back to AnnaChakra
        </Link>
      </div>
    </main>
  );
}

export default function ProtectedRoute({ roles, children }) {
  const { user, loading, sessionExpired } = useAuth();
  const location = useLocation();

  if (loading) return <SessionLoader />;
  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}`, expired: sessionExpired }}
      />
    );
  }
  if (roles && !roles.includes(user.role)) return <AccessDenied />;

  return children;
}
