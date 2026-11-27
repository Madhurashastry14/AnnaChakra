import { classNames } from "../../utils/format.js";

export function Card({ children, className = "", as: Tag = "section", ...props }) {
  return (
    <Tag className={classNames("k-card", className)} {...props}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon, className = "" }) {
  return (
    <div className={classNames("k-card-header", className)}>
      <div className="k-card-heading">
        {Icon ? (
          <span className="k-card-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        ) : null}
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="k-card-action">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className = "" }) {
  return <div className={classNames("k-card-body", className)}>{children}</div>;
}
