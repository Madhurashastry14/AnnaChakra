import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ClipboardList,
  Info,
  Trash2,
  TrendingUp,
  Utensils,
} from "lucide-react";
import { getMealRecord, getMealWasteSummary } from "../../services/mealRecords.js";
import { listFoodItems } from "../../services/foodItems.js";
import { getErrorMessage, isNotFound } from "../../utils/errors.js";
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatQuantity,
  mealTypeLabel,
  menuModeLabel,
  wasteTypeLabel,
} from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";

export default function MealRecordDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [summary, setSummary] = useState(null);
  const [foods, setFoods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    setSummaryError("");

    Promise.allSettled([
      getMealRecord(id),
      getMealWasteSummary(id),
      listFoodItems({ limit: 100 }),
    ]).then((results) => {
      if (!active) return;
      const [recordResult, summaryResult, foodsResult] = results;

      if (recordResult.status === "fulfilled") setRecord(recordResult.value);
      else if (isNotFound(recordResult.reason)) setNotFound(true);
      else setError(getErrorMessage(recordResult.reason, "We couldn’t load this meal record."));

      if (summaryResult.status === "fulfilled") setSummary(summaryResult.value);
      else setSummaryError(getErrorMessage(summaryResult.reason, "We couldn’t load the waste summary."));

      if (foodsResult.status === "fulfilled") setFoods(foodsResult.value.items ?? []);

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  function logFromDraft(draft, item) {
    navigate("/kitchen/waste-logs/new", {
      state: {
        mode: "meal-record",
        meal_record_id: record.id,
        meal_record_item_id: draft.meal_record_item_id,
        food_item_id: draft.food_item_id,
        confirmed_servings: draft.confirmed_servings,
        waste_type: draft.waste_type,
        prepared_at: draft.prepared_at ?? null,
        food_name: item.food_item_name,
        serving_unit: item.serving_unit,
      },
    });
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Meal record" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <LoadingSkeleton variant="page" />
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Meal record" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <EmptyState
          icon={ClipboardList}
          title="Meal record not found"
          description="This record does not exist for your kitchen, or it may have been removed."
          action={<Button to="/kitchen/meal-records">Back to meal records</Button>}
        />
      </>
    );
  }

  if (error || !record) {
    return (
      <>
        <PageHeader eyebrow="OPERATIONS" title="Meal record" backTo="/kitchen/meal-records" backLabel="Meal records" />
        <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
      </>
    );
  }

  const foodMap = new Map(foods.map((food) => [food.id, food]));

  return (
    <>
      <PageHeader
        eyebrow="OPERATIONS"
        title={`Meal record #${record.id}`}
        description={`${mealTypeLabel(record.meal_type)} · ${formatDate(record.meal_date)} · ${menuModeLabel(record.menu_mode)}`}
        backTo="/kitchen/meal-records"
        backLabel="Meal records"
        actions={
          <>
            {record.forecast_id ? (
              <Button variant="secondary" to={`/kitchen/forecasts/${record.forecast_id}`} icon={TrendingUp}>
                View forecast
              </Button>
            ) : null}
            <Button to="/kitchen/meal-records/new" icon={ClipboardList}>Record another meal</Button>
          </>
        }
      />

      <section className="k-result-hero k-meal-record-hero">
        <div className="k-result-hero-main">
          <p className="k-eyebrow">MEAL SERVICE</p>
          <h2>{mealTypeLabel(record.meal_type)} · {formatDate(record.meal_date)}</h2>
          <p>{menuModeLabel(record.menu_mode)}</p>
        </div>
        <dl className="k-result-hero-stats">
          <div>
            <dt>Actual attendance</dt>
            <dd>{formatNumber(record.actual_people)}</dd>
          </div>
          <div>
            <dt>Dishes recorded</dt>
            <dd>{record.items?.length ?? 0}</dd>
          </div>
          <div>
            <dt>Linked forecast</dt>
            <dd>
              {record.forecast_id ? (
                <Link className="k-table-link" to={`/kitchen/forecasts/${record.forecast_id}`}>#{record.forecast_id}</Link>
              ) : (
                "Manual record"
              )}
            </dd>
          </div>
          <div>
            <dt>Recorded at</dt>
            <dd>{formatDateTime(record.created_at)}</dd>
          </div>
        </dl>
      </section>

      <Card>
        <CardHeader
          icon={Utensils}
          title="Dish quantities"
          subtitle="Backend-calculated served and consumed quantities. Unknown plate waste is shown as not measured."
        />
        <div className="k-card-body k-card-body-flush">
          <div className="k-table-wrap">
            <table className="k-table">
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Unit</th>
                  <th>Prepared</th>
                  <th>Served</th>
                  <th>Consumed</th>
                  <th>Unserved</th>
                  <th>Plate waste</th>
                  <th>Shortage</th>
                </tr>
              </thead>
              <tbody>
                {(record.items ?? []).map((item) => {
                  const food = foodMap.get(item.food_item_id);
                  return (
                  <tr key={item.id}>
                    <td><strong>{food?.name ?? `Food #${item.food_item_id}`}</strong></td>
                    <td>{food?.serving_unit === "piece" ? "pieces" : "servings"}</td>
                    <td>{formatNumber(item.prepared_servings)}</td>
                    <td>{formatNumber(item.served_servings)}</td>
                    <td>{item.consumed_servings === null ? "—" : formatNumber(item.consumed_servings)}</td>
                    <td>{formatNumber(item.leftover_servings)}</td>
                    <td>
                      {item.plate_waste_servings === null ? (
                        <Badge tone="neutral">Not measured</Badge>
                      ) : (
                        formatNumber(item.plate_waste_servings)
                      )}
                    </td>
                    <td>
                      {item.shortage_occurred ? (
                        <Badge tone="danger" icon={AlertTriangle}>Shortage</Badge>
                      ) : (
                        <Badge tone="success">No shortage</Badge>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          icon={Trash2}
          title="Waste summary"
          subtitle="Recorded, logged and remaining quantities are calculated by the backend."
          action={
            summaryError ? (
              <Button size="sm" variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
                Retry
              </Button>
            ) : null
          }
        />
        <div className="k-card-body">
          {summaryError ? (
            <ErrorState title="Waste summary unavailable" message={summaryError} />
          ) : !summary || summary.items?.length === 0 ? (
            <EmptyState
              icon={Trash2}
              title="No waste summary available"
              description="The backend did not return waste items for this meal record."
              className="k-empty-compact"
            />
          ) : (
            <>
              <p className="k-note">
                <Info size={14} aria-hidden="true" />
                Remaining quantities below come directly from the backend. They are not recalculated
                in this interface, so leftover logging stays within the allowed limits.
              </p>
              <div className="k-waste-summary-list">
                {summary.items.map((item) => (
                  <article className="k-waste-summary-item" key={item.meal_record_item_id}>
                    <div className="k-waste-summary-head">
                      <div>
                        <h3>{item.food_item_name}</h3>
                        <small>{item.serving_unit === "piece" ? "pieces" : "servings"}</small>
                      </div>
                      <div className="k-waste-summary-links">
                        {item.waste_log_ids?.map((wasteId) => (
                          <Link key={wasteId} className="k-table-link" to={`/kitchen/waste-logs/${wasteId}`}>
                            Leftover log #{wasteId}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <dl className="k-stat-grid k-stat-grid-compact">
                      <div>
                        <dt>Recorded unserved surplus</dt>
                        <dd>{formatNumber(item.recorded_unserved)}</dd>
                      </div>
                      <div>
                        <dt>Already logged surplus</dt>
                        <dd>{formatNumber(item.logged_unserved)}</dd>
                      </div>
                      <div>
                        <dt>Already logged spoiled</dt>
                        <dd>{formatNumber(item.logged_spoiled)}</dd>
                      </div>
                      <div>
                        <dt>Remaining unserved surplus</dt>
                        <dd>{formatNumber(item.remaining_unserved)}</dd>
                      </div>
                      <div>
                        <dt>Recorded plate waste</dt>
                        <dd>
                          {item.recorded_plate_waste === null
                            ? <Badge tone="neutral">Not measured</Badge>
                            : formatNumber(item.recorded_plate_waste)}
                        </dd>
                      </div>
                      <div>
                        <dt>Already logged plate waste</dt>
                        <dd>{formatNumber(item.logged_plate_waste)}</dd>
                      </div>
                      <div>
                        <dt>Remaining plate waste</dt>
                        <dd>
                          {item.remaining_plate_waste === null
                            ? <Badge tone="neutral">Not measured</Badge>
                            : formatNumber(item.remaining_plate_waste)}
                        </dd>
                      </div>
                    </dl>

                    {item.recorded_preparation_times?.length > 0 ? (
                      <p className="k-note">
                        Recorded preparation times:{" "}
                        {item.recorded_preparation_times.map((time) => formatDateTime(time)).join(", ")}
                      </p>
                    ) : null}

                    <div className="k-draft-actions">
                      {item.logging_drafts?.length > 0 ? (
                        item.logging_drafts.map((draft) => (
                          <Button
                            key={`${draft.meal_record_item_id}-${draft.waste_type}`}
                            size="sm"
                            variant={draft.waste_type === "PLATE_WASTE" ? "secondary" : "primary"}
                            icon={Trash2}
                            onClick={() => logFromDraft(draft, item)}
                          >
                            Log {wasteTypeLabel(draft.waste_type)} ·{" "}
                            {formatQuantity(draft.confirmed_servings, item.serving_unit)}
                          </Button>
                        ))
                      ) : (
                        <span className="k-muted-text">
                          No remaining quantities are available to log for this dish.
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </div>
      </Card>
    </>
  );
}
