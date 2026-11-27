import { Search, X } from "lucide-react";

export default function SearchInput({ value, onChange, placeholder = "Search…", label = "Search", id }) {
  return (
    <div className="k-search">
      <Search size={16} aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
