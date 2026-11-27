import { useId } from "react";
import { classNames } from "../../utils/format.js";

export function Field({ label, htmlFor, hint, error, required, children, className = "" }) {
  return (
    <div className={classNames("k-field", error && "k-field-error", className)}>
      {label ? (
        <label className="k-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="k-required" aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      {children}
      {hint && !error ? <p className="k-hint">{hint}</p> : null}
      {error ? <p className="k-field-message" role="alert">{error}</p> : null}
    </div>
  );
}

export function TextInput({ label, id, hint, error, required, className = "", ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={className}>
      <input
        id={inputId}
        className="k-input"
        aria-invalid={Boolean(error)}
        aria-describedby={hint ? `${inputId}-hint` : undefined}
        required={required}
        {...props}
      />
    </Field>
  );
}

export function SelectInput({ label, id, hint, error, required, options, placeholder, children, className = "", ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={className}>
      <select
        id={inputId}
        className="k-select"
        aria-invalid={Boolean(error)}
        required={required}
        {...props}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options
          ? options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          : children}
      </select>
    </Field>
  );
}

export function TextareaInput({ label, id, hint, error, required, rows = 3, className = "", ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} error={error} required={required} className={className}>
      <textarea
        id={inputId}
        className="k-textarea"
        rows={rows}
        aria-invalid={Boolean(error)}
        required={required}
        {...props}
      />
    </Field>
  );
}

export function CheckboxField({ label, description, id, className = "", ...props }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label className={classNames("k-checkbox", className)} htmlFor={inputId}>
      <input id={inputId} type="checkbox" {...props} />
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function TriStateField({ label, id, value, onChange, hint, yesLabel = "Yes", noLabel = "No", className = "" }) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field label={label} htmlFor={inputId} hint={hint} className={className}>
      <select
        id={inputId}
        className="k-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Unknown / not recorded</option>
        <option value="true">{yesLabel}</option>
        <option value="false">{noLabel}</option>
      </select>
    </Field>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return <p className="k-form-error" role="alert">{message}</p>;
}

export function FormGrid({ children, columns = 2, className = "" }) {
  return (
    <div className={classNames("k-form-grid", `k-form-grid-${columns}`, className)}>
      {children}
    </div>
  );
}

export function FormActions({ children, className = "" }) {
  return <div className={classNames("k-form-actions", className)}>{children}</div>;
}

export function FormSection({ title, description, children, className = "" }) {
  return (
    <section className={classNames("k-form-section", className)}>
      {title ? (
        <div className="k-form-section-heading">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
