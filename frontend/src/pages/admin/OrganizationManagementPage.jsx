import { useEffect, useState } from "react";
import { MapPin, Search, ShieldCheck } from "lucide-react";
import { listAdminOrganizations, verifyOrganization } from "../../services/admin.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatNumber, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge, VerificationBadge } from "../../components/ui/Badge.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { ConfirmDialog } from "../../components/ui/Modal.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import { SelectInput, TextInput } from "../../components/ui/Form.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const PAGE_SIZE = 10;

export default function OrganizationManagementPage({ type }) {
  const isKitchen = type === "kitchens";
  const label = isKitchen ? "kitchen" : "NGO";
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    listAdminOrganizations(type, {
      verification_status: status || undefined,
      search: appliedSearch || undefined,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setRows(result.items ?? []);
        setTotal(result.total ?? 0);
      })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError, `We couldn’t load ${label} records.`)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [type, status, appliedSearch, page, reloadKey, label]);

  function applySearch(event) {
    event.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  }

  async function confirmVerification() {
    if (!pendingAction) return;
    setSaving(true);
    try {
      const updated = await verifyOrganization(type, pendingAction.organization.id, pendingAction.status);
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setPendingAction(null);
      notify(`${label === "NGO" ? "NGO" : "Kitchen"} ${labelFor(updated.verification_status).toLowerCase()}.`);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      notify(getErrorMessage(requestError, `We couldn’t update ${label} verification.`), "error");
    } finally {
      setSaving(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const actionDescription = pendingAction?.status === "VERIFIED"
    ? `Approve ${pendingAction?.organization.name} as verified?`
    : `Reject verification for ${pendingAction?.organization.name}?`;

  return (
    <>
      <PageHeader
        eyebrow="ORGANIZATION MANAGEMENT"
        title={isKitchen ? "Kitchen management" : "NGO management"}
        description={`Review ${label} registration details and update verification status.`}
      />
      <Card>
        <CardHeader icon={ShieldCheck} title={`${isKitchen ? "Kitchens" : "NGOs"} · ${formatNumber(total, 0)}`} subtitle="Verification actions are recorded by the backend." />
        <form className="k-redistribution-filter-row" onSubmit={applySearch}>
          <div className="k-admin-filter-search">
            <TextInput label="Search organizations" placeholder="Name, address or contact" value={search} onChange={(event) => setSearch(event.target.value)} />
            <Button type="submit" variant="secondary" icon={Search}>Search</Button>
          </div>
          <SelectInput
            label="Verification status"
            value={status}
            onChange={(event) => { setStatus(event.target.value); setPage(1); }}
            placeholder="All statuses"
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "VERIFIED", label: "Verified" },
              { value: "REJECTED", label: "Rejected" },
            ]}
          />
        </form>
        <div className="k-card-body">
          {loading ? <LoadingSkeleton rows={5} /> : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : rows.length ? (
            <>
              <div className="k-portal-list">
                {rows.map((organization) => (
                  <article className="k-portal-list-item" key={organization.id}>
                    <div className="k-redistribution-batch-heading">
                      <div>
                        <h3>{organization.name}</h3>
                        <p>{label === "NGO" ? "NGO" : "Kitchen"} #{organization.id} · Registered {formatDateTime(organization.created_at)}</p>
                      </div>
                      <VerificationBadge status={organization.verification_status} />
                    </div>
                    <dl className="k-redistribution-facts">
                      <div><dt>Address</dt><dd>{organization.address}</dd></div>
                      <div><dt>Contact</dt><dd><a href={`tel:${organization.phone}`}>{organization.phone}</a></dd></div>
                      <div><dt>Coordinates</dt><dd><MapPin size={13} aria-hidden="true" /> {organization.latitude}, {organization.longitude}</dd></div>
                    </dl>
                    <div className="k-redistribution-card-actions">
                      <Button size="sm" onClick={() => setPendingAction({ organization, status: "VERIFIED" })} disabled={organization.verification_status === "VERIFIED"}>Approve</Button>
                      <Button size="sm" variant="danger" onClick={() => setPendingAction({ organization, status: "REJECTED" })} disabled={organization.verification_status === "REJECTED"}>Reject</Button>
                      {organization.verification_status === "PENDING" ? <Badge tone="warning">Review needed</Badge> : null}
                    </div>
                  </article>
                ))}
              </div>
              <Pagination page={page} totalPages={totalPages} totalItems={total} pageSize={PAGE_SIZE} onChange={setPage} />
            </>
          ) : (
            <EmptyState icon={ShieldCheck} title={`No ${label} organizations found`} description={appliedSearch || status ? "Try changing the search or verification status filter." : "Registered organizations will appear here."} />
          )}
        </div>
      </Card>
      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={pendingAction?.status === "VERIFIED" ? "Approve organization" : "Reject organization"}
        description={actionDescription}
        confirmLabel={pendingAction?.status === "VERIFIED" ? "Approve" : "Reject"}
        tone={pendingAction?.status === "VERIFIED" ? "primary" : "danger"}
        loading={saving}
        onCancel={() => setPendingAction(null)}
        onConfirm={confirmVerification}
      >
        <p>Organization: <strong>{pendingAction?.organization.name}</strong></p>
        <p>Registered contact and location are shown above. No verification documents are provided by this endpoint.</p>
      </ConfirmDialog>
    </>
  );
}
