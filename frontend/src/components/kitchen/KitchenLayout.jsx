import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate, useOutletContext } from "react-router-dom";
import { Leaf } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import KitchenHeader from "./KitchenHeader.jsx";
import { getMyKitchen } from "../../services/kitchens.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import { ErrorState, LoadingSkeleton } from "../ui/States.jsx";
import Button from "../ui/Button.jsx";

export function useKitchen() {
  return useOutletContext();
}

export default function KitchenLayout() {
  const navigate = useNavigate();
  const [kitchen, setKitchen] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("annachakra:sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadKitchen = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getMyKitchen();
      setKitchen(data);
    } catch (requestError) {
      if (isNotFound(requestError)) {
        navigate("/kitchen/setup", { replace: true });
        return;
      }
      setError(getErrorMessage(requestError, "We couldn’t load your kitchen profile."));
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadKitchen();
  }, [loadKitchen]);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      localStorage.setItem("annachakra:sidebar-collapsed", String(next));
      return next;
    });
  }

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

  if (error || !kitchen) {
    return (
      <div className="kitchen-app">
        <main className="k-layout-error">
          <ErrorState
            title="Kitchen profile unavailable"
            message={error}
            onRetry={loadKitchen}
            action={<Button variant="secondary" to="/">Back to AnnaChakra</Button>}
          />
        </main>
      </div>
    );
  }

  return (
    <div className={`kitchen-app${collapsed ? " k-sidebar-collapsed" : ""}`}>
      <Sidebar
        kitchen={kitchen}
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
        <KitchenHeader kitchen={kitchen} mobileOpen={mobileOpen} onOpenMobile={() => setMobileOpen(true)} />
        <main className="k-page">
          <Outlet context={{ kitchen, refreshKitchen: loadKitchen }} />
        </main>
        <footer className="k-page-footer">
          <span>AnnaChakra kitchen workspace</span>
          <span>Plan with care · Share with purpose <Leaf size={13} aria-hidden="true" /></span>
        </footer>
      </div>
    </div>
  );
}
