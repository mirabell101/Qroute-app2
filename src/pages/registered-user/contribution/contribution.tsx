import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Car,
  Home as HomeIcon,
  ImagePlus,
  LocateFixed,
  MapPin,
  MessageSquare,
  UserCircle,
  Plus,
  Trash2,
} from "lucide-react";
import {
  CircleMarker,
  MapContainer,
  Marker,
  Pane,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { getMapIcon } from "@/lib/mapIcons";
import { attachMapImage, validateImage } from "@/lib/mapImages";
import {
  getMyContributions,
  getTransitCatalog,
  getTransportOptions,
  pointKey,
  submitContribution,
} from "@/lib/contributions";
import type {
  ContributionInput,
  ContributionKind,
  ExistingPoint,
  ExistingRoute,
  MyContribution,
  PointInput,
  PointKind,
  StopKind,
  TransportTypeOption,
  TransportVariantOption,
} from "@/lib/contributions";

// Leaflet's default marker config (used for the single draggable pin).
delete (
  L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface ContributionProps {
  currentUserId: string;
  onLogout: () => void;
}

type Coordinates = [number, number];

interface PhotoItem {
  file: File;
  previewUrl: string;
}

interface RoutePoint {
  key: string;
  kind: PointKind;
  existingId: number | null; // set when this is an already-approved point
  name: string;
  description: string;
  stopType: StopKind;
  latitude: number;
  longitude: number;
  photo: PhotoItem | null;
}

interface PreviewLine {
  id: number;
  positions: Coordinates[];
  color: string;
}

const defaultPosition: Coordinates = [14.7167, 121.05];
const MAX_PHOTOS = 3;
const MAX_ROUTE_POINTS = 60;

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

const kindOptions: { value: ContributionKind; label: string; hint: string }[] =
  [
    { value: "terminal", label: "Terminal", hint: "Where vehicles start or end" },
    { value: "stop", label: "Stop", hint: "A stop or station" },
    { value: "route", label: "Route", hint: "A path made of several points" },
  ];

const kindLabel: Record<ContributionKind, string> = {
  terminal: "Terminal",
  stop: "Stop",
  route: "Route",
};

function formatDate(date: string) {
  return new Date(date).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function safeColor(color: string | undefined) {
  return color && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : "#12395A";
}

function numberedIcon(position: number, color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:#fff;width:26px;height:26px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font:600 12px sans-serif">${position}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function existingLabel(point: ExistingPoint) {
  return point.kind === "stop" && point.stopType === "train_station"
    ? `${point.name} (Station)`
    : point.name;
}

function existingPointTypeLabel(point: ExistingPoint) {
  if (point.kind === "terminal") return "Terminal";
  return point.stopType === "train_station" ? "Station" : "Stop";
}

function toRoutePoint(point: ExistingPoint): RoutePoint {
  return {
    key: crypto.randomUUID(),
    kind: point.kind,
    existingId: point.id,
    name: point.name,
    description: "",
    stopType: point.stopType === "train_station" ? "train_station" : "road_stop",
    latitude: point.latitude,
    longitude: point.longitude,
    photo: null,
  };
}

// ==================================================
// MAP HELPERS
// ==================================================

function ClickToPin({ onPick }: { onPick: (position: Coordinates) => void }) {
  useMapEvents({
    click: (event) => onPick([event.latlng.lat, event.latlng.lng]),
  });
  return null;
}

function FlyTo({ position }: { position: Coordinates | null }) {
  const map = useMap();
  const latitude = position?.[0];
  const longitude = position?.[1];

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    map.flyTo([latitude, longitude], 17, { duration: 0.6 });
  }, [map, latitude, longitude]);

  return null;
}

// Fix the map size when it appears inside the modal.
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 150);
    return () => window.clearTimeout(timer);
  }, [map]);
  return null;
}

function FitRouteLines({
  lines,
  selectedRouteId,
}: {
  lines: PreviewLine[];
  selectedRouteId: number | null;
}) {
  const map = useMap();

  useEffect(() => {
    const visibleLines = selectedRouteId
      ? lines.filter((line) => line.id === selectedRouteId)
      : lines;
    const positions = visibleLines.flatMap((line) => line.positions);
    if (positions.length === 0) return;

    const bounds = L.latLngBounds(positions);
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15, animate: true });
  }, [map, lines, selectedRouteId]);

  return null;
}

interface PinMapProps {
  currentPosition: Coordinates | null;
  focus: Coordinates | null;
  mode: ContributionKind;
  pin: Coordinates | null;
  routePoints: RoutePoint[];
  routeColor: string;
  candidates: ExistingPoint[];
  stopCandidates: ExistingPoint[];
  selectedStopReferenceKey: string | null;
  selectedPreviewRouteId: number | null;
  connectedKeys: Set<string>;
  previewLines: PreviewLine[];
  onPick: (position: Coordinates) => void;
  onPickExisting: (point: ExistingPoint) => void;
  onPickStopReference: (point: ExistingPoint) => void;
  onMovePin: (position: Coordinates) => void;
  onMoveRoutePoint: (index: number, position: Coordinates) => void;
}

