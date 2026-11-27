import { BarChart3 } from "lucide-react";
import { Card, CardHeader } from "./Card.jsx";
import { EmptyState } from "./States.jsx";

export default function ChartContainer({
  title,
  subtitle,
  action,
  children,
  empty = false,
  emptyTitle = "Not enough data yet",
  emptyDescription,
  height = 280,
  icon = BarChart3,
}) {
  return (
    <Card className="k-chart-card">
      <CardHeader title={title} subtitle={subtitle} action={action} icon={icon} />
      <div className="k-chart-body" style={{ minHeight: height }}>
        {empty ? (
          <EmptyState
            icon={BarChart3}
            title={emptyTitle}
            description={emptyDescription}
            className="k-empty-compact"
          />
        ) : (
          children
        )}
      </div>
    </Card>
  );
}
