import { useEffect, useState } from "react";
import {
  Edit3,
  Info,
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
  listDeliveryPersonnel,
  updateDeliveryPerson,
} from "../../services/deliveryPersonnel.js";
import { getErrorMessage } from "../../utils/errors.js";
import { formatNumber } from "../../utils/format.js";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { Badge } from "../../components/ui/Badge.jsx";
import DataTable from "../../components/ui/DataTable.jsx";
import Pagination from "../../components/ui/Pagination.jsx";
import { ConfirmDialog, Modal } from "../../components/ui/Modal.jsx";
import { FormError, FormGrid, TextInput } from "../../components/ui/Form.jsx";
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Delivery personnel"
        description="Manage the people who can collect and deliver food for your kitchen. This build does not include delivery assignment endpoints."
        actions={<Button icon={Plus} onClick={openCreate}>Add person</Button>}
      />

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
          title="Delivery assignments"
          subtitle="The current backend exposes personnel management only."
        />
        <div className="k-card-body">
          <div className="k-callout k-callout-warning">
            <Info size={17} aria-hidden="true" />
            <div>
              <strong>Assignment tracking is not available in this build</strong>
              <p>
                There are no delivery-assignment or dispatch endpoints in the current API, so this
                page does not invent assignments, statuses or ETAs. Personnel you add here are
                stored by the backend and can be used when assignment support is added.
              </p>
            </div>
          </div>
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
