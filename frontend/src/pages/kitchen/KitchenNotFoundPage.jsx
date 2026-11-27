import { Compass, LayoutDashboard } from "lucide-react";
import PageHeader from "../../components/ui/PageHeader.jsx";
import Button from "../../components/ui/Button.jsx";
import { EmptyState } from "../../components/ui/States.jsx";

export default function KitchenNotFoundPage() {
  return (
    <>
      <PageHeader eyebrow="KITCHEN WORKSPACE" title="Page not found" />
      <EmptyState
        icon={Compass}
        title="This kitchen page does not exist"
        description="The address may be mistyped, or the page may not be part of this workspace."
        action={
          <Button to="/kitchen/dashboard" icon={LayoutDashboard}>
            Back to overview
          </Button>
        }
      />
    </>
  );
}
