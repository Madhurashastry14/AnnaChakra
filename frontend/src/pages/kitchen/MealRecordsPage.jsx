import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Filter, History, Plus } from "lucide-react";
import { listMealRecords } from "../../services/mealRecords.js";
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
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";

const PAGE_SIZE = 10;

export default function MealRecordsPage() {
  const [records, setRecords] = useState([]);
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
    listMealRecords()
      .then((data) => {
        if (active) setRecords(Array.isArray(data) ? data : []);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load meal records."));
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
    return [...records]
      .filter((record) => {
        if (mealType && record.meal_type !== mealType) return false;
        if (menuMode === "LEGACY" && record.menu_mode !== null) return false;
        if (menuMode && menuMode !== "LEGACY" && record.menu_mode !== menuMode) return false;
        if (dateFrom && record.meal_date < dateFrom) return false;
        if (dateTo && record.meal_date > dateTo) return false;
        if (!term) return true;
        return (
          String(record.id).includes(term) ||
          record.meal_date.includes(term) ||
          mealTypeLabel(record.meal_type).toLowerCase().includes(term) ||
          menuModeLabel(record.menu_mode).toLowerCase().includes(term) ||
          (record.items ?? []).some((item) => String(item.food_item_id).includes(term))
        );
      })
      .sort(
        (left, right) =>
          right.meal_date.localeCompare(left.meal_date) || right.id - left.id,
      );
  }, [records, search, mealType, menuMode, dateFrom, dateTo]);

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
        eyebrow="OPERATIONS"
        title="Meal records"
        description="Actual attendance and service feedback for completed meals. Open a record to review waste and log surplus."
        actions={<Button to="/kitchen/meal-records/new" icon={Plus}>Record a meal</Button>}
      />

      <Card>
        <div className="k-filter-bar">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by record ID, date or meal…"
            label="Search meal records"
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
              {filtered.length} {filtered.length === 1 ? "record" : "records"}
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
                  label: "Record",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/meal-records/${row.id}`}>#{row.id}</Link>,
                },
                { key: "date", label: "Meal date", render: (row) => formatDate(row.meal_date) },
                { key: "meal", label: "Meal", render: (row) => mealTypeLabel(row.meal_type) },
                { key: "mode", label: "Mode", render: (row) => menuModeLabel(row.menu_mode) },
                { key: "people", label: "Attended", render: (row) => formatNumber(row.actual_people) },
                { key: "dishes", label: "Dishes", render: (row) => row.items?.length ?? 0 },
                {
                  key: "forecast",
                  label: "Forecast",
                  render: (row) =>
                    row.forecast_id ? (
                      <Link className="k-table-link" to={`/kitchen/forecasts/${row.forecast_id}`}>#{row.forecast_id}</Link>
                    ) : (
                      <span className="k-muted-text">Manual</span>
                    ),
                },
                { key: "created", label: "Recorded", render: (row) => formatDateTime(row.created_at) },
                {
                  key: "action",
                  label: "",
                  render: (row) => <Link className="k-table-link" to={`/kitchen/meal-records/${row.id}`}>View</Link>,
                },
              ]}
              empty={
                <EmptyState
                  icon={History}
                  title={hasFilters ? "No meal records match these filters" : "No meal records yet"}
                  description={
                    hasFilters
                      ? "Try a different date range, meal type or search term."
                      : "Record a completed meal to capture attendance, leftovers and plate waste."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>
                    ) : (
                      <Button to="/kitchen/meal-records/new" icon={ClipboardList}>Record a meal</Button>
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
    </>
  );
}
