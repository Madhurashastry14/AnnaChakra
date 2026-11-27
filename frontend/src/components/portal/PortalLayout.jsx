import { useCallback, useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { HandHeart, Leaf, ShieldCheck } from "lucide-react";
import Sidebar from "../kitchen/Sidebar.jsx";
import PortalHeader from "./PortalHeader.jsx";
import { PORTAL_NAVIGATION } from "./navigation.js";
import { getMyNGO } from "../../services/ngos.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import { ErrorState, LoadingSkeleton } from "../ui/States.jsx";
import Button from "../ui/Button.jsx";

export function usePortal() {
  return useOutletContext();
}

export default function PortalLayout({ role }) {
  const location = useLocation();
  const isAdmin = role === "ADMIN";
  const workspaceLabel = isAdmin ? "Admin" : "NGO";
  const defaultPath = isAdmin ? "/admin/dashboard" : "/ngo/dashboard";
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(!isAdmin);
  const [error, setError] = useState("");
  const [notRegistered, setNotRegistered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(`annachakra:${role.toLowerCase()}:sidebar-collapsed`) === "true",
  );

  const refreshOrganization = useCallback(async () => {
    if (isAdmin) return null;
    setLoading(true);
    setError("");
    try {
      const currentOrganization = await getMyNGO();
      setOrganization(currentOrganization);
      setNotRegistered(false);
      return currentOrganization;
    } catch (requestError) {
      if (isNotFound(requestError)) {
        setOrganization(null);
        setNotRegistered(true);
        return null;
      }
      setError(getErrorMessage(requestError, "We couldn’t load your organization profile."));
      return null;
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    refreshOrganization();
  }, [isAdmin, refreshOrganization]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem(`annachakra:${role.toLowerCase()}:sidebar-collapsed`, String(next));
      return next;
    });
  }

  const isSetup = location.pathname === "/ngo/setup";
  if (loading) {
    return (
      <div className="kitchen-app">
        <div className="k-layout-loading">
          <div className="k-session-mark" aria-hidden="true"><Leaf size={22} /></div>
          <LoadingSkeleton rows={5} />
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="kitchen-app">
        <main className="k-layout-error">
          <ErrorState
            title="Organization profile unavailable"
            message={error}
            onRetry={refreshOrganization}
            action={<Button variant="secondary" to="/">Back to AnnaChakra</Button>}
          />
        </main>
      </div>
    );
  }
  if (!isAdmin && notRegistered && !isSetup) return <Navigate to="/ngo/setup" replace />;
  if (!isAdmin && organization && isSetup) return <Navigate to="/ngo/dashboard" replace />;

  return (
    <div className={`kitchen-app${collapsed ? " k-sidebar-collapsed" : ""}`}>
      <Sidebar
        organization={organization}
        organizationLabel={isAdmin ? "Platform administration" : null}
        organizationIcon={isAdmin ? ShieldCheck : HandHeart}
        workspaceLabel={workspaceLabel}
        defaultPath={defaultPath}
        groups={PORTAL_NAVIGATION[role]}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggleCollapse={toggleCollapsed}
        onCloseMobile={() => setMobileOpen(false)}
      />
      {mobileOpen ? (
        <button
          type="button"
          className="k-sidebar-overlay"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <div className="k-main">
        <PortalHeader
          role={role}
          organization={organization}
          mobileOpen={mobileOpen}
          onOpenMobile={() => setMobileOpen(true)}
        />
        <main className="k-page">
          <Outlet context={{ organization, refreshOrganization, role }} />
        </main>
        <footer className="k-page-footer">
          <span>AnnaChakra {workspaceLabel.toLowerCase()} workspace</span>
          <span>Food shared with purpose <Leaf size={13} aria-hidden="true" /></span>
        </footer>
      </div>
    </div>
  );
}
