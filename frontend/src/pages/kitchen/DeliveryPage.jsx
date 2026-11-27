import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Edit3,
  Phone,
  Plus,
  Truck,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import {
  createDeliveryPerson,
  deactivateDeliveryPerson,
  listAllDeliveryPersonnel,
  listDeliveryPersonnel,
  updateDeliveryPerson,
} from "../../services/deliveryPersonnel.js";
import {
  listAllDeliveries,
  listAllDonations,
  updateDonation,
} from "../../services/redistribution.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatDateTime, formatNumber, formatQuantity, labelFor } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { ConfirmDialog, Modal } from "../../components/ui/Modal.jsx";
import { FormError, FormGrid, SelectInput, TextareaInput, TextInput } from "../../components/ui/Form.jsx";
import { EmptyState, ErrorState, LoadingSkeleton } from "../../components/ui/States.jsx";
import SegmentedControl from "../../components/ui/SegmentedControl.jsx";
import { useToast } from "../../components/feedback/ToastProvider.jsx";

const PAGE_SIZE = 10;

function validatePerson(form) {
  const errors = {};
  const name = form.name.trim();
  const phone = form.phone.trim();
  const digits = phone.replace(/\D/g, "");
  if (!name) errors.name = "Enter the person’s name.";
  else if (name.length > 150) errors.name = "Use 150 characters or fewer.";
  if (!phone) errors.phone = "Enter a phone number.";
  else if (phone.length < 7 || phone.length > 20 || digits.length < 7 || digits.length > 15) {
    errors.phone = "Enter a valid phone number (7–20 characters).";
  }
  return errors;
}

