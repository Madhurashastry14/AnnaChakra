import {
  BadgeCheck,
  Clock3,
  FlaskConical,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
} from "lucide-react";
import { classNames, labelFor, methodLabel, safetyTone } from "../../utils/format.js";

export function Badge({ children, tone = "neutral", className = "", icon: Icon }) {
  return (
    <span className={classNames("k-badge", `k-badge-${tone}`, className)}>
      {Icon ? <Icon size={13} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

export function VerificationBadge({ status, className = "" }) {
  if (status === "VERIFIED") {
    return <Badge tone="success" icon={BadgeCheck} className={className}>Verified</Badge>;
  }
  if (status === "REJECTED") {
    return <Badge tone="danger" icon={ShieldAlert} className={className}>Verification rejected</Badge>;
  }
  return <Badge tone="warning" icon={Clock3} className={className}>Pending verification</Badge>;
}

export function SafetyBadge({ status, className = "" }) {
  if (!status) return <Badge tone="neutral" className={className}>Not screened</Badge>;
  const Icon = status === "ELIGIBLE" ? ShieldCheck : status === "INELIGIBLE" ? ShieldAlert : ShieldQuestion;
  return (
    <Badge tone={safetyTone(status)} icon={Icon} className={className}>
      {labelFor(status)}
    </Badge>
  );
}

export function MethodBadge({ method, className = "" }) {
  const tone = method === "ML" ? "info" : method === "LOCAL_HISTORY" ? "success" : "neutral";
  const Icon = method === "ML" ? Sparkles : method === "LOCAL_HISTORY" ? FlaskConical : null;
  return (
    <Badge tone={tone} icon={Icon} className={className}>
      {methodLabel(method)}
    </Badge>
  );
}

export function RoleBadge({ role, className = "" }) {
  return <Badge tone="outline" className={className}>{labelFor(role, "Unclassified")}</Badge>;
}
