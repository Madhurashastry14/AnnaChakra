import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CalendarDays, TrendingUp } from "lucide-react";
import { getForecast } from "../../services/forecasts.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import { formatDate, mealTypeLabel, menuModeLabel } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import ForecastResult from "../../components/kitchen/ForecastResult.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

export default function ForecastDetailPage() {
  const { id } = useParams();
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    getForecast(id)
      .then((data) => {
        if (active) setForecast(data);
      })
      .catch((requestError) => {
        if (!active) return;
        if (isNotFound(requestError)) setNotFound(true);
        else setError(getErrorMessage(requestError, "We couldn’t load this forecast."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="WORKSPACE" title="Forecast detail" backTo="/kitchen/forecasts" backLabel="Forecast history" />
        <LoadingSkeleton variant="page" />
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageHeader eyebrow="WORKSPACE" title="Forecast detail" backTo="/kitchen/forecasts" backLabel="Forecast history" />
        <EmptyState
          icon={CalendarDays}
          title="Forecast not found"
          description="This forecast does not exist for your kitchen, or it may have been removed."
          action={<Button to="/kitchen/forecasts" icon={TrendingUp}>Back to forecast history</Button>}
        />
      </>
    );
  }

  if (error || !forecast) {
    return (
      <>
        <PageHeader eyebrow="WORKSPACE" title="Forecast detail" backTo="/kitchen/forecasts" backLabel="Forecast history" />
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE"
        title={`Forecast #${forecast.id}`}
        description={`${mealTypeLabel(forecast.meal_type)} · ${formatDate(forecast.meal_date)} · ${menuModeLabel(forecast.menu_mode)}`}
        backTo="/kitchen/forecasts"
        backLabel="Forecast history"
        actions={<Button variant="secondary" to="/kitchen/forecast" icon={TrendingUp}>New forecast</Button>}
      />
      <ForecastResult forecast={forecast} />
    </>
  );
}