export default function DeliveryPage() {
  const { notify } = useToast();
  const [tab, setTab] = useState("active");
  const [page, setPage] = useState(1);
  const [people, setPeople] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [confirmPerson, setConfirmPerson] = useState(null);
  const [deactivating, setDeactivating] = useState(false);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [deliveryDonations, setDeliveryDonations] = useState([]);
  const [deliveryPeople, setDeliveryPeople] = useState([]);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [deliveryError, setDeliveryError] = useState("");
  const [deliveryReloadKey, setDeliveryReloadKey] = useState(0);
  const [assignments, setAssignments] = useState({});
  const [deliveryAction, setDeliveryAction] = useState({ id: null, action: "", reason: "" });
  const [deliveryActionError, setDeliveryActionError] = useState({});
  const [deliverySavingId, setDeliverySavingId] = useState(null);

  useEffect(() => {
    let active = true;
    setDeliveryLoading(true);
    setDeliveryError("");
    Promise.all([
      listAllDonations(),
      listAllDeliveries(),
      listAllDeliveryPersonnel({ isActive: true }),
      listAllDeliveryPersonnel({ isActive: false }),
    ])
      .then(([donations, deliveries, activePeople, inactivePeople]) => {
        if (!active) return;
        const deliveryDonationIds = new Set(deliveries.map((delivery) => delivery.donation_id));
        setDeliveryDonations(donations.filter((donation) => (
          donation.status === "ACCEPTED" || deliveryDonationIds.has(donation.id)
        )));
        setDeliveryPeople([...activePeople, ...inactivePeople]);
      })
      .catch((requestError) => {
        if (active) setDeliveryError(getErrorMessage(requestError, "We couldn’t load delivery assignments."));
      })
      .finally(() => {
        if (active) setDeliveryLoading(false);
      });
    return () => { active = false; };
  }, [deliveryReloadKey, reloadKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    listDeliveryPersonnel({
      isActive: tab === "active",
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return;
        setPeople(result.items ?? []);
        setTotal(result.total ?? 0);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError, "We couldn’t load delivery personnel."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [tab, page, reloadKey]);

  function changeTab(nextTab) {
    setTab(nextTab);
    setPage(1);
  }

  function openCreate() {
    setEditingPerson(null);
    setForm({ name: "", phone: "" });
    setFormErrors({});
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(person) {
    setEditingPerson(person);
    setForm({ name: person.name, phone: person.phone });
    setFormErrors({});
    setFormError("");
    setModalOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    const errors = validatePerson(form);
    setFormErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      if (editingPerson) {
        await updateDeliveryPerson(editingPerson.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
        });
        notify("Delivery person updated.");
      } else {
        await createDeliveryPerson({
          name: form.name.trim(),
          phone: form.phone.trim(),
        });
        notify("Delivery person added.");
      }
      setModalOpen(false);
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      setFormError(getErrorMessage(requestError, "We couldn’t save this delivery person."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!confirmPerson) return;
    setDeactivating(true);
    try {
      await deactivateDeliveryPerson(confirmPerson.id);
      notify("Delivery person deactivated.");
      setConfirmPerson(null);
      if (people.length === 1 && page > 1) setPage((current) => current - 1);
      else setReloadKey((key) => key + 1);
    } catch (requestError) {
      notify(getErrorMessage(requestError, "We couldn’t deactivate this delivery person."), "error");
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivate(person) {
    setReactivatingId(person.id);
    try {
      await updateDeliveryPerson(person.id, { is_active: true });
      notify("Delivery person reactivated.");
      setReloadKey((key) => key + 1);
    } catch (requestError) {
      notify(getErrorMessage(requestError, "We couldn’t reactivate this delivery person."), "error");
    } finally {
      setReactivatingId(null);
    }
  }

  function updateAssignment(donationId, field, value) {
    setAssignments((current) => ({
      ...current,
      [donationId]: { ...(current[donationId] ?? { personId: "", notes: "" }), [field]: value },
    }));
    setDeliveryActionError((current) => ({ ...current, [donationId]: "" }));
  }

  async function runDonationAction(donationId, action, payload) {
    setDeliverySavingId(donationId);
    setDeliveryActionError((current) => ({ ...current, [donationId]: "" }));
    try {
      await updateDonation(donationId, action, payload);
      notify(action === "assign-delivery" ? "Delivery assignment confirmed." : "Delivery status updated.");
      setDeliveryAction({ id: null, action: "", reason: "" });
      setDeliveryReloadKey((key) => key + 1);
    } catch (requestError) {
      setDeliveryActionError((current) => ({
        ...current,
        [donationId]: getErrorMessage(requestError, "The backend could not update this delivery."),
      }));
    } finally {
      setDeliverySavingId(null);
    }
  }

  function assignDonation(donation) {
    const form = assignments[donation.id] ?? {};
    if (!form.personId) {
      setDeliveryActionError((current) => ({ ...current, [donation.id]: "Select an active delivery person." }));
      return;
    }
    runDonationAction(donation.id, "assign-delivery", {
      delivery_person_id: Number(form.personId),
      notes: form.notes.trim() || null,
    });
  }

  function failDelivery(donation) {
    if (deliveryAction.id !== donation.id || !deliveryAction.reason.trim()) {
      setDeliveryAction({ id: donation.id, action: "report-failure", reason: "" });
      setDeliveryActionError((current) => ({ ...current, [donation.id]: "Enter a reason for reporting this delivery failure." }));
      return;
    }
    runDonationAction(donation.id, "report-failure", { reason: deliveryAction.reason.trim() });
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeDeliveryPeople = deliveryPeople.filter((person) => person.is_active);
  const driverById = new Map(deliveryPeople.map((person) => [person.id, person]));
  const deliverySections = [
    { key: "ACCEPTED", title: "Accepted offers awaiting assignment", rows: deliveryDonations.filter((row) => row.status === "ACCEPTED") },
    { key: "ASSIGNED", title: "Assigned deliveries", rows: deliveryDonations.filter((row) => row.status === "ASSIGNED") },
    { key: "IN_TRANSIT", title: "In-transit deliveries", rows: deliveryDonations.filter((row) => row.status === "IN_TRANSIT") },
    { key: "DELIVERED", title: "Delivered food", rows: deliveryDonations.filter((row) => row.status === "DELIVERED") },
    { key: "COMPLETED", title: "Completed donations", rows: deliveryDonations.filter((row) => row.status === "COMPLETED") },
    { key: "CANCELLED", title: "Failed or cancelled deliveries", rows: deliveryDonations.filter((row) => row.status === "CANCELLED" || row.failed_at) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Delivery management"
        description="Assign kitchen delivery personnel, dispatch accepted donations and record delivery status."
        actions={<Button icon={Plus} onClick={openCreate}>Add person</Button>}
      />

      <Card className="k-redistribution-section">
        <CardHeader
          icon={Truck}
          title="Donation deliveries"
          subtitle="Assignments and status timestamps are loaded from the kitchen-scoped donation and delivery APIs."
          action={<Button variant="secondary" size="sm" onClick={() => setDeliveryReloadKey((key) => key + 1)}>Refresh</Button>}
        />
        <div className="k-card-body">
          {deliveryLoading ? <LoadingSkeleton rows={4} /> : deliveryError ? (
            <ErrorState message={deliveryError} onRetry={() => setDeliveryReloadKey((key) => key + 1)} />
          ) : deliverySections.map((section) => (
            <section className="k-delivery-section" key={section.key}>
              <h3>{section.title}</h3>
              {section.rows.length ? (
                <div className="k-delivery-list">
                  {section.rows.map((donation) => {
                    const selectedPersonId = assignments[donation.id]?.personId ?? "";
                    const selectedPerson = driverById.get(Number(selectedPersonId));
                    const showFailureForm = deliveryAction.id === donation.id && deliveryAction.action === "report-failure";
                    return (
                      <article className="k-delivery-item" key={donation.id}>
                        <div className="k-redistribution-batch-heading">
                          <div>
                            <h4><Link to={`/kitchen/donations/${donation.id}`}>Donation #{donation.id}</Link> · {donation.ngo_name}</h4>
                            <p>{donation.items?.map((item) => `${item.food_name} (${formatQuantity(item.offered_servings, item.serving_unit)})`).join(" · ")}</p>
                          </div>
                          <Badge tone={donation.status === "COMPLETED" || donation.status === "DELIVERED" ? "success" : donation.status === "CANCELLED" ? "danger" : "info"}>{labelFor(donation.status)}</Badge>
                        </div>

                        {donation.delivery ? (
                          <dl className="k-redistribution-facts">
                            <div><dt>Assigned</dt><dd>{donation.delivery.assigned_at ? formatDateTime(donation.delivery.assigned_at) : "—"}</dd></div>
                            <div><dt>Dispatched</dt><dd>{donation.delivery.dispatched_at ? formatDateTime(donation.delivery.dispatched_at) : "—"}</dd></div>
                            <div><dt>Delivered</dt><dd>{donation.delivery.delivered_at ? formatDateTime(donation.delivery.delivered_at) : "—"}</dd></div>
                          </dl>
                        ) : null}
                        {donation.delivery?.notes ? <p className="k-muted-text">Instructions: {donation.delivery.notes}</p> : null}

                        {donation.status === "ACCEPTED" ? (
                          <div className="k-delivery-assignment">
                            {activeDeliveryPeople.length ? (
                              <>
                                <SelectInput
                                  label="Active kitchen delivery person"
                                  value={selectedPersonId}
                                  onChange={(event) => updateAssignment(donation.id, "personId", event.target.value)}
                                  placeholder="Select a delivery person"
                                  options={activeDeliveryPeople.map((person) => ({ value: String(person.id), label: `${person.name} · ${person.phone}` }))}
                                />
                                {selectedPerson ? <p className="k-muted-text">Contact: {selectedPerson.name} · {selectedPerson.phone}</p> : null}
                                <TextareaInput
                                  label="Delivery instructions"
                                  rows={2}
                                  value={assignments[donation.id]?.notes ?? ""}
                                  onChange={(event) => updateAssignment(donation.id, "notes", event.target.value)}
                                  maxLength={1000}
                                  hint="Optional, up to 1,000 characters."
                                />
                                <Button loading={deliverySavingId === donation.id} onClick={() => assignDonation(donation)}>Confirm assignment</Button>
                              </>
                            ) : <p className="k-muted-text">No active delivery personnel are available. Add or reactivate someone below.</p>}
                          </div>
                        ) : null}

                        {donation.status === "ASSIGNED" ? (
                          <>
                            <Button loading={deliverySavingId === donation.id} onClick={() => runDonationAction(donation.id, "dispatch", null)}>Dispatch delivery</Button>
                          </>
                        ) : null}
                        {donation.status === "IN_TRANSIT" ? (
                          <div className="k-redistribution-card-actions">
                            <Button loading={deliverySavingId === donation.id} onClick={() => runDonationAction(donation.id, "delivered", null)}>Mark delivered</Button>
                            <Button
                              variant="secondary"
                              disabled={deliverySavingId === donation.id}
                              onClick={() => {
                                setDeliveryAction({ id: donation.id, action: "report-failure", reason: "" });
                                setDeliveryActionError((current) => ({ ...current, [donation.id]: "" }));
                              }}
                            >
                              Report delivery failure
                            </Button>
                          </div>
                        ) : null}
                        {showFailureForm ? (
                          <div className="k-delivery-assignment">
                            <TextareaInput
                              label="Reason for delivery failure"
                              value={deliveryAction.reason}
                              onChange={(event) => {
                                setDeliveryAction((current) => ({ ...current, reason: event.target.value }));
                                setDeliveryActionError((current) => ({ ...current, [donation.id]: "" }));
                              }}
                              maxLength={1000}
                              required
                            />
                            <Button variant="danger" loading={deliverySavingId === donation.id} onClick={() => failDelivery(donation)}>Confirm failure</Button>
                          </div>
                        ) : null}
                        {donation.status === "DELIVERED" ? (
                          <>
                            <p className="k-callout k-callout-info">Delivery is recorded. NGO receipt confirmation is pending.</p>
                            <Button
                              variant="secondary"
                              disabled={deliverySavingId === donation.id}
                              onClick={() => {
                                setDeliveryAction({ id: donation.id, action: "report-failure", reason: "" });
                                setDeliveryActionError((current) => ({ ...current, [donation.id]: "" }));
                              }}
                            >
                              Report delivery failure
                            </Button>
                          </>
                        ) : null}
                        {donation.status === "COMPLETED" ? <p className="k-callout k-callout-success">The NGO has confirmed receipt.</p> : null}
                        {donation.failed_at || donation.status === "CANCELLED" ? (
                          <p className="k-muted-text">{donation.failure_reason || donation.cancellation_reason || "Delivery cancelled"}{donation.failed_at ? ` · ${formatDateTime(donation.failed_at)}` : ""}</p>
                        ) : null}
                        {donation.is_simulated ? <span className="k-demo-label">Demonstration data only. Not approved for actual consumption.</span> : null}
                        {deliveryActionError[donation.id] ? <p className="k-form-error" role="alert">{deliveryActionError[donation.id]}</p> : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="k-muted-text">No records in this stage.</p>
              )}
            </section>
          ))}
        </div>
      </Card>

      <Card>
        <div className="k-filter-bar">
          <SegmentedControl
            label="Personnel status"
            value={tab}
            onChange={changeTab}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <div className="k-filter-actions">
            <span className="k-muted-text">
              {formatNumber(total, 0)} {tab === "active" ? "active" : "inactive"}{" "}
              {total === 1 ? "person" : "people"}
            </span>
          </div>
        </div>

        <div className="k-card-body k-card-body-flush">
          {loading ? (
            <LoadingSkeleton variant="table" rows={5} />
          ) : error ? (
            <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />
          ) : (
            <DataTable
              rows={people}
              rowKey={(row) => row.id}
              columns={[
                {
                  key: "name",
                  label: "Name",
                  render: (row) => (
                    <div className="k-table-primary">
                      <strong>{row.name}</strong>
                      <small>Personnel #{row.id}</small>
                    </div>
                  ),
                },
                {
                  key: "phone",
                  label: "Phone",
                  render: (row) => (
                    <span className="k-phone-cell">
                      <Phone size={14} aria-hidden="true" /> {row.phone}
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => (
                    <Badge tone={row.is_active ? "success" : "neutral"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  render: (row) => (
                    <div className="k-row-actions">
                      <Button variant="ghost" size="sm" icon={Edit3} onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      {row.is_active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={UserX}
                          onClick={() => setConfirmPerson(row)}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={UserCheck}
                          loading={reactivatingId === row.id}
                          onClick={() => handleReactivate(row)}
                        >
                          Reactivate
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
              empty={
                <EmptyState
                  icon={UserPlus}
                  title={tab === "active" ? "No active delivery personnel" : "No inactive delivery personnel"}
                  description={
                    tab === "active"
                      ? "Add a delivery person so your kitchen can keep collection contacts in one place."
                      : "Deactivated personnel appear here and can be reactivated."
                  }
                  action={
                    tab === "active" ? (
                      <Button icon={Plus} onClick={openCreate}>Add person</Button>
                    ) : null
                  }
                />
              }
            />
          )}
        </div>

        {!loading && !error && total > PAGE_SIZE ? (
          <div className="k-card-footer">
            <Pagination
              page={page}
              totalPages={totalPages}
              onChange={setPage}
              totalItems={total}
              pageSize={PAGE_SIZE}
            />
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader
          icon={Truck}
          title="Delivery personnel"
          subtitle="Assignments are limited to active people managed by this kitchen."
        />
        <div className="k-card-body">
          <p>Manage the people who may collect and deliver food for this kitchen. Their name and phone number are shown at assignment.</p>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => {
          if (!saving) setModalOpen(false);
        }}
        title={editingPerson ? "Edit delivery person" : "Add delivery person"}
        description={
          editingPerson
            ? "Update the contact details for this delivery person."
            : "Add someone who can collect or deliver food for your kitchen."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="delivery-person-form" loading={saving} icon={UserPlus}>
              {editingPerson ? "Save changes" : "Add person"}
            </Button>
          </>
        }
      >
        <form id="delivery-person-form" className="k-form" onSubmit={handleSave} noValidate>
          <FormGrid columns={1}>
            <TextInput
              label="Full name"
              value={form.name}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }));
                setFormErrors((current) => ({ ...current, name: undefined }));
              }}
              error={formErrors.name}
              maxLength={150}
              required
            />
            <TextInput
              label="Phone number"
              type="tel"
              value={form.phone}
              onChange={(event) => {
                setForm((current) => ({ ...current, phone: event.target.value }));
                setFormErrors((current) => ({ ...current, phone: undefined }));
              }}
              error={formErrors.phone}
              maxLength={20}
              required
              hint="7–20 characters. The backend normalises the stored number."
            />
          </FormGrid>
          <FormError message={formError} />
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmPerson)}
        title={`Deactivate ${confirmPerson?.name ?? "this person"}?`}
        description="They will no longer appear in the active personnel list. You can reactivate them later."
        confirmLabel="Deactivate"
        loading={deactivating}
        onConfirm={handleDeactivate}
        onCancel={() => setConfirmPerson(null)}
      />
    </>
  );
}
