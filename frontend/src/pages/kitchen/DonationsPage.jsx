import {
  HandHeart,
  Info,
  ShieldCheck,
  Trash2,
  Truck,
} from "lucide-react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { Card, CardHeader } from "../../components/ui/Card.jsx";
import { EmptyState } from "../../components/ui/States.jsx";

export default function DonationsPage() {
  return (
    <>
      <PageHeader
        eyebrow="REDISTRIBUTION"
        title="Donations"
        description="Donation matching and dispatch are not available in this build. This page does not show fabricated offers or deliveries."
        actions={
          <Button variant="secondary" to="/kitchen/waste-logs" icon={Trash2}>
            Review waste logs
          </Button>
        }
      />

      <EmptyState
        icon={HandHeart}
        title="Donation matching is not available yet"
        description="The current backend does not expose donation, NGO-matching or delivery-dispatch endpoints for kitchen staff. Nothing is invented here."
        action={
          <Button to="/kitchen/waste-logs" icon={Trash2}>
            Open waste logs
          </Button>
        }
      />

      <Card>
        <CardHeader
          icon={Info}
          title="What you can do today"
          subtitle="These capabilities are backed by the current API."
        />
        <div className="k-card-body">
          <ul className="k-check-list">
            <li>
              <ShieldCheck size={16} aria-hidden="true" />
              Record surplus and plate waste, then let the backend screen redistribution
              eligibility.
            </li>
            <li>
              <Trash2 size={16} aria-hidden="true" />
              Review each waste log’s safety status, remaining quantity and redistribution
              deadline.
            </li>
            <li>
              <Truck size={16} aria-hidden="true" />
              Keep delivery personnel contact details in the Delivery page. Assignment tracking
              is not part of this build.
            </li>
          </ul>

          <div className="k-callout k-callout-warning">
            <Info size={17} aria-hidden="true" />
            <div>
              <strong>No donation records are created from this page</strong>
              <p>
                A food-safety “eligible” status is a screening result, not a guarantee. Do not
                treat it as a donation confirmation or as permission to skip your kitchen’s
                food-safety procedures.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}
