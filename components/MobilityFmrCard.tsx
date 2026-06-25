"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

const CHA_MOBILITY_MAP_URL =
  "https://thecha.maps.arcgis.com/apps/instant/basic/index.html?appid=5ce5a99dad2e4579b2095e514ad64294";

const CHA_MOBILITY_LAYER_URL =
  "https://services1.arcgis.com/sKK1AM3Thge46YuC/arcgis/rest/services/Mobility_Area_2025/FeatureServer/0";

type MobilityFmrCardProps = {
  propertyId: string;
  isMobilityArea?: boolean | null;
  mobilityCheckedAt?: string | null;
  mobilityMatchedAddress?: string | null;
  mobilityNotes?: string | null;
  mobilityLat?: number | string | null;
  mobilityLng?: number | string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "Not checked yet";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    return {
      success: false,
      message: text || "Server returned a non-JSON response.",
    };
  }
}

function buildMapSrcDoc({
  lat,
  lng,
  address,
}: {
  lat: number;
  lng: number;
  address?: string | null;
}) {
  const safeAddress = JSON.stringify(address || "Property");

  return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="initial-scale=1, maximum-scale=1, user-scalable=no" />
    <link rel="stylesheet" href="https://js.arcgis.com/4.30/esri/themes/light/main.css" />
    <script src="https://js.arcgis.com/4.30/"></script>
    <style>
      html, body, #viewDiv {
        padding: 0;
        margin: 0;
        height: 100%;
        width: 100%;
        font-family: Arial, sans-serif;
      }

      .map-label {
        position: absolute;
        left: 12px;
        top: 12px;
        z-index: 10;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        color: #0f172a;
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.18);
      }
    </style>
  </head>

  <body>
    <div id="viewDiv"></div>
    <div class="map-label">CHA Mobility Area Map + Property Location</div>

    <script>
      require([
        "esri/Map",
        "esri/views/MapView",
        "esri/layers/FeatureLayer",
        "esri/Graphic"
      ], function(Map, MapView, FeatureLayer, Graphic) {
        const lat = ${lat};
        const lng = ${lng};
        const address = ${safeAddress};

        const mobilityLayer = new FeatureLayer({
          url: "${CHA_MOBILITY_LAYER_URL}",
          opacity: 0.45,
          outFields: ["*"]
        });

        const map = new Map({
          basemap: "streets-navigation-vector",
          layers: [mobilityLayer]
        });

        const view = new MapView({
          container: "viewDiv",
          map,
          center: [lng, lat],
          zoom: 15,
          popup: {
            dockEnabled: true,
            dockOptions: {
              position: "bottom-right",
              breakpoint: false
            }
          }
        });

        const propertyPoint = {
          type: "point",
          longitude: lng,
          latitude: lat
        };

        const propertyMarker = new Graphic({
          geometry: propertyPoint,
          symbol: {
            type: "simple-marker",
            color: [220, 38, 38],
            size: 14,
            outline: {
              color: [255, 255, 255],
              width: 2
            }
          },
          attributes: {
            address
          },
          popupTemplate: {
            title: "Property Location",
            content: address
          }
        });

        view.graphics.add(propertyMarker);

        view.when(function() {
          view.openPopup({
            features: [propertyMarker],
            location: propertyPoint
          });
        });
      });
    </script>
  </body>
