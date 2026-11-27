import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Filter,
  ImageOff,
  Plus,
  Trash2,
} from "lucide-react";
import { listWasteLogs } from "../../services/wasteLogs.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  SAFETY_STATUSES,
  WASTE_TYPES,
  formatDateTime,
  formatQuantity,
  labelFor,
  wasteTypeLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { useKitchen } from "../../components/kitchen/KitchenLayout.jsx";
import { SafetyBadge } from "../../components/ui/Badge.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";
import { FoodSelect } from "../../components/kitchen/FoodSelectors.jsx";
import AuthenticatedImage from "../../components/ui/AuthenticatedImage.jsx";

const PAGE_SIZE = 10;

function dayStart(value) {
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`).toISOString();
}

function dayEnd(value) {
  if (!value) return undefined;
  return new Date(`${value}T23:59:59.999`).toISOString();
}

function imageSource(log) {
  if (log.image_url) return log.image_url;
  if (log.image_id) return `/api/v1/vision/images/${log.image_id}`;
  return "";
}

export default function WasteLogsPage() {
  const [logs, setLogs] = useState([]);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [page, setPage] = useState(1);
  const { kitchen } = useKitchen();
  const [filters, setFilters] = useState({
    waste_type: "",
    safety_status: "",
    food_item_id: "",
    created_from: "",
    created_to: "",
  });

  useEffect(() => {
    let active = true;
    listFoodItems({ limit: 100 })
      .then((data) => {
        if (active) setFoods(data.items ?? []);
      })
      .catch(() => {
        if (active) setFoods([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE };
    if (filters.waste_type) params.waste_type = filters.waste_type;
    if (filters.safety_status) params.safety_status = filters.safety_status;
    if (filters.food_item_id) params.food_item_id = Number(filters.food_item_id);
    if (filters.created_from) params.created_from = dayStart(filters.created_from);
    if (filters.created_to) params.created_to = dayEnd(filters.created_to);

    listWasteLogs(params)
      .then((data) => {
        if (active) setLogs(Array.isArray(data) ? data : []);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load waste logs."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [page, filters, reloadKey]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  const hasNext = logs.length === PAGE_SIZE;
  const totalPages = hasNext ? page + 1 : page;
  const hasFilters = Object.values(filters).some(Boolean);

  const summary = useMemo(() => {
    const units = { serving: 0, piece: 0 };
    for (const log of logs) {
      const unit = log.serving_unit === "piece" ? "piece" : "serving";
      units[unit] += Number(log.confirmed_servings) || 0;
    }
    return units;
  }, [logs]);

  function setFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function resetFilters() {
    setFilters({
      waste_type: "",
      safety_status: "",
      food_item_id: "",
      created_from: "",
      created_to: "",
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title="Waste logs"
        description="Recorded surplus, plate waste and spoiled food. View redistribution availability and remaining loggable quantities."
        actions={
          <>
            <Button variant="secondary" to="/kitchen/scanner" icon={ImageOff}>
              Scan food
            </Button>
            <Button to="/kitchen/waste-logs/new" icon={Plus}>Log waste</Button>
          </>
        }
      />

      <Card>
        <div className="k-filter-bar">
          <div className="k-filter-grid">
            <SelectInput
              label="Waste type"
              value={filters.waste_type}
              onChange={(event) => setFilter("waste_type", event.target.value)}
              placeholder="All types"
              options={WASTE_TYPES.map((value) => ({ value, label: wasteTypeLabel(value) }))}
            />
            {!kitchen?.is_simulated ? <SelectInput
              label="Redistribution"
              value={filters.safety_status}
              onChange={(event) => setFilter("safety_status", event.target.value)}
              placeholder="All statuses"
              options={SAFETY_STATUSES.map((value) => ({ value, label: labelFor(value) }))}
            /> : null}
            <FoodSelect
              foods={foods}
              value={filters.food_item_id}
              onChange={(value) => setFilter("food_item_id", value)}
              label="Food item"
              allowAll
              allLabel="All foods"
            />
            <TextInput
              label="Created from"
              type="date"
              value={filters.created_from}
              onChange={(event) => setFilter("created_from", event.target.value)}
            />
            <TextInput
              label="Created to"
              type="date"
              value={filters.created_to}
              onChange={(event) => setFilter("created_to", event.target.value)}
            />
          </div>
          <div className="k-filter-actions">
            <span className="k-muted-text">
              {logs.length} {logs.length === 1 ? "log" : "logs"} on this page
              {summary.serving > 0 ? ` · ${formatQuantity(summary.serving, "serving")}` : ""}
              {summary.piece > 0 ? ` · ${formatQuantity(summary.piece, "piece")}` : ""}
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
              rows={logs}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "image",
                  label: "Image",
                  render: (row) => (
                    <AuthenticatedImage
                      src={imageSource(row)}
                      alt={`Waste log ${row.id}`}
                      className="k-table-thumb"
                      fallback={<span className="k-table-thumb k-table-thumb-empty"><ImageOff size={15} /></span>}
                    />
                  ),
                },
                {
                  key: "id",
                  label: "Log",
                  render: (row) => (
                    <Link className="k-table-link" to={`/kitchen/waste-logs/${row.id}`}>#{row.id}</Link>
                  ),
                },
                {
                  key: "food",
                  label: "Food",
                  render: (row) => (
                    <div className="k-table-primary">
                      <strong>{row.food_name}</strong>
                      <small>{row.predicted_food ? `Scanner: ${row.predicted_food}` : "Manual entry"}</small>
                    </div>
                  ),
                },
                {
                  key: "quantity",
                  label: "Quantity",
                  render: (row) => formatQuantity(row.confirmed_servings, row.serving_unit),
                },
                { key: "type", label: "Type", render: (row) => wasteTypeLabel(row.waste_type) },
                {
                  key: "safety",
                  label: "Redistribution",
                  render: (row) => row.is_simulated ? null : <SafetyBadge status={row.safety_status} />,
                },
                {
                  key: "available",
                  label: "Available",
                  render: (row) => (
                    <span className={row.available_servings > 0 ? "" : "k-muted-text"}>
                      {formatQuantity(row.available_servings, row.serving_unit)}
                    </span>
                  ),
                },
                {
                  key: "created",
                  label: "Recorded",
                  render: (row) => formatDateTime(row.created_at),
                },
                {
                  key: "action",
                  label: "",
                  render: (row) => (
                    <Link className="k-table-link" to={`/kitchen/waste-logs/${row.id}`}>View</Link>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  icon={Trash2}
                  title={hasFilters ? "No waste logs match these filters" : "No waste logs yet"}
                  description={
                    hasFilters
                      ? "Try a different waste type, redistribution status, food or date range."
                      : "Log surplus or plate waste after a meal service, or start from a scanner result."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="secondary" onClick={resetFilters}>Clear filters</Button>
                    ) : (
                      <Button to="/kitchen/waste-logs/new" icon={Plus}>Log waste</Button>
                    )
                  }
                />
              }
            />
          )}
        </div>

        {!loading && !error && logs.length > 0 ? (
          <div className="k-card-footer">
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={(nextPage) => {
                if (nextPage < 1) return;
                if (nextPage > page && !hasNext) return;
                setPage(nextPage);
              }}
            />
            <span className="k-muted-text">
              Page {page}{hasNext ? " · more logs available" : " · end of list"}
            </span>
          </div>
        ) : null}
      </Card>

      <p className="k-page-footer-note">
        <CalendarDays size={14} aria-hidden="true" />
        <span>
          Filters use the log creation time. Meal-record surplus quantities are limited by the
          backend, so use the “Log waste” actions from a meal record when logging recorded leftovers.
        </span>
      </p>
    </>
  );
}