function PinMap({
  currentPosition,
  focus,
  mode,
  pin,
  routePoints,
  routeColor,
  candidates,
  stopCandidates,
  selectedStopReferenceKey,
  selectedPreviewRouteId,
  connectedKeys,
  previewLines,
  onPick,
  onPickExisting,
  onPickStopReference,
  onMovePin,
  onMoveRoutePoint,
}: PinMapProps) {
  return (
    <MapContainer
      center={currentPosition ?? defaultPosition}
      zoom={currentPosition ? 17 : 14}
      scrollWheelZoom
      className="h-full w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <InvalidateOnMount />
      <FlyTo position={focus ?? currentPosition} />
      <FitRouteLines
        lines={previewLines}
        selectedRouteId={selectedPreviewRouteId}
      />
      <ClickToPin onPick={onPick} />

      {currentPosition && (
        <Marker
          position={currentPosition}
          icon={getMapIcon("current_location")}
          interactive={false}
        />
      )}

      <Pane name="routePreviewPane" style={{ zIndex: 650, pointerEvents: "none" }}>
        {(mode === "route" || mode === "stop") &&
          previewLines.map((line) => {
            const selected = line.id === selectedPreviewRouteId;
            return (
              <Polyline
                key={line.id}
                positions={line.positions}
                interactive={false}
                pathOptions={{
                  color: line.color,
                  weight: selected ? 8 : 5,
                  opacity: selected ? 0.98 : 0.72,
                  dashArray: selected ? undefined : "8 6",
                }}
              />
            );
          })}
      </Pane>

      <Pane name="contributionPinPane" style={{ zIndex: 670 }} />
      <Pane name="selectedPointPane" style={{ zIndex: 680 }} />
      <Pane name="contributionMarkerPane" style={{ zIndex: 625 }}>
      {mode !== "route" && pin && (
        <Marker
          position={pin}
          draggable
          pane="contributionPinPane"
          eventHandlers={{
            dragend: (event) => {
              const { lat, lng } = (event.target as L.Marker).getLatLng();
              onMovePin([lat, lng]);
            },
          }}
        />
      )}

      {mode === "stop" &&
        stopCandidates.map((point) => {
          const key = pointKey(point.kind, point.id);
          const selected = key === selectedStopReferenceKey;
          return (
            <CircleMarker
              key={key}
              pane={selected ? "selectedPointPane" : "contributionMarkerPane"}
              center={[point.latitude, point.longitude]}
              radius={selected ? 10 : 7}
              bubblingMouseEvents={false}
              pathOptions={{
                color: "#ffffff",
                weight: selected ? 3 : 2,
                fillColor: selected ? "#f97316" : "#12395A",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onPickStopReference(point) }}
            >
              <Tooltip>
                {existingPointTypeLabel(point)}: {point.name}
              </Tooltip>
            </CircleMarker>
          );
        })}

      {/* Existing approved points: tap one to add it to the route. */}
      {mode === "route" &&
        candidates.map((point) => {
          const connected = connectedKeys.has(pointKey(point.kind, point.id));

          return (
            <CircleMarker
              key={pointKey(point.kind, point.id)}
              center={[point.latitude, point.longitude]}
              radius={connected ? 9 : 7}
              bubblingMouseEvents={false}
              pathOptions={{
                color: "#ffffff",
                weight: 2,
                fillColor: connected ? routeColor : "#6b7280",
                fillOpacity: connected ? 0.95 : 0.7,
              }}
              eventHandlers={{ click: () => onPickExisting(point) }}
            >
              <Tooltip>{existingLabel(point)}</Tooltip>
            </CircleMarker>
          );
        })}

      {mode === "route" &&
        routePoints.map((point, index) => (
          <Marker
            key={point.key}
            position={[point.latitude, point.longitude]}
            icon={numberedIcon(index + 1, routeColor)}
            draggable={point.existingId === null}
            pane="contributionPinPane"
            eventHandlers={{
              dragend: (event) => {
                const { lat, lng } = (event.target as L.Marker).getLatLng();
                onMoveRoutePoint(index, [lat, lng]);
              },
            }}
          />
        ))}
      </Pane>
    </MapContainer>
  );
}

// ==================================================
// PAGE
// ==================================================

