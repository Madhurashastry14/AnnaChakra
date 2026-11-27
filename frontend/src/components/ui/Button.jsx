import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { classNames } from "../../utils/format.js";

export default function Button({
  children,
  variant = "primary",
  size = "md",
  to,
  href,
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  className = "",
  type = "button",
  ...props
}) {
  const classes = classNames(
    "k-btn",
    `k-btn-${variant}`,
    size !== "md" && `k-btn-${size}`,
    className,
  );

  const content = (
    <>
      {loading ? <Loader2 className="k-spin" size={16} aria-hidden="true" /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}
      <span>{children}</span>
      {IconRight && !loading ? <IconRight size={16} aria-hidden="true" /> : null}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={classes} {...props}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} className={classes} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...props}>
      {content}
    </button>
  );
}
