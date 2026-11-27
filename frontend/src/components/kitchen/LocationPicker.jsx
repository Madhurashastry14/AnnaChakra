import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { KITCHEN_DEFAULT_CENTER } from "../../utils/kitchen.js";

function MapClickHandler({ onPick }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function MapUpdater({ latitude, longitude }) {
  const map = useMap();

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.setView([latitude, longitude], map.getZoom(), { animate: true });
  }, [latitude, longitude, map]);

  return null;
}

export default function LocationPicker({ latitude, longitude, onChange, height = 320 }) {
  const valid = Number.isFinite(latitude) && Number.isFinite(longitude);
  const center = valid ? [latitude, longitude] : KITCHEN_DEFAULT_CENTER;

  return (
    <div className="k-map-wrap" style={{ height }}>
      <MapContainer
        center={center}
        zoom={valid ? 14 : 11}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapClickHandler onPick={onChange} />
        <MapUpdater latitude={latitude} longitude={longitude} />
        {valid ? (
          <CircleMarker
            center={[latitude, longitude]}
            radius={11}
            pathOptions={{ color: "#245c3e", fillColor: "#287d50", fillOpacity: 0.85, weight: 3 }}
          />
        ) : null}
      </MapContainer>
      <p className="k-map-hint">Click anywhere on the map to set the kitchen location.</p>
    </div>
  );
}
