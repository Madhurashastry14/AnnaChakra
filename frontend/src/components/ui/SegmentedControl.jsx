import { classNames } from "../../utils/format.js";

export default function SegmentedControl({ options, value, onChange, label, className = "" }) {
  return (
    <div className={classNames("k-segmented", className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          className={classNames("k-segmented-button", value === option.value && "is-active")}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
          {option.count !== undefined ? <span>{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
