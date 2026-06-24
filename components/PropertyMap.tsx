"use client";

import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";

type Property = {
  id: string;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  status: string | null;
  asking_price: number | null;
  latitude: number | null;
  longitude: number | null;
  condition: string | null;
  property_tags?: {
    id: string;
    tag: string;
  }[];
};

type PropertyMapProps = {
  properties: Property[];
};

function formatCurrency(value: number | null) {
  if (!value) return "No price";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

const propertyIcon = L.divIcon({
  className: "property-map-marker",
  html: `<div style="
    height: 18px;
    width: 18px;
    border-radius: 9999px;
    background: #0f172a;
    border: 3px solid white;
    box-shadow: 0 2px 8px rgba(0,0,0,0.35);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export function PropertyMap({ properties }: PropertyMapProps) {
  const mappedProperties = properties.filter(
    (property) => property.latitude && property.longitude
  );

  const center: [number, number] =
    mappedProperties.length > 0
      ? [
          Number(mappedProperties[0].latitude),
          Number(mappedProperties[0].longitude),
        ]
      : [41.8781, -87.6298];

  return (
    <div className="h-[650px] overflow-hidden rounded-lg border border-slate-200 bg-white">
      <MapContainer center={center} zoom={11} className="h-full w-full">
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {mappedProperties.map((property) => (
          <Marker
            key={property.id}
            position={[Number(property.latitude), Number(property.longitude)]}
            icon={propertyIcon}
          >
            <Popup>
              <div className="space-y-1">
                <p className="font-semibold">{property.address}</p>
                <p>
                  {property.city}, {property.state} {property.zip}
                </p>
                <p>{property.property_type || "No type"}</p>
                <p>{formatCurrency(property.asking_price)}</p>
                {property.property_tags && property.property_tags.length > 0 && (
                  <div style={{ marginTop: "6px" }}>
                    {property.property_tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        style={{
                          display: "inline-block",
                          marginRight: "4px",
                          marginBottom: "4px",
                          padding: "2px 6px",
                          border: "1px solid #cbd5e1",
                          borderRadius: "9999px",
                          fontSize: "11px",
                        }}
                      >
                        {tag.tag}
                      </span>
                    ))}
                  </div>
                )}
                <Link href={`/properties/${property.id}`}>Open property</Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}