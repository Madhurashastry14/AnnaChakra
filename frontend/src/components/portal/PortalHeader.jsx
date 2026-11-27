import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Settings, UserRound } from "lucide-react";
import { VerificationBadge } from "../ui/Badge.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { labelFor } from "../../utils/format.js";
import { getPortalPageMeta } from "./navigation.js";

export default function PortalHeader({
  role,
  organization,
  mobileOpen,
  onOpenMobile,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const workspace = role === "ADMIN" ? "Admin" : "NGO";
  const meta = getPortalPageMeta(location.pathname);
  const profilePath = role === "ADMIN" ? "/admin/dashboard" : "/ngo/profile";

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [menuOpen]);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="k-header">
      <div className="k-header-left">
        <button
          type="button"
          className="k-icon-button k-mobile-menu"
          aria-label="Open navigation"
          aria-controls={`${workspace.toLowerCase()}-navigation`}
          aria-expanded={mobileOpen}
          onClick={onOpenMobile}
        >
          <Menu size={20} />
        </button>
        <div>
          <nav className="k-breadcrumbs" aria-label="Breadcrumb">
            <span>{workspace}</span>
            <span aria-hidden="true">/</span>
            <span>{meta.section}</span>
            <span aria-hidden="true">/</span>
            <strong>{meta.title}</strong>
          </nav>
          <p className="k-header-title">{meta.title}</p>
        </div>
      </div>
      <div className="k-header-right">
        {organization ? (
          <div className="k-header-kitchen">
            <span className="k-header-kitchen-name">{organization.name}</span>
            <VerificationBadge status={organization.verification_status} />
          </div>
        ) : role === "ADMIN" ? (
          <div className="k-header-kitchen">
            <span className="k-header-kitchen-name">Platform administration</span>
          </div>
        ) : null}
        <div className="k-user-menu" ref={menuRef}>
          <button
            type="button"
            className="k-user-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className="k-avatar" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() ?? "A"}</span>
            <span className="k-user-trigger-text">
              <strong>{user?.name}</strong>
              <small>{labelFor(user?.role)}</small>
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </button>
          {menuOpen ? (
            <div className="k-user-dropdown" role="menu">
              <div className="k-user-dropdown-head">
                <span className="k-avatar k-avatar-lg" aria-hidden="true">{user?.name?.charAt(0)?.toUpperCase() ?? "A"}</span>
                <div><strong>{user?.name}</strong><small>{user?.email}</small></div>
              </div>
              {role !== "ADMIN" ? (
                <Link to={profilePath} role="menuitem" className="k-user-dropdown-item">
                  <Settings size={15} /> Organization profile
                </Link>
              ) : null}
              <Link to="/" role="menuitem" className="k-user-dropdown-item">
                <UserRound size={15} /> View public site
              </Link>
              <button type="button" role="menuitem" className="k-user-dropdown-item is-danger" onClick={handleLogout}>
                <LogOut size={15} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
