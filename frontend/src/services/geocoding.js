const PHOTON_ENDPOINT = "https://photon.komoot.io/api/";

function displayAddress(properties) {
  const parts = [
    properties.name,
    properties.street,
    properties.city ?? properties.locality ?? properties.district,
    properties.state,
    properties.country,
  ];
  return [...new Set(parts.filter(Boolean))].join(", ");
}

export async function searchPlaces(query, { limit = 6, signal } = {}) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    lang: "en",
  });
  const response = await fetch(`${PHOTON_ENDPOINT}?${params.toString()}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Place search failed with status ${response.status}`);
  }
  const payload = await response.json();
  return (payload.features ?? [])
    .map((feature, index) => {
      const properties = feature.properties ?? {};
      const [longitude, latitude] = feature.geometry?.coordinates ?? [];
      return {
        id: `${properties.osm_type ?? "place"}-${properties.osm_id ?? index}`,
        address: displayAddress(properties) || query,
        latitude,
        longitude,
      };
    })
    .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}
