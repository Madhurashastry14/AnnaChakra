import { useEffect, useId, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { TextInput } from "./Form.jsx";
import { searchPlaces } from "../../services/geocoding.js";

export default function PlaceSearch({
  label = "Search for a place",
  hint = "Type a locality, street or landmark and pick a result to fill the address and coordinates automatically.",
  onSelect,
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const inputId = useId();
  const requestRef = useRef(0);
  const lastSelectedRef = useRef("");

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed && trimmed === lastSelectedRef.current) {
      lastSelectedRef.current = "";
      return undefined;
    }
    lastSelectedRef.current = "";
    if (trimmed.length < 3) {
      setResults([]);
      setLoading(false);
      setError("");
      setSearched(false);
      return undefined;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const request = ++requestRef.current;
      setLoading(true);
      setError("");
      try {
        const places = await searchPlaces(trimmed, { signal: controller.signal });
        if (request !== requestRef.current) return;
        setResults(places);
        setSearched(true);
      } catch (requestError) {
        if (requestError.name === "AbortError" || request !== requestRef.current) return;
        setResults([]);
        setSearched(true);
        setError("Place search is unavailable right now. Enter coordinates manually or click the map.");
      } finally {
        if (request === requestRef.current) setLoading(false);
      }
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  function choose(place) {
    lastSelectedRef.current = place.address;
    setQuery(place.address);
    setResults([]);
    setSearched(false);
    setError("");
    onSelect?.(place);
  }

  return (
    <div className="k-place-search">
      <TextInput
        id={inputId}
        label={label}
        hint={hint}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="e.g. Puttur, Karnataka or a street address"
        autoComplete="off"
        maxLength={200}
        disabled={disabled}
        aria-autocomplete="list"
        aria-controls={`${inputId}-results`}
        aria-expanded={results.length > 0}
      />
      {loading ? <p className="k-hint" role="status">Searching places…</p> : null}
      {error ? <p className="k-field-message" role="alert">{error}</p> : null}
      {results.length > 0 ? (
        <ul className="k-place-results" id={`${inputId}-results`} role="listbox">
          {results.map((place) => (
            <li key={place.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => choose(place)}>
                <MapPin size={14} aria-hidden="true" />
                <span>{place.address}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {searched && !loading && !error && results.length === 0 ? (
        <p className="k-hint" role="status">No matching places. Try a nearby city, landmark or street.</p>
      ) : null}
    </div>
  );
}