export default function Contribution({
  currentUserId,
  onLogout,
}: ContributionProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [kind, setKind] = useState<ContributionKind>("terminal");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stopType, setStopType] = useState<StopKind>("road_stop");
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [existingQuery, setExistingQuery] = useState("");
  const [inspectKey, setInspectKey] = useState<string | null>(null);
  const [selectedStopReferenceKey, setSelectedStopReferenceKey] = useState<string | null>(null);
  const [selectedPreviewRouteId, setSelectedPreviewRouteId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const pointPhotoInputRef = useRef<HTMLInputElement>(null);
  const pointPhotoTarget = useRef<string | null>(null);

  // Transport options + approved points/routes from the database
  const [types, setTypes] = useState<TransportTypeOption[]>([]);
  const [variants, setVariants] = useState<TransportVariantOption[]>([]);
  const [optionsError, setOptionsError] = useState("");
  const [existingPoints, setExistingPoints] = useState<ExistingPoint[]>([]);
  const [existingRoutes, setExistingRoutes] = useState<ExistingRoute[]>([]);
  const [existingError, setExistingError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);

  // Location
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(
    null
  );
  const [focus, setFocus] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const autoPinned = useRef(false);

  // The user's own submissions (the only place pending items are shown)
  const [mine, setMine] = useState<MyContribution[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState("");

  const selectedType = types.find((item) => String(item.id) === vehicleTypeId);
  const typeVariants = variants.filter(
    (item) => String(item.transport_type_id) === vehicleTypeId
  );
  const selectedVariant = variants.find(
    (item) => String(item.id) === variantId
  );
  const isRail = selectedVariant?.fare_model === "matrix";
  const routeColor = safeColor(selectedType?.color);

  // ---------- existing points: candidates + "connected to the last point" ----------

  const existingByKey = useMemo(
    () =>
      new Map(existingPoints.map((p) => [pointKey(p.kind, p.id), p] as const)),
    [existingPoints]
  );

  const usedKeys = useMemo(
    () =>
      new Set(
        routePoints
          .filter((p) => p.existingId !== null)
          .map((p) => pointKey(p.kind, p.existingId as number))
      ),
    [routePoints]
  );

  // Only points of the chosen vehicle type (jeep and bus points are separate).
  // Rail routes can only use train stations; skip points already in the route.
  const candidates = useMemo(
    () =>
      vehicleTypeId
        ? existingPoints.filter(
            (p) =>
              String(p.transportTypeId) === vehicleTypeId &&
              !usedKeys.has(pointKey(p.kind, p.id)) &&
              (!isRail || (p.kind === "stop" && p.stopType === "train_station"))
          )
        : [],
    [existingPoints, usedKeys, isRail, vehicleTypeId]
  );

  const stopCandidates = useMemo(() => {
    if (!vehicleTypeId) return [];
    const isRailType = typeVariants.some(
      (variant) => variant.fare_model === "matrix"
    );
    return existingPoints.filter(
      (point) =>
        String(point.transportTypeId) === vehicleTypeId &&
        (!isRailType ||
          point.kind === "terminal" ||
          point.stopType === "train_station")
    );
  }, [existingPoints, typeVariants, vehicleTypeId]);

  const lastPoint = routePoints[routePoints.length - 1];
  const lastExisting =
    lastPoint && lastPoint.existingId !== null
      ? existingByKey.get(pointKey(lastPoint.kind, lastPoint.existingId))
      : undefined;

  // Points that share an approved route with the last point you added.
  const connectedKeys = useMemo(() => {
    if (!lastExisting) return new Set<string>();
    const routeIds = new Set(lastExisting.routeIds);

    return new Set(
      candidates
        .filter((p) => p.routeIds.some((id) => routeIds.has(id)))
        .map((p) => pointKey(p.kind, p.id))
    );
  }, [lastExisting, candidates]);

  const query = existingQuery.trim().toLowerCase();
  const matches = (p: ExistingPoint) =>
    !query || p.name.toLowerCase().includes(query);
  const isConnected = (p: ExistingPoint) =>
    connectedKeys.has(pointKey(p.kind, p.id));

  const connectedList = candidates.filter((p) => isConnected(p) && matches(p));
  const otherTerminals = candidates.filter(
    (p) => p.kind === "terminal" && !isConnected(p) && matches(p)
  );
  const otherStops = candidates.filter(
    (p) => p.kind === "stop" && !isConnected(p) && matches(p)
  );
  const matchingStopCandidates = stopCandidates.filter(matches);
  const selectedStopReference = selectedStopReferenceKey
    ? existingByKey.get(selectedStopReferenceKey)
    : undefined;

  // ---------- details of the selected point: routes through it ----------

  const inspectPoint = inspectKey ? existingByKey.get(inspectKey) : undefined;

  const inspectRoutes = useMemo(
    () =>
      inspectKey
        ? existingRoutes.filter(
            (r) =>
              String(r.transportTypeId) === vehicleTypeId &&
              r.keys.includes(inspectKey)
          )
        : [],
    [existingRoutes, inspectKey, vehicleTypeId]
  );

  const previewLines = useMemo<PreviewLine[]>(
    () =>
      inspectRoutes.map((route) => ({
        id: route.id,
        color: routeColor,
        positions: route.keys.flatMap((key): Coordinates[] => {
          const point = existingByKey.get(key);
          return point ? [[point.latitude, point.longitude]] : [];
        }),
      })),
    [inspectRoutes, existingByKey, routeColor]
  );

  const stopReferenceRoutes = useMemo(() => {
    if (!selectedStopReferenceKey) return [];
    const routeIds = new Set(
      existingByKey.get(selectedStopReferenceKey)?.routeIds ?? []
    );
    return existingRoutes.filter(
      (route) => routeIds.has(route.id) && route.keys.includes(selectedStopReferenceKey)
    );
  }, [existingByKey, existingRoutes, selectedStopReferenceKey]);

  const stopReferencePreviewLines = useMemo<PreviewLine[]>(
    () =>
      stopReferenceRoutes.map((route) => ({
        id: route.id,
        color: safeColor(
          types.find((type) => type.id === route.transportTypeId)?.color
        ),
        positions: route.keys.flatMap((key): Coordinates[] => {
          const point = existingByKey.get(key);
          return point ? [[point.latitude, point.longitude]] : [];
        }),
      })),
    [stopReferenceRoutes, types, existingByKey]
  );

  const variantName = (variantIdValue: number) =>
    variants.find((v) => v.id === variantIdValue)?.name ?? "";

  // Stops between the selected point and a target stop, in riding order.
  const segmentKeys = (
    route: ExistingRoute,
    anchor: string,
    target: string
  ): string[] => {
    const a = route.keys.indexOf(anchor);
    const b = route.keys.indexOf(target);
    if (a < 0 || b < 0 || a === b) return [];
    return a < b
      ? route.keys.slice(a + 1, b + 1)
      : route.keys.slice(b, a).reverse();
  };

  // ---------- data ----------

  const loadMine = useCallback(async () => {
    setMineLoading(true);
    setMineError("");

    try {
      setMine(await getMyContributions(currentUserId));
    } catch (error: unknown) {
      setMineError(
        error instanceof Error
          ? error.message
          : "Unable to load your contributions."
      );
    } finally {
      setMineLoading(false);
    }
  }, [currentUserId]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      const catalog = await getTransitCatalog();
      setExistingPoints(catalog.points);
      setExistingRoutes(catalog.routes);
      setExistingError("");
    } catch (error: unknown) {
      setExistingError(
        error instanceof Error
          ? error.message
          : "Unable to load existing terminals and stops."
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    let active = true;

    getTransportOptions()
      .then((options) => {
        if (!active) return;
        setTypes(options.types);
        setVariants(options.variants);
      })
      .catch((error: unknown) => {
        if (active) {
          setOptionsError(
            error instanceof Error
              ? error.message
              : "Unable to load vehicle types."
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // ---------- location ----------

  const locate = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location access.");
      return;
    }

    setLocationMessage("Finding your location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: Coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];
        setCurrentPosition(next);
        setFocus(null);
        setLocationMessage("");

        // Terminal/stop pins start at the user's position (they can drag it).
        if (!autoPinned.current) {
          autoPinned.current = true;
          setPin((existing) => existing ?? next);
        }
      },
      (error) => {
        setLocationMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location permission denied. Tap the map to place your pin."
            : "Could not get your location. Tap the map to place your pin."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, []);

  // ---------- form helpers ----------

  const clearPhotos = () => {
    setPhotos((previous) => {
      previous.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      return [];
    });
  };

  const resetForm = () => {
    routePoints.forEach((point) => {
      if (point.photo) URL.revokeObjectURL(point.photo.previewUrl);
    });

    setKind("terminal");
    setName("");
    setDescription("");
    setStopType("road_stop");
    setPin(null);
    setRoutePoints([]);
    setVehicleTypeId("");
    setVariantId("");
    setExistingQuery("");
    setInspectKey(null);
    setSelectedStopReferenceKey(null);
    setSelectedPreviewRouteId(null);
    setFocus(null);
    setShowValidation(false);
    setFormError("");
    autoPinned.current = false;
    clearPhotos();
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
    locate();
    void loadCatalog(); // pick up anything approved since the page loaded
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  };

  // Changing the vehicle drops existing points that belong to another type.
  const handleVehicleTypeChange = (value: string) => {
    setVehicleTypeId(value);
    setVariantId("");
    setInspectKey(null);
    setExistingQuery("");
    setSelectedStopReferenceKey(null);
    setSelectedPreviewRouteId(null);

    setRoutePoints((previous) => {
      const kept = previous.filter(
        (point) =>
          point.existingId === null ||
          existingByKey.get(pointKey(point.kind, point.existingId))
            ?.transportTypeId === Number(value)
      );

      previous
        .filter((point) => !kept.includes(point))
        .forEach((point) => {
          if (point.photo) URL.revokeObjectURL(point.photo.previewUrl);
        });

      return kept;
    });
  };

  // Tap on empty map: a brand-new point (saved as pending).
  const handleMapPick = (position: Coordinates) => {
    if (kind !== "route") {
      setPin(position);
      return;
    }

    setRoutePoints((previous) => {
      if (previous.length >= MAX_ROUTE_POINTS) return previous;

      return [
        ...previous,
        {
          key: crypto.randomUUID(),
          kind: previous.length === 0 ? "terminal" : "stop",
          existingId: null,
          name: "",
          description: "",
          stopType: "road_stop",
          latitude: position[0],
          longitude: position[1],
          photo: null,
        },
      ];
    });
  };

  // Several existing points at once (skips duplicates and rail mismatches).
  const addExistingKeys = (keys: string[]) => {
    setFormError("");

    setRoutePoints((previous) => {
      const used = new Set(
        previous
          .filter((p) => p.existingId !== null)
          .map((p) => pointKey(p.kind, p.existingId as number))
      );
      const next = [...previous];

      for (const key of keys) {
        const point = existingByKey.get(key);
        if (!point || used.has(key) || next.length >= MAX_ROUTE_POINTS) continue;
        if (isRail && !(point.kind === "stop" && point.stopType === "train_station")) {
          continue;
        }
        used.add(key);
        next.push(toRoutePoint(point));
      }

      return next;
    });

    const last = existingByKey.get(keys[keys.length - 1] ?? "");
    if (last) setFocus([last.latitude, last.longitude]);
  };

  // Pick an existing approved point (dropdown or map dot) and show its routes.
  const addExistingPoint = (point: ExistingPoint) => {
    const key = pointKey(point.kind, point.id);
    addExistingKeys([key]);
    setInspectKey(key);
    setSelectedPreviewRouteId(null);
  };

  const focusStopReference = (point: ExistingPoint) => {
    setSelectedStopReferenceKey(pointKey(point.kind, point.id));
    setSelectedPreviewRouteId(null);
    setFocus([point.latitude, point.longitude]);
  };

  const inspectExistingPoint = (key: string) => {
    setInspectKey(key);
    setSelectedPreviewRouteId(null);
  };

  const updateRoutePoint = (index: number, updates: Partial<RoutePoint>) => {
    setRoutePoints((previous) =>
      previous.map((point, i) => (i === index ? { ...point, ...updates } : point))
    );
  };

  const moveRoutePoint = (index: number, direction: -1 | 1) => {
    setRoutePoints((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeRoutePoint = (index: number) => {
    const target = routePoints[index];
    if (target?.photo) URL.revokeObjectURL(target.photo.previewUrl);
    setRoutePoints((previous) => previous.filter((_, i) => i !== index));
  };

  // ---------- photos ----------

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    const accepted: PhotoItem[] = [];

    for (const file of files) {
      const problem = validateImage(file);
      if (problem) {
        setFormError(problem);
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    setPhotos((previous) => {
      const room = MAX_PHOTOS - previous.length;
      accepted.slice(room).forEach((p) => URL.revokeObjectURL(p.previewUrl));
      return [...previous, ...accepted.slice(0, room)];
    });
  };

  const removePhoto = (index: number) => {
    setPhotos((previous) => {
      URL.revokeObjectURL(previous[index]?.previewUrl ?? "");
      return previous.filter((_, i) => i !== index);
    });
  };

  // One optional photo per route point (new or existing).
  const choosePointPhoto = (pointKeyValue: string) => {
    pointPhotoTarget.current = pointKeyValue;
    pointPhotoInputRef.current?.click();
  };

  const handlePointPhotoChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    const target = pointPhotoTarget.current;
    if (!file || !target) return;

    const problem = validateImage(file);
    if (problem) {
      setFormError(problem);
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setRoutePoints((previous) =>
      previous.map((point) => {
        if (point.key !== target) return point;
        if (point.photo) URL.revokeObjectURL(point.photo.previewUrl);
        return { ...point, photo: { file, previewUrl } };
      })
    );
  };

  const removePointPhoto = (pointKeyValue: string) => {
    setRoutePoints((previous) =>
      previous.map((point) => {
        if (point.key !== pointKeyValue || !point.photo) return point;
        URL.revokeObjectURL(point.photo.previewUrl);
        return { ...point, photo: null };
      })
    );
  };

  // ---------- validation + submit ----------

  const validate = (): string | null => {
    if (!vehicleTypeId) return "Choose the type of vehicle.";

    if (!name.trim()) {
      return kind === "route"
        ? "Give the route a name."
        : "Give this place a name.";
    }

    if (kind !== "route") {
      return pin ? null : "Tap the map to place your pin.";
    }

    if (!variantId) return "Choose the variant of the vehicle.";
    if (routePoints.length < 2) {
      return "Add at least two points (start and end).";
    }
    if (routePoints.some((p) => p.existingId === null && !p.name.trim())) {
      return "Every new point needs a name.";
    }
    if (
      isRail &&
      routePoints.some(
        (p) =>
          p.existingId !== null &&
          !(p.kind === "stop" && p.stopType === "train_station")
      )
    ) {
      return "Rail routes can only use train stations. Remove the other points.";
    }

    return null;
  };

  const buildInput = (): ContributionInput | null => {
    if (kind !== "route") {
      if (!pin) return null;

      return {
        kind,
        transportTypeId: Number(vehicleTypeId),
        name,
        description,
        stopType,
        latitude: pin[0],
        longitude: pin[1],
      };
    }

    const points: PointInput[] = routePoints.map((point) =>
      point.existingId !== null
        ? {
            kind: point.kind,
            existingId: point.existingId,
            name: point.name,
            description: "",
            stopType: point.stopType,
            latitude: point.latitude,
            longitude: point.longitude,
          }
        : {
            kind: isRail ? "stop" : point.kind,
            existingId: null,
            name: point.name,
            description: point.description,
            stopType: isRail ? "train_station" : "road_stop",
            latitude: point.latitude,
            longitude: point.longitude,
          }
    );

    return { kind: "route", name, variantId: Number(variantId), points };
  };

  const handleSubmit = async () => {
    setShowValidation(true);

    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    const input = buildInput();
    if (!input) return;

    // Capture files before the form is reset.
    const pointFiles = routePoints.map((point) => point.photo?.file ?? null);
    const placeFiles = photos.map((photo) => photo.file);

    setFormError("");
    setSubmitting(true);

    try {
      const result = await submitContribution(input);

      let photoFailures = 0;

      if (input.kind === "route") {
        // result.points is in the same order as the points that were sent.
        for (let i = 0; i < pointFiles.length; i += 1) {
          const file = pointFiles[i];
          const saved = result.points[i];
          if (!file || !saved) continue;

          const error = await attachMapImage(saved.kind, saved.id, file);
          if (error) photoFailures += 1;
        }
      } else if (result.points[0]) {
        for (const file of placeFiles) {
          const error = await attachMapImage(
            input.kind,
            result.points[0].id,
            file
          );
          if (error) photoFailures += 1;
        }
      }

      setShowModal(false);
      resetForm();
      void loadMine();
      setNotice(
        photoFailures > 0
          ? `Submitted for admin review, but ${photoFailures} photo(s) could not be uploaded.`
          : "Submitted! An admin will review it before it appears on the map."
      );
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : "Unable to submit. Try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- navigation ----------

  const handleNavigation = (label: string) => {
    if (label === "Recents") {
      window.location.href = "/home";
      return;
    }

    if (label === "Saved") {
      window.location.href = "/saved";
      return;
    }

    if (label === "Community") {
      window.location.href = "/community";
      return;
    }
  };

  const fieldClass = (hasError: boolean) =>
    `h-10 w-full rounded-lg border px-3 text-sm outline-none focus:ring-1 ${
      hasError
        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
        : "border-gray-300 focus:border-[#12395A] focus:ring-[#12395A]"
    }`;

  const showPhotos = kind !== "route";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
      <aside className="absolute left-0 top-0 z-[2000] flex h-screen w-[220px] flex-col border-r border-white/10 bg-[#0f2a47] text-white sm:w-[230px] md:w-[240px] lg:w-[250px]">
        <button
          type="button"
          onClick={() => {
            window.location.href = "/home";
          }}
          title="Home"
          className="absolute flex items-center justify-center rounded-lg transition-colors duration-200 hover:bg-white/10"
          style={{ top: "30px", width: "100%", height: "75px" }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <nav className="absolute left-0 top-[145px] flex w-full flex-col gap-1.5 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item.label === "Your Contribution";

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNavigation(item.label)}
                className={`group flex h-[46px] w-full items-center rounded-xl px-3 text-left transition-colors duration-200 ${
                  isActive
                    ? "bg-[#d9dee3] font-semibold text-[#0f2a47]"
                    : "font-medium text-white hover:bg-[#d0d5db] hover:text-[#0f2a47]"
                }`}
              >
                <span className="flex w-[28px] shrink-0 items-center justify-center">
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="transition-transform duration-200 group-hover:scale-110"
                  />
                </span>
                <span
                  className="ml-2 whitespace-nowrap"
                  style={{ fontSize: "16px" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="absolute left-[220px] right-0 top-0 z-[40] flex min-h-[130px] items-start justify-between bg-[#f7f7f7] px-[30px] pt-[35px] sm:left-[20px] md:left-[290px] lg:left-[300px]">
        <div className="flex flex-col justify-center">
          <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
            Your Contributions
          </h1>
          <p className="mt-1 text-[14px] text-gray-500">
            Add terminals, stops and routes. An admin reviews each one before
            it goes on the map.
          </p>
        </div>

        <div className="relative flex h-[55px] -translate-y-[5px] items-center gap-[20px]">
          <button
            type="button"
            onClick={() => {
              console.log("Notifications clicked", { currentUserId });
            }}
            title="Notifications"
            className="group flex h-[45px] w-[45px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-6"
            />
          </button>

          <button
            type="button"
            onClick={() => setShowProfileMenu((previous) => !previous)}
            title="Profile"
            className="group flex h-[45px] w-[45px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
          >
            <UserCircle
              size={21}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:scale-105"
            />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  window.location.href = "/profile";
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  onLogout();
                  window.location.href = "/";
                }}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Log Out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ==================================================
          MY SUBMISSIONS
          ================================================== */}

      <section className="absolute inset-0 z-0 ml-[220px] overflow-y-auto pt-[10px] sm:ml-[230px] md:ml-[170px] lg:ml-[250px]">
        <div className="mx-auto w-full max-w-[900px] px-8 pb-12 pt-[105px]">
          <div className="h-[23px]" />

          <button
            type="button"
            onClick={openModal}
            className="group mt-7 flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
          >
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#12395A] text-white transition-transform duration-200 group-hover:scale-105">
              <Plus size={21} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">
                Add a contribution
              </p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Pin a terminal, a stop, or build a route from existing and new
                points
              </p>
            </div>
          </button>

          <div className="mt-6 flex flex-col gap-3">
            {mineLoading && (
              <p role="status" className="text-sm text-gray-500">
                Loading your contributions...
              </p>
            )}

            {mineError && (
              <p role="alert" className="text-sm text-red-600">
                {mineError}
              </p>
            )}

            {!mineLoading && !mineError && mine.length === 0 && (
              <div className="flex min-h-[330px] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[#f1f3f5]">
                  <Car size={27} strokeWidth={1.8} className="text-gray-400" />
                </div>
                <h2 className="mt-5 text-[17px] font-semibold text-gray-800">
                  Nothing to see here yet.
                </h2>
                <p className="mt-2 max-w-[380px] text-[13px] leading-[1.6] text-gray-500">
                  Your submitted contributions and their review statuses will
                  appear here.
                </p>
              </div>
            )}

            {mine.map((item) => (
              <article
                key={item.key}
                className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-700">
                      {kindLabel[item.kind]}
                    </span>
                    <p className="text-xs text-gray-500">
                      Submitted {formatDate(item.createdAt)}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      item.status === "pending"
                        ? "bg-amber-100 text-amber-800"
                        : item.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {item.status === "pending"
                      ? "Pending review"
                      : item.status === "approved"
                        ? "Approved"
                        : "Rejected"}
                  </span>
                </div>

                <p className="mt-2 break-words text-sm font-semibold text-gray-900">
                  {item.name}
                </p>

                {item.status === "pending" && (
                  <p className="mt-1 text-xs text-gray-500">
                    Only you can see this until an admin approves it.
                  </p>
                )}

                {item.status === "rejected" && item.note && (
                  <p className="mt-2 text-sm text-red-700">
                    Admin feedback: {item.note}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ==================================================
          ADD CONTRIBUTION MODAL
          ================================================== */}

      {showModal && (
        <div
          className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/45 px-4 py-6"
          onClick={closeModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-contribution-title"
            className="max-h-[92vh] w-full max-w-[680px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2
                  id="add-contribution-title"
                  className="text-xl font-semibold text-gray-900"
                >
                  Add a contribution
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                  It stays hidden from everyone until an admin approves it.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={closeModal}
                className="rounded-full px-2 py-1 text-xl leading-none text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                ×
              </button>
            </div>

            {formError && (
              <p
                role="alert"
                className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {formError}
              </p>
            )}

            <div className="space-y-5">
              {/* What are you adding? */}
              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">
                  What are you adding?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {kindOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setKind(option.value);
                        setFormError("");
                      }}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        kind === option.value
                          ? "border-[#12395A] bg-[#12395A] text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="block text-sm font-semibold">
                        {option.label}
                      </span>
                      <span
                        className={`mt-0.5 block text-[11px] leading-snug ${
                          kind === option.value
                            ? "text-white/80"
                            : "text-gray-500"
                        }`}
                      >
                        {option.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Vehicle (every kind) + variant (routes) */}
              <div
                className={`grid grid-cols-1 gap-3 ${
                  kind === "route" ? "sm:grid-cols-2" : ""
                }`}
              >
                <div>
                  <label
                    htmlFor="vehicle-type"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Type of vehicle <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="vehicle-type"
                    value={vehicleTypeId}
                    onChange={(event) =>
                      handleVehicleTypeChange(event.target.value)
                    }
                    className={fieldClass(showValidation && !vehicleTypeId)}
                  >
                    <option value="" disabled>
                      Vehicle type
                    </option>
                    {types.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  {optionsError && (
                    <p className="mt-1 text-xs text-red-600">{optionsError}</p>
                  )}
                  {kind !== "route" && (
                    <p className="mt-1 text-xs text-gray-500">
                      Jeep and bus terminals and stops are kept separate.
                    </p>
                  )}
                </div>

                {kind === "route" && (
                  <div>
                    <label
                      htmlFor="route-variant"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Variant <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="route-variant"
                      value={variantId}
                      onChange={(event) => setVariantId(event.target.value)}
                      disabled={!vehicleTypeId}
                      className={`${fieldClass(
                        showValidation && !variantId
                      )} disabled:bg-gray-100`}
                    >
                      <option value="" disabled>
                        {vehicleTypeId
                          ? "Choose a variant"
                          : "Pick a vehicle first"}
                      </option>
                      {typeVariants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Name */}
              <div>
                <label
                  htmlFor="contribution-name"
                  className="mb-1.5 block text-sm font-medium text-gray-700"
                >
                  {kind === "route"
                    ? "Route name"
                    : kind === "terminal"
                      ? "Terminal name"
                      : "Stop name"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  id="contribution-name"
                  value={name}
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    kind === "route"
                      ? "e.g. Novaliches – Quiapo"
                      : "e.g. SM Fairview Terminal"
                  }
                  className={fieldClass(showValidation && !name.trim())}
                />
              </div>

              {/* Stop details */}
              {kind === "stop" && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="stop-type"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Stop type
                    </label>
                    <select
                      id="stop-type"
                      value={stopType}
                      onChange={(event) =>
                        setStopType(event.target.value as StopKind)
                      }
                      className={fieldClass(false)}
                    >
                      <option value="road_stop">Bus / jeepney stop</option>
                      <option value="train_station">Train station</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="stop-description"
                      className="mb-1.5 block text-sm font-medium text-gray-700"
                    >
                      Landmark / description
                    </label>
                    <input
                      id="stop-description"
                      value={description}
                      maxLength={500}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder="Optional"
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
              )}

              {kind === "stop" && (
                <div>
                  <label
                    htmlFor="existing-stop-reference"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Start from an existing terminal or stop
                  </label>
                  <input
                    id="existing-stop-reference"
                    aria-label="Search existing terminals and stops"
                    value={existingQuery}
                    disabled={!vehicleTypeId}
                    onChange={(event) => setExistingQuery(event.target.value)}
                    placeholder="Search by name..."
                    className={`${fieldClass(false)} disabled:bg-gray-100`}
                  />
                  <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1">
                    {!vehicleTypeId ? (
                      <p className="px-3 py-2 text-xs text-gray-500">
                        Choose a vehicle type to find approved points.
                      </p>
                    ) : catalogLoading ? (
                      <p role="status" className="px-3 py-2 text-xs text-gray-500">
                        Loading approved terminals and stops...
                      </p>
                    ) : existingError ? (
                      <p role="alert" className="px-3 py-2 text-xs text-red-600">
                        {existingError}
                      </p>
                    ) : stopCandidates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-500">
                        No approved terminals or stops for this vehicle type.
                      </p>
                    ) : matchingStopCandidates.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-500">
                        No approved points match “{existingQuery.trim()}”.
                      </p>
                    ) : (
                      matchingStopCandidates.map((point) => {
                        const key = pointKey(point.kind, point.id);
                        const selected = key === selectedStopReferenceKey;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => focusStopReference(point)}
                            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                              selected
                                ? "bg-blue-50 text-[#12395A]"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
                              {existingPointTypeLabel(point)}
                            </span>
                            <span className="truncate">{point.name}</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Selecting a point shows its routes for reference. It will not move the new-stop pin.
                  </p>
                </div>
              )}

              {/* Route: pick existing terminals / stops */}
              {kind === "route" && (
                <div>
                  <label
                    htmlFor="existing-point"
                    className="mb-1.5 block text-sm font-medium text-gray-700"
                  >
                    Start from or connect to an existing terminal / stop
                  </label>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr]">
                    <input
                      aria-label="Search existing terminals and stops"
                      value={existingQuery}
                      disabled={!vehicleTypeId}
                      onChange={(event) => setExistingQuery(event.target.value)}
                      placeholder="Search by name..."
                      className={`${fieldClass(false)} disabled:bg-gray-100`}
                    />

                    <select
                      id="existing-point"
                      value=""
                      disabled={!vehicleTypeId}
                      onChange={(event) => {
                        const picked = existingByKey.get(event.target.value);
                        if (picked) addExistingPoint(picked);
                      }}
                      className={`${fieldClass(false)} disabled:bg-gray-100`}
                    >
                      <option value="">
                        {!vehicleTypeId
                          ? "Pick a vehicle type first"
                          : candidates.length === 0
                            ? "No approved points for this vehicle"
                            : "Choose a terminal or stop..."}
                      </option>

                      {connectedList.length > 0 && lastExisting && (
                        <optgroup label={`Connected to ${lastExisting.name}`}>
                          {connectedList.map((point) => (
                            <option
                              key={pointKey(point.kind, point.id)}
                              value={pointKey(point.kind, point.id)}
                            >
                              {existingLabel(point)}
                            </option>
                          ))}
                        </optgroup>
                      )}

                      {otherTerminals.length > 0 && (
                        <optgroup label="Terminals">
                          {otherTerminals.map((point) => (
                            <option
                              key={pointKey(point.kind, point.id)}
                              value={pointKey(point.kind, point.id)}
                            >
                              {existingLabel(point)}
                            </option>
                          ))}
                        </optgroup>
                      )}

                      {otherStops.length > 0 && (
                        <optgroup label="Stops and stations">
                          {otherStops.map((point) => (
                            <option
                              key={pointKey(point.kind, point.id)}
                              value={pointKey(point.kind, point.id)}
                            >
                              {existingLabel(point)}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {existingError && (
                    <p className="mt-1 text-xs text-red-600">{existingError}</p>
                  )}

                  <p className="mt-1 text-xs text-gray-500">
                    {!vehicleTypeId
                      ? "Choose the vehicle first. Only its own terminals and stops are listed."
                      : "Picking a point adds it and shows the routes that already pass through it, so you can add the stops you rode past in one tap."}
                  </p>
                </div>
              )}

              {/* Map */}
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-gray-700">
                    {kind === "route"
                      ? "Build the route in order"
                      : "Pin the location"}{" "}
                    <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={locate}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <LocateFixed size={13} />
                    My location
                  </button>
                </div>

                <div
                  className={`isolate h-[300px] overflow-hidden rounded-xl border ${
                    showValidation &&
                    ((kind !== "route" && !pin) ||
                      (kind === "route" && routePoints.length < 2))
                      ? "border-red-500"
                      : "border-gray-300"
                  }`}
                >
                  <PinMap
                    currentPosition={currentPosition}
                    focus={focus}
                    mode={kind}
                    pin={pin}
                    routePoints={routePoints}
                    routeColor={routeColor}
                    candidates={candidates}
                    stopCandidates={stopCandidates}
                    selectedStopReferenceKey={selectedStopReferenceKey}
                    selectedPreviewRouteId={selectedPreviewRouteId}
                    connectedKeys={connectedKeys}
                    previewLines={
                      kind === "stop" ? stopReferencePreviewLines : previewLines
                    }
                    onPick={handleMapPick}
                    onPickExisting={addExistingPoint}
                    onPickStopReference={focusStopReference}
                    onMovePin={setPin}
                    onMoveRoutePoint={(index, position) =>
                      updateRoutePoint(index, {
                        latitude: position[0],
                        longitude: position[1],
                      })
                    }
                  />
                </div>

                <p className="mt-1 text-xs text-gray-500">
                  {locationMessage ||
                    (kind === "route"
                      ? "Tap a dot to use an existing terminal or stop. Missing one? Tap empty map to add a new stop or terminal; new points are reviewed too."
                      : "The pin starts at your location. Tap the map or drag the pin to adjust it.")}
                </p>

                {kind !== "route" && pin && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    {pin[0].toFixed(5)}, {pin[1].toFixed(5)}
                  </p>
                )}
              </div>

              {kind === "stop" && selectedStopReference && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {existingPointTypeLabel(selectedStopReference)}: {selectedStopReference.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-600">
                        {selectedType?.name ?? "Transport type unavailable"} · {selectedStopReference.latitude.toFixed(5)}, {selectedStopReference.longitude.toFixed(5)}
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Clear selected reference point"
                      onClick={() => {
                        setSelectedStopReferenceKey(null);
                        setSelectedPreviewRouteId(null);
                      }}
                      className="rounded-full px-2 text-lg leading-none text-gray-500 hover:bg-white"
                    >
                      ×
                    </button>
                  </div>

                  {stopReferenceRoutes.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">
                      No approved routes currently serve this point.
                    </p>
                  ) : (
                    <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                      {stopReferenceRoutes.map((route) => {
                        const routeType = types.find(
                          (type) => type.id === route.transportTypeId
                        );
                        return (
                          <div
                            key={route.id}
                            className="rounded-lg border border-gray-200 bg-white p-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: safeColor(routeType?.color),
                                }}
                              />
                              <button
                                type="button"
                                aria-pressed={selectedPreviewRouteId === route.id}
                                onClick={() =>
                                  setSelectedPreviewRouteId(route.id)
                                }
                                className={`min-w-0 flex-1 truncate text-left text-sm font-semibold ${
                                  selectedPreviewRouteId === route.id
                                    ? "text-[#12395A] underline"
                                    : "text-gray-900 hover:underline"
                                }`}
                              >
                                {route.name}
                              </button>
                            </div>
                            <p className="ml-[18px] mt-0.5 text-xs text-gray-500">
                              {routeType?.name ?? "Transport type unavailable"} · {variantName(route.variantId)} · {route.keys.length} points
                            </p>
                            <ol className="ml-[18px] mt-2 space-y-1">
                              {route.keys.map((key, index) => {
                                const point = existingByKey.get(key);
                                if (!point) return null;
                                return (
                                  <li
                                    key={key}
                                    className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                                      key === selectedStopReferenceKey
                                        ? "bg-orange-100 font-semibold text-orange-900"
                                        : "text-gray-700"
                                    }`}
                                  >
                                    <span className="w-5 shrink-0 text-right text-gray-400">
                                      {index + 1}
                                    </span>
                                    <span className="truncate">
                                      {existingPointTypeLabel(point)}: {point.name}
                                    </span>
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Route: details of the selected point */}
              {kind === "route" && inspectPoint && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Routes through {existingLabel(inspectPoint)}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-600">
                        Tap &ldquo;Add through here&rdquo; on the stop where you
                        got off. Every stop in between is added in order.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Close route details"
                      onClick={() => {
                        setInspectKey(null);
                        setSelectedPreviewRouteId(null);
                      }}
                      className="rounded-full px-2 text-lg leading-none text-gray-500 hover:bg-white"
                    >
                      ×
                    </button>
                  </div>

                  {inspectRoutes.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">
                      No approved route of this vehicle type passes through
                      this point yet. Tap the map to add the next stop
                      yourself.
                    </p>
                  ) : (
                    <div className="mt-3 max-h-[260px] space-y-3 overflow-y-auto pr-1">
                      {inspectRoutes.map((route) => {
                        const anchorIndex = inspectKey
                          ? route.keys.indexOf(inspectKey)
                          : -1;
                        const firstKey = route.keys[0];
                        const lastKey = route.keys[route.keys.length - 1];
                        const firstName =
                          existingByKey.get(firstKey)?.name ?? "start";
                        const lastName =
                          existingByKey.get(lastKey)?.name ?? "end";

                        return (
                          <div
                            key={route.id}
                            className="rounded-lg border border-gray-200 bg-white p-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <button
                                type="button"
                                aria-pressed={selectedPreviewRouteId === route.id}
                                onClick={() =>
                                  setSelectedPreviewRouteId(route.id)
                                }
                                className={`text-left text-sm font-semibold ${
                                  selectedPreviewRouteId === route.id
                                    ? "text-[#12395A] underline"
                                    : "text-gray-900 hover:underline"
                                }`}
                              >
                                {route.name}
                                <span className="ml-2 text-xs font-normal text-gray-500">
                                  {variantName(route.variantId)} ·{" "}
                                  {route.keys.length} stops
                                </span>
                              </button>

                              <div className="flex flex-wrap gap-1.5">
                                {anchorIndex < route.keys.length - 1 && inspectKey && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addExistingKeys(
                                        segmentKeys(route, inspectKey, lastKey)
                                      )
                                    }
                                    className="rounded-md border border-[#12395A] px-2 py-1 text-[11px] font-semibold text-[#12395A] hover:bg-[#12395A] hover:text-white"
                                  >
                                    Add all to {lastName}
                                  </button>
                                )}
                                {anchorIndex > 0 && inspectKey && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      addExistingKeys(
                                        segmentKeys(route, inspectKey, firstKey)
                                      )
                                    }
                                    className="rounded-md border border-[#12395A] px-2 py-1 text-[11px] font-semibold text-[#12395A] hover:bg-[#12395A] hover:text-white"
                                  >
                                    Add all to {firstName}
                                  </button>
                                )}
                              </div>
                            </div>

                            <ol className="mt-2 space-y-1">
                              {route.keys.map((key, stopIndex) => {
                                const stop = existingByKey.get(key);
                                if (!stop) return null;

                                const isAnchor = key === inspectKey;
                                const alreadyAdded = usedKeys.has(key);

                                return (
                                  <li
                                    key={key}
                                    className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                                      isAnchor
                                        ? "bg-blue-100 font-semibold text-blue-900"
                                        : "text-gray-700"
                                    }`}
                                  >
                                    <span className="w-5 shrink-0 text-right text-gray-400">
                                      {stopIndex + 1}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate">
                                      {existingLabel(stop)}
                                      {stop.kind === "terminal" && (
                                        <span className="ml-1 text-gray-400">
                                          (Terminal)
                                        </span>
                                      )}
                                    </span>

                                    {isAnchor ? (
                                      <span className="shrink-0 text-[11px]">
                                        You are here
                                      </span>
                                    ) : alreadyAdded ? (
                                      <span className="shrink-0 text-[11px] text-green-700">
                                        Added
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          inspectKey &&
                                          addExistingKeys(
                                            segmentKeys(route, inspectKey, key)
                                          )
                                        }
                                        className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-100"
                                      >
                                        Add through here
                                      </button>
                                    )}
                                  </li>
                                );
                              })}
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Route points list */}
              {kind === "route" && routePoints.length > 0 && (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-gray-700">
                    Points ({routePoints.length})
                  </p>
                  <ol className="space-y-2">
                    {routePoints.map((point, index) => (
                      <li
                        key={point.key}
                        className="rounded-lg border border-gray-200 bg-gray-50 p-2"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                            style={{ backgroundColor: routeColor }}
                          >
                            {index + 1}
                          </span>

                          {point.existingId !== null ? (
                            <>
                              <span className="w-[72px] shrink-0 text-xs text-gray-600">
                                {point.kind === "terminal"
                                  ? "Terminal"
                                  : point.stopType === "train_station"
                                    ? "Station"
                                    : "Stop"}
                              </span>
                              <button
                                type="button"
                                title="Show the routes through this point"
                                onClick={() =>
                                  inspectExistingPoint(
                                    pointKey(
                                      point.kind,
                                      point.existingId as number
                                    )
                                  )
                                }
                                className="min-w-0 flex-1 truncate text-left text-sm text-gray-800 hover:underline"
                              >
                                {point.name}
                                <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                                  Existing
                                </span>
                              </button>
                            </>
                          ) : (
                            <>
                              {isRail ? (
                                <span className="w-[92px] shrink-0 text-xs text-gray-600">
                                  New station
                                </span>
                              ) : (
                                <select
                                  aria-label={`Point ${index + 1} type`}
                                  value={point.kind}
                                  onChange={(event) =>
                                    updateRoutePoint(index, {
                                      kind: event.target.value as PointKind,
                                    })
                                  }
                                  className="h-9 w-[92px] shrink-0 rounded-lg border border-gray-300 bg-white px-2 text-xs"
                                >
                                  <option value="terminal">New terminal</option>
                                  <option value="stop">New stop</option>
                                </select>
                              )}

                              <input
                                aria-label={`Point ${index + 1} name`}
                                value={point.name}
                                maxLength={120}
                                onChange={(event) =>
                                  updateRoutePoint(index, {
                                    name: event.target.value,
                                  })
                                }
                                placeholder="Name of this new point"
                                className={`h-9 min-w-0 flex-1 rounded-lg border bg-white px-2 text-sm outline-none ${
                                  showValidation && !point.name.trim()
                                    ? "border-red-500"
                                    : "border-gray-300"
                                }`}
                              />
                            </>
                          )}

                          <button
                            type="button"
                            aria-label={`Add a photo to point ${index + 1}`}
                            title="Add a photo of this point"
                            onClick={() => choosePointPhoto(point.key)}
                            className={`rounded p-1.5 hover:bg-gray-200 ${
                              point.photo ? "text-[#12395A]" : "text-gray-500"
                            }`}
                          >
                            <ImagePlus size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move point ${index + 1} up`}
                            disabled={index === 0}
                            onClick={() => moveRoutePoint(index, -1)}
                            className="rounded px-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move point ${index + 1} down`}
                            disabled={index === routePoints.length - 1}
                            onClick={() => moveRoutePoint(index, 1)}
                            className="rounded px-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove point ${index + 1}`}
                            onClick={() => removeRoutePoint(index)}
                            className="rounded p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        {point.photo && (
                          <div className="ml-8 mt-2 flex items-center gap-2">
                            <img
                              src={point.photo.previewUrl}
                              alt={`Photo for point ${index + 1}`}
                              className="h-12 w-16 rounded-md border border-gray-200 object-cover"
                            />
                            <span className="min-w-0 flex-1 truncate text-xs text-gray-500">
                              {point.photo.file.name}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remove photo from point ${index + 1}`}
                              onClick={() => removePointPhoto(point.key)}
                              className="rounded px-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>

                  <input
                    ref={pointPhotoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handlePointPhotoChange}
                  />
                </div>
              )}

              {/* Photos (terminal / stop) */}
              {showPhotos && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700">
                      Photos (optional)
                    </label>
                    <span className="text-xs text-gray-500">
                      {photos.length}/{MAX_PHOTOS}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((photo, index) => (
                      <div
                        key={photo.previewUrl}
                        className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
                      >
                        <img
                          src={photo.previewUrl}
                          alt={`Selected photo ${index + 1}`}
                          className="h-24 w-full object-cover"
                        />
                        <button
                          type="button"
                          aria-label={`Remove photo ${index + 1}`}
                          onClick={() => removePhoto(index)}
                          className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-red-600"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {photos.length < MAX_PHOTOS && (
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        className="flex min-h-[96px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-3 py-3 text-center transition-colors hover:border-[#12395A] hover:bg-gray-100"
                      >
                        <Plus size={22} className="mb-1 text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                          Add photo
                        </span>
                        <span className="mt-0.5 text-xs text-gray-500">
                          JPG, PNG or WebP, up to 5 MB
                        </span>
                      </button>
                    )}
                  </div>

                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    multiple
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-col-reverse justify-end gap-3 border-t border-gray-100 pt-4 sm:flex-row">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="rounded-lg bg-[#12395A] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1b4b6f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit for review"}
              </button>
            </div>
          </section>
        </div>
      )}

      {notice && (
        <div className="fixed bottom-5 right-5 z-[9000] max-w-sm rounded-xl bg-[#12395A] px-4 py-3 text-sm text-white shadow-xl">
          <div className="flex items-start gap-3">
            <p>{notice}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setNotice("")}
              className="shrink-0 text-lg leading-none text-white/80 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
