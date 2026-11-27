import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronsLeft,
  ChevronsRight,
  CookingPot,
  Leaf,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { VerificationBadge } from "../ui/Badge.jsx";
import { KITCHEN_NAV_GROUPS, isNavActive } from "./navigation.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import { classNames, labelFor } from "../../utils/format.js";

export default function Sidebar({
  kitchen,
  organization = kitchen,
  organizationLabel,
  workspaceLabel = "Kitchen",
  defaultPath = "/kitchen/dashboard",
  groups = KITCHEN_NAV_GROUPS,
  organizationIcon: OrganizationIcon = CookingPot,
  collapsed,
  mobileOpen,
  onToggleCollapse,
  onCloseMobile,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <aside
      id={`${workspaceLabel.toLowerCase()}-navigation`}
      className={classNames(
        "k-sidebar",
        collapsed && "is-collapsed",
        mobileOpen && "is-mobile-open",
      )}
      aria-label={`${workspaceLabel} navigation`}
    >
      <div className="k-sidebar-brand-row">
        <Link
          className="k-brand"
          to={defaultPath}
          onClick={onCloseMobile}
          aria-label={`AnnaChakra ${workspaceLabel.toLowerCase()} dashboard`}
        >
          <span className="k-brand-mark" aria-hidden="true">
            <Leaf size={20} />
          </span>
          <span className="k-brand-text">
            Anna<span>Chakra</span>
            <small>{workspaceLabel} workspace</small>
          </span>
        </Link>
      </div>

      {organization || organizationLabel ? (
        <div className="k-sidebar-kitchen">
          <span className="k-sidebar-kitchen-icon" aria-hidden="true">
            {organization ? <OrganizationIcon size={17} /> : <ShieldCheck size={17} />}
          </span>
          <div className="k-sidebar-kitchen-text">
            <strong>{organization?.name ?? organizationLabel}</strong>
            {organization?.verification_status ? (
              <VerificationBadge status={organization.verification_status} />
            ) : null}
          </div>
        </div>
      ) : null}

      <nav className="k-sidebar-nav">
        {groups.map((group) => (
          <div className="k-nav-group" key={group.label}>
            <p className="k-nav-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(location.pathname, item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={classNames("k-nav-link", active && "is-active")}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  onClick={onCloseMobile}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className="k-nav-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="k-sidebar-footer">
        <button
          type="button"
          className="k-sidebar-collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
          <span className="k-nav-label"></span>
        </button>

        <div className="k-sidebar-user">
          <span className="k-avatar" aria-hidden="true">
            {user?.name?.charAt(0)?.toUpperCase() ?? "K"}
          </span>
          <div className="k-sidebar-user-text">
            <strong>{user?.name ?? "Kitchen staff"}</strong>
            <small>{labelFor(user?.role)}</small>
          </div>
          <button
            type="button"
            className="k-icon-button k-sidebar-logout"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}
