import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backTo,
  backLabel = "Back",
}) {
  return (
    <header className="k-page-header">
      {backTo ? (
        <Link className="k-back-link" to={backTo}>
          <ArrowLeft size={15} aria-hidden="true" /> {backLabel}
        </Link>
      ) : null}
      <div className="k-page-header-row">
        <div className="k-page-heading">
          {eyebrow ? <p className="k-eyebrow">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p className="k-page-description">{description}</p> : null}
        </div>
        {actions ? <div className="k-page-actions">{actions}</div> : null}
      </div>
    </header>
  );
}
