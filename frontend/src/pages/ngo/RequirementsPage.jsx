import { useEffect, useMemo, useState } from "react";
import { CalendarDays, PackageCheck, Plus } from "lucide-react";
import { closeRequirement, listRequirements } from "../../services/ngos.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDate, formatDateTime, formatNumber, formatQuantity, labelFor, todayISO } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import SegmentedControl from "../../components/ui/SegmentedControl.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

function requirementStatus(requirement) {
  if (!requirement.is_active) return "CLOSED";
  if (requirement.required_date < todayISO() || new Date(requirement.available_until).getTime() <= Date.now()) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "EXPIRED") return "warning";
  return "neutral";
}

export default function RequirementsPage() {
  const { notify } = useToast();
  const [requirements, setRequirements] = useState([]);
  const [filter, setFilter] = useState("ACTIVE");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [closing, setClosing] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listRequirements()
      .then((rows) => { if (active) setRequirements(rows); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, "We couldn’t load food requirements.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => requirements.filter((row) => requirementStatus(row) === filter), [requirements, filter]);

  async function handleClose() {
    if (!closing) return;
    setSaving(true);
    try {
      await closeRequirement(closing.id);
      notify("Requirement closed.");
      setClosing(null);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      notify(getErrorMessage(requestError, "We couldn’t close this requirement."), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="NGO OPERATIONS"
        title="Food requirements"
        description="Set the food and capacity your organization can receive. Remaining capacity is calculated by the backend."
        actions={<Button icon={Plus} to="/ngo/requirements/new">Create requirement</Button>}
      />
      <Card>
        <div className="k-filter-bar">
          <SegmentedControl
            label="Requirement status"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "ACTIVE", label: "Active" },
              { value: "EXPIRED", label: "Expired" },
              { value: "CLOSED", label: "Closed" },
            ]}
          />
          <span className="k-muted-text">{formatNumber(filtered.length, 0)} {filtered.length === 1 ? "requirement" : "requirements"}</span>
        </div>
        <div className="k-card-body">
          {loading ? <LoadingSkeleton rows={5} /> : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : filtered.length ? (
            <div className="k-portal-list">
              {filtered.map((requirement) => {
                const status = requirementStatus(requirement);
                return (
                  <article className="k-portal-list-item" key={requirement.id}>
                    <div className="k-redistribution-batch-heading">
                      <div>
                        <h3>Requirement #{requirement.id}</h3>
                        <p>{formatNumber(requirement.people_to_feed, 0)} people to feed · Required {formatDate(requirement.required_date)}</p>
                      </div>
                      <Badge tone={statusTone(status)}>{labelFor(status)}</Badge>
                    </div>
                    <dl className="k-redistribution-facts">
                      <div><dt>Remaining capacity</dt><dd>{formatQuantity(requirement.remaining_capacity_by_unit?.serving, "serving")}</dd></div>
                      <div><dt>Remaining piece capacity</dt><dd>{formatQuantity(requirement.remaining_capacity_by_unit?.piece, "piece")}</dd></div>
                      <div><dt>Availability deadline</dt><dd><CalendarDays size={14} /> {formatDateTime(requirement.available_until)}</dd></div>
                      <div><dt>Dietary acceptance</dt><dd>{[
                        requirement.accepts_vegetarian ? "Vegetarian" : null,
                        requirement.accepts_non_vegetarian ? "Non-vegetarian" : null,
                      ].filter(Boolean).join(" · ") || "None"}</dd></div>
                    </dl>
                    <p className="k-muted-text">
                      Food categories: {requirement.accepted_categories?.length ? requirement.accepted_categories.join(", ") : "No category restriction"}
                    </p>
                    <div className="k-redistribution-card-actions">
                      <Button variant="secondary" size="sm" to={`/ngo/requirements/${requirement.id}/edit`}>Edit</Button>
                      {requirement.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => setClosing(requirement)}>Close requirement</Button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState
              icon={PackageCheck}
              title={`No ${filter.toLowerCase()} requirements`}
              description="Create a food requirement to share your organization’s current needs and receiving capacity."
              action={filter === "ACTIVE" ? <Button icon={Plus} to="/ngo/requirements/new">Create requirement</Button> : null}
            />
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={Boolean(closing)}
        title={`Close requirement #${closing?.id ?? ""}?`}
        description="This stops new matches for the requirement. Existing accepted donations can continue through their deadline."
        confirmLabel="Close requirement"
        loading={saving}
        onConfirm={handleClose}
        onCancel={() => setClosing(null)}
      />
    </>
  );
}
