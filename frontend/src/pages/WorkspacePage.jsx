import { ArrowRight, Leaf, LogOut } from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthRole, getAuthToken } from "../services/authStorage";
import "./AuthPages.css";

const workspaceNames = {
  KITCHEN_STAFF: "Kitchen",
  NGO_MANAGER: "NGO",
  ADMIN: "Admin",
};

function WorkspacePage({ role }) {
  const navigate = useNavigate();
  const token = getAuthToken();
  const currentRole = getAuthRole();

  if (!token || !currentRole) return <Navigate to="/login" replace />;
  if (currentRole !== role) {
    const destination = {
      KITCHEN_STAFF: "/kitchen/dashboard",
      NGO_MANAGER: "/ngo/dashboard",
      ADMIN: "/admin/dashboard",
    }[currentRole];
    return destination ? <Navigate to={destination} replace /> : <Navigate to="/" replace />;
  }

  const signOut = () => {
    clearAuthSession();
    navigate("/", { replace: true });
  };

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link className="brand" to="/" aria-label="AnnaChakra home">
          <span className="brand-mark" aria-hidden="true"><Leaf size={21} strokeWidth={2.1} /></span>
          <span>Anna<span className="brand-light">Chakra</span></span>
        </Link>
        <button className="workspace-signout" type="button" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" /> Sign out
        </button>
      </header>
      <section className="workspace-message">
        <span className="workspace-leaf"><Leaf size={25} aria-hidden="true" /></span>
        <p className="eyebrow"><span className="eyebrow-dot" /> Signed in successfully</p>
        <h1>Your {workspaceNames[role]} workspace is coming soon.</h1>
        <p>Your account is connected. The {workspaceNames[role].toLowerCase()} dashboard will be available here as the next part of AnnaChakra.</p>
        <Link className="button button-green" to="/">
          Return to home <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </main>
  )
}

export default WorkspacePage
