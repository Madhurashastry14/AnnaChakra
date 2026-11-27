import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Filter, History, Search, TrendingUp } from "lucide-react";
import { listForecasts } from "../../services/forecasts.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  mealTypeLabel,
  menuModeLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import SearchInput from "../../components/ui/SearchInput.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { MethodBadge } from "../../components/ui/Badge.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";

const PAGE_SIZE = 10;

export default function ForecastHistoryPage() {
  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState("");
  const [mealType, setMealType] = useState("");
  const [menuMode, setMenuMode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listForecasts()
      .then((data) => {
        if (!active) return;
        setForecasts(Array.isArray(data) ? data : []);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load forecast history."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  useEffect(() => {
    setPage(1);
  }, [search, mealType, menuMode, dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...forecasts]
      .filter((forecast) => {
        if (mealType && forecast.meal_type !== mealType) return false;
        if (menuMode === "LEGACY" && forecast.menu_mode !== null) return false;
        if (menuMode && menuMode !== "LEGACY" && forecast.menu_mode !== menuMode) return false;
        if (dateFrom && forecast.meal_date < dateFrom) return false;
        if (dateTo && forecast.meal_date > dateTo) return false;
        if (!term) return true;
        return (
          String(forecast.id).includes(term) ||
          forecast.meal_date.includes(term) ||
          mealTypeLabel(forecast.meal_type).toLowerCase().includes(term) ||
          menuModeLabel(forecast.menu_mode).toLowerCase().includes(term) ||
          (forecast.items ?? []).some((item) => item.name.toLowerCase().includes(term))
        );
      })
      .sort(
        (left, right) =>
          right.meal_date.localeCompare(left.meal_date) || right.id - left.id,
      );
  }, [forecasts, search, mealType, menuMode, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = search || mealType || menuMode || dateFrom || dateTo;

  function resetFilters() {
    setSearch("");
    setMealType("");
    setMenuMode("");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Forecast history"
        description="Every saved forecast for your kitchen. Open one to review quantities, ingredients and feedback."
        actions={<Button to="/kitchen/forecast" icon={TrendingUp}>New forecast</Button>}
      />

      <Card>
        <div className="k-filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by forecast ID, date or dish…"
            label="Search forecasts"
          />
          <div className="k-filter-grid">
            <SelectInput
              label="Meal type"
              value={mealType}
              onChange={(event) => setMealType(event.target.value)}
              placeholder="All meals"
              options={["BREAKFAST", "LUNCH", "DINNER"].map((value) => ({
                value,
                label: mealTypeLabel(value),
              }))}
            />
            <SelectInput
              label="Menu mode"
              value={menuMode}
              onChange={(event) => setMenuMode(event.target.value)}
              placeholder="All modes"
              options={[
                { value: "CHOICE_BASED", label: menuModeLabel("CHOICE_BASED") },
                { value: "FIXED_MEAL", label: menuModeLabel("FIXED_MEAL") },
                { value: "LEGACY", label: "Legacy (mode not recorded)" },
              ]}
            />
            <TextInput
              label="From meal date"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
            <TextInput
              label="To meal date"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </div>
          <div className="k-filter-actions">
            <span className="k-muted-text">
              {filtered.length} {filtered.length === 1 ? "forecast" : "forecasts"}
            </span>
            {hasFilters ? (
              <Button variant="ghost" size="sm" icon={Filter} onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        <div className="k-card-body k-card-body-flush">
          {loading ? (
            <LoadingSkeleton variant="table" rows={6} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : (
            <DataTable
              rows={pageRows}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "id",
                  label: "Forecast",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/forecasts/${row.id}`}>#{row.id}</Link>,
                },
                { key: "date", label: "Meal date", render: (row) => formatDate(row.meal_date) },
                { key: "meal", label: "Meal", render: (row) => mealTypeLabel(row.meal_type) },
                { key: "mode", label: "Mode", render: (row) => menuModeLabel(row.menu_mode) },
                { key: "expected", label: "Expected", render: (row) => formatNumber(row.expected_people) },
                {
                  key: "dishes",
                  label: "Dishes",
                  render: (row) => (
                    <span className="k-table-clip">
                      {(row.items ?? []).map((item) => item.name).join(", ")}
                    </span>
                  ),
                },
                {
                  key: "methods",
                  label: "Methods",
                  render: (row) => (
                    <span className="k-inline-chips">
                      {[...new Set((row.items ?? []).map((item) => item.prediction_method))].map((method) => (
                        <MethodBadge key={method} method={method} />
                      ))}
                    </span>
                  ),
                },
                { key: "created", label: "Created", render: (row) => formatDateTime(row.created_at) },
                {
                  key: "action",
                  label: "",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/forecasts/${row.id}`}>View</Link>,
                },
              ]}
              empty={
                <EmptyState
                  icon={History}
                  title={hasFilters ? "No forecasts match these filters" : "No forecasts yet"}
                  description={
                    hasFilters
                      ? "Try a different date range, meal type or search term."
                      : "Generate a demand forecast to start building history."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>
                    ) : (
                      <Button to="/kitchen/forecast" icon={TrendingUp}>Generate a forecast</Button>
                    )
                  }
                />
              }
            />
          )}
        </div>

        {!loading && !error && filtered.length > PAGE_SIZE ? (
          <div className="k-card-footer">
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        ) : null}
      </Card>

      <p className="k-note k-page-footer-note">
        <Search size={14} aria-hidden="true" />
        Forecast history is returned as a complete list by the backend; search and filters are
        applied in this browser.
      </p>
    </>
  );
}