</html>
`;
}

export function MobilityFmrCard({
  propertyId,
  isMobilityArea,
  mobilityCheckedAt,
  mobilityMatchedAddress,
  mobilityNotes,
  mobilityLat,
  mobilityLng,
}: MobilityFmrCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const lat = toNumber(mobilityLat);
  const lng = toNumber(mobilityLng);
  const hasMapLocation = lat !== null && lng !== null;

  const mapSrcDoc = useMemo(() => {
    if (!hasMapLocation) return null;

    return buildMapSrcDoc({
      lat,
      lng,
      address: mobilityMatchedAddress,
    });
  }, [hasMapLocation, lat, lng, mobilityMatchedAddress]);

  async function runCheck() {
    setMessage("Checking CHA mobility area and applying FMR values...");

    try {
      const response = await fetch(`/api/properties/${propertyId}/mobility-fmr`, {
        method: "POST",
      });

      const result = await parseJsonResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Mobility/FMR check failed.");
      }

      setMessage(
        result.isMobilityArea
          ? "Mobility area confirmed. FMR values updated."
          : "Not in a mobility area. Base FMR values updated."
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Mobility/FMR check failed."
      );
    }
  }

  async function overrideMobilityStatus(nextIsMobilityArea: boolean) {
    const confirmed = window.confirm(
      nextIsMobilityArea
        ? "Mark this property as being in a CHA mobility area and apply mobility FMR?"
        : "Mark this property as NOT being in a CHA mobility area and apply base FMR?"
    );

    if (!confirmed) return;

    setMessage(
      nextIsMobilityArea
        ? "Manually marking as mobility area..."
        : "Manually marking as not in a mobility area..."
    );

    try {
      const response = await fetch(
        `/api/properties/${propertyId}/mobility-fmr/override`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            isMobilityArea: nextIsMobilityArea,
          }),
        }
      );

      const result = await parseJsonResponse(response);

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Manual override failed.");
      }

      setMessage(
        nextIsMobilityArea
          ? "Manually marked as mobility area. Mobility FMR values applied."
          : "Manually marked as not in mobility area. Base FMR values applied."
      );

      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      console.error(error);
      setMessage(
        error instanceof Error ? error.message : "Manual override failed."
      );
    }
  }

  const statusLabel =
    isMobilityArea === true
      ? "Yes"
      : isMobilityArea === false
        ? "No"
        : "Unknown";

  const statusColor =
    isMobilityArea === true
      ? "bg-green-50 text-green-700"
      : isMobilityArea === false
        ? "bg-slate-100 text-slate-700"
        : "bg-yellow-50 text-yellow-700";

  const centeredMapUrl =
    hasMapLocation
      ? `${CHA_MOBILITY_MAP_URL}&center=${lng},${lat}&level=15`
      : CHA_MOBILITY_MAP_URL;

  return (
    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">
            CHA Mobility / FMR Check
          </h3>
          <p className="text-sm text-slate-500">
            Checks whether this property is in a CHA mobility area, applies FMR
            values to each unit, and shows the property on the mobility map.
          </p>
        </div>

        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor}`}>
          Mobility Area: {statusLabel}
        </span>
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-sm text-slate-500">Last Checked</p>
          <p className="font-medium text-slate-950">
            {formatDate(mobilityCheckedAt)}
          </p>
        </div>

        <div>
          <p className="text-sm text-slate-500">Matched Address</p>
          <p className="font-medium text-slate-950">
            {mobilityMatchedAddress || "-"}
          </p>
        </div>
      </div>

      {mobilityNotes && (
        <p className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {mobilityNotes}
        </p>
      )}

      {message && (
        <p className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
          {message}
        </p>
      )}

      <div className="mb-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {mapSrcDoc ? (
          <iframe
            title="CHA Mobility Area Map"
            srcDoc={mapSrcDoc}
            className="h-[420px] w-full"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          />
        ) : (
          <div className="flex h-[220px] items-center justify-center p-6 text-center">
            <div>
              <p className="font-medium text-slate-950">
                Map will appear after the mobility check runs.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                The check saves the property latitude and longitude, then shows
                the property marker on the CHA mobility layer.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={runCheck}
          disabled={isPending}
          className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Checking..." : "Run Mobility / FMR Check"}
        </button>

        <button
          type="button"
          onClick={() => overrideMobilityStatus(true)}
          disabled={isPending}
          className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark as Mobility Area
        </button>

        <button
          type="button"
          onClick={() => overrideMobilityStatus(false)}
          disabled={isPending}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Mark as Not Mobility Area
        </button>

        <a
          href={centeredMapUrl}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Open Full Mobility Map
        </a>
      </div>
    </div>
  );
}