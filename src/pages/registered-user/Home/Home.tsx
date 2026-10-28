import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";

import {
  Accessibility,
  Bell,
  Bus,
  Car,
  GraduationCap,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  TrainFront,
  UserCircle,
  UserRound,
} from "lucide-react";

import {
  MapContainer,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  useMap,
} from "react-leaflet";

import L from "leaflet";
import "leaflet/dist/leaflet.css";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { Input } from "@/components/ui/input";
import { getTerminals } from "@/lib/terminals";
import type { Terminal } from "@/lib/terminals";
import { getRouteDetails, getRouteMapIndex } from "@/lib/routes";
import type { RouteDetails, RouteStop } from "@/lib/routes";
import {
  getRouteGeometry,
  getRouteGeometryKey,
} from "@/lib/routeGeometry";
import type { RouteGeometry } from "@/lib/routeGeometry";
import {
  findRouteStopIndex,
  getNextOverlappingRouteId,
  getUniqueServingRoute,
  mergeMapTerminals,
  searchRouteMapItems,
  selectTripStop,
} from "@/lib/routeMap";
import type {
  RouteMapIndex,
  RouteMapPoint,
  RouteMapSearchResult,
} from "@/lib/routeMap";
import {
  buildFareCards,
  calculateFareOptionEstimates,
} from "@/lib/fareCalculations";
import {
  getRailFare,
  getTransportFareOptions,
  verificationLabel,
} from "@/lib/fares";
import type {
  RailFare,
  TransportFareOption,
  VerificationStatus,
} from "@/lib/fares";
import { getMapIcon } from "@/lib/mapIcons";
import { getPointImages } from "@/lib/mapImages";
import type { PointImage } from "@/lib/mapImages";

// Leaflet's default marker config (fallback for any marker without a custom icon).
delete (
  L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown }
)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const defaultPosition: [number, number] = [14.7167, 121.05];

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

interface HomeProps {
  currentUserId: string | null;
  onLogout: () => Promise<void>;
}

type LocationStatus = "loading" | "success" | "error";

type Coordinates = [number, number];

const peso = (value: number) => `₱${value.toFixed(2)}`;
const wholePeso = (value: number) => `₱${value.toFixed(0)}`;

// Haversine distance in meters between two [lat, lng] coordinates.
function getDistanceMeters(
  from: Coordinates,
  to: Coordinates
): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRadians(to[0] - from[0]);
  const dLng = toRadians(to[1] - from[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from[0])) *
      Math.cos(toRadians(to[0])) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

interface RouteLayerState {
  status: "loading" | "ready" | "error";
  route?: RouteDetails;
  geometry?: RouteGeometry;
  error?: string;
}

interface LoadedRouteLayer {
  route: RouteDetails;
  geometry: RouteGeometry | null;
}

const stopTypeLabel = (stop: Pick<RouteStop, "stop_type">) =>
  stop.stop_type === "terminal"
    ? "Terminal"
    : stop.stop_type === "train_station"
      ? "Train station"
      : "Bus / jeepney stop";

// Move the map to the user's current location.
function CurrentLocationMarker({
  position,
}: {
  position: Coordinates | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (position) {
      map.flyTo(position, 16);
    }
  }, [map, position]);

  if (!position) return null;

  return (
    <Marker position={position} icon={getMapIcon("current_location")}>
      <Popup>Your current location</Popup>
    </Marker>
  );
}

// Automatically frame the selected road route.
function RouteViewport({
  positions,
}: {
  positions: Coordinates[];
}) {
  const map = useMap();

  useEffect(() => {
    if (positions.length === 0) return;

    if (positions.length === 1) {
      map.flyTo(positions[0], 16);
      return;
    }

    const bounds = L.latLngBounds(positions);
    map.flyToBounds(bounds, {
      paddingTopLeft: [
        Math.min(700, Math.max(260, map.getSize().x * 0.5)),
        140,
      ],
      paddingBottomRight: [50, 80],
      maxZoom: 16,
      duration: 0.8,
    });
  }, [map, positions]);

  return null;
}

function PlaceViewport({ position }: { position: Coordinates | null }) {
  const map = useMap();
  const latitude = position?.[0];
  const longitude = position?.[1];

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;

    map.flyTo([latitude, longitude], 16, { duration: 0.6 });
  }, [map, latitude, longitude]);

  return null;
}

function FareSource({
  name,
  url,
  effectiveFrom,
  status,
}: {
  name: string;
  url: string | null;
  effectiveFrom: string;
  status: VerificationStatus;
}) {
  return (
    <p className="mt-2 text-[10px] leading-snug text-gray-500">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {name}
        </a>
      ) : (
        name
      )}
      {" · effective "}
      {effectiveFrom}
      <br />
      <span className={status === "verified" ? "text-green-700" : "text-amber-700"}>
        {verificationLabel(status)}
      </span>
    </p>
  );
}

export default function Home({
  currentUserId,
  onLogout,
}: HomeProps) {
  const geolocation =
    typeof navigator === "undefined" ? null : navigator.geolocation;
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [currentPosition, setCurrentPosition] =
    useState<Coordinates | null>(null);

  const [locationStatus, setLocationStatus] = useState<LocationStatus>(
    geolocation ? "loading" : "error"
  );

  const [locationError, setLocationError] = useState<string | null>(
    geolocation ? null : "Your browser does not support location access."
  );

  const [showLocationPopup, setShowLocationPopup] = useState(true);

  // Terminal data.
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalsLoading, setTerminalsLoading] = useState(true);

  // Route selection and route details.
  const [routeMapIndex, setRouteMapIndex] = useState<RouteMapIndex>({
    routes: [],
    points: [],
  });
  const [routesLoading, setRoutesLoading] = useState(true);
  const [routeMapError, setRouteMapError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedRoute, setSelectedRoute] =
    useState<RouteDetails | null>(null);
  const [selectedRouteStops, setSelectedRouteStops] =
    useState<RouteStop[]>([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeLayers, setRouteLayers] = useState<
    Record<number, RouteLayerState>
  >({});
  const [visibleRouteIds, setVisibleRouteIds] = useState<number[]>([]);
  const [selectedPlacePoint, setSelectedPlacePoint] =
    useState<RouteMapPoint | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const pendingBoardingPoint = useRef<
    Pick<RouteMapPoint, "kind" | "ref_id"> | null
  >(null);
  const routeLayerCache = useRef(
    new Map<number, Promise<LoadedRouteLayer>>()
  );

  const mapPoints = useMemo(
    () => mergeMapTerminals(routeMapIndex, terminals),
    [routeMapIndex, terminals]
  );
  const selectedPlace = useMemo(
    () =>
      selectedPlacePoint
        ? mapPoints.find(
            (point) =>
              point.kind === selectedPlacePoint.kind &&
              point.ref_id === selectedPlacePoint.ref_id
          ) ?? selectedPlacePoint
        : null,
    [mapPoints, selectedPlacePoint]
  );
  const searchResults = useMemo(
    () => searchRouteMapItems(routeMapIndex.routes, mapPoints, searchQuery),
    [routeMapIndex.routes, mapPoints, searchQuery]
  );
  const selectedRouteLayer = selectedRouteId
    ? routeLayers[Number(selectedRouteId)]
    : undefined;
  const selectedRouteGeometry = selectedRouteLayer?.geometry;
  const routeDistanceMeters =
    selectedRouteGeometry?.totalDistanceMeters ?? null;
  const routeDurationSeconds =
    selectedRouteGeometry?.durationSeconds ?? null;
  const stopDistances = selectedRouteGeometry?.stopDistances ?? [];
  const stopMapPositions =
    selectedRouteGeometry?.stopMapPositions ?? [];
  const roadRouteLoading = selectedRouteLayer?.status === "loading";
  const displayedRouteIds = useMemo(
    () =>
      [...new Set([
        ...visibleRouteIds,
        ...(selectedRouteId ? [Number(selectedRouteId)] : []),
      ])],
    [selectedRouteId, visibleRouteIds]
  );
  const displayedRouteLayers = useMemo(
    () => {
      return displayedRouteIds.flatMap((routeId) => {
        const layer = routeLayers[routeId];
        if (!layer?.route || !layer.geometry) return [];
        return [
          {
            routeId,
            route: layer.route,
            geometry: layer.geometry,
          },
        ];
      });
    },
    [displayedRouteIds, routeLayers]
  );
  const coincidentRouteIdsByGeometry = useMemo(() => {
    const groups = new Map<string, number[]>();

    displayedRouteLayers.forEach(({ routeId, geometry }) => {
      const key = getRouteGeometryKey(geometry.positions);
      const routeIds = groups.get(key) ?? [];
      routeIds.push(routeId);
      groups.set(key, routeIds);
    });

    return groups;
  }, [displayedRouteLayers]);
  const displayedRoutePositions = useMemo(
    () => displayedRouteLayers.flatMap((layer) => layer.geometry?.positions ?? []),
    [displayedRouteLayers]
  );

  // Trip selection + fares.
  const [boardingIndex, setBoardingIndex] = useState<number | null>(null);
  const [destinationIndex, setDestinationIndex] =
    useState<number | null>(null);
  const [fareOptions, setFareOptions] = useState<TransportFareOption[]>([]);
  const [fareOptionsLoading, setFareOptionsLoading] = useState(false);
  const [fareOptionsError, setFareOptionsError] = useState<string | null>(null);
  const [railFare, setRailFare] = useState<RailFare | null>(null);
  const [railFareLoading, setRailFareLoading] = useState(false);
  const [railFareError, setRailFareError] = useState<string | null>(null);

  // Photos for terminals and stops, keyed "terminal-<id>" / "stop-<id>".
  const [pointImages, setPointImages] =
    useState<Record<string, PointImage>>({});

  // Watch the device's current location.
  useEffect(() => {
    if (!geolocation) return;

    let bestAccuracy = Number.POSITIVE_INFINITY;
    let hasReceivedPosition = false;
    let lastPosition: Coordinates | null = null;

    const watchId = geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        const next: Coordinates = [
          position.coords.latitude,
          position.coords.longitude,
        ];

        // Keep the best (most accurate) fix, but also refresh when the
        // device has actually moved so a shifted location retriggers routing.
        const movedEnough =
          lastPosition === null ||
          getDistanceMeters(lastPosition, next) >= 15;

        const betterAccuracy =
          !hasReceivedPosition || accuracy < bestAccuracy;

        if (hasReceivedPosition && !movedEnough && !betterAccuracy) {
          return;
        }

        hasReceivedPosition = true;
        bestAccuracy = Math.min(bestAccuracy, accuracy);
        lastPosition = next;

        setCurrentPosition(next);

        setLocationStatus("success");
        setLocationError(null);
      },
      (error) => {
        if (hasReceivedPosition) return;

        let message: string;

        switch (error.code) {
          case error.PERMISSION_DENIED:
            message =
              "Location permission denied. Enable it in your browser settings.";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "Your current location is unavailable.";
            break;
          case error.TIMEOUT:
            message = "Location request timed out. Please try again.";
            break;
          default:
            message = "Unable to determine your current location.";
        }

        setLocationStatus("error");
        setLocationError(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      }
    );

    const popupTimer = window.setTimeout(() => {
      setShowLocationPopup(false);
    }, 4000);

    return () => {
      geolocation.clearWatch(watchId);
      window.clearTimeout(popupTimer);
    };
  }, [geolocation]);

  // Load active terminals.
  useEffect(() => {
    let active = true;

    async function loadTerminals() {
      setTerminalsLoading(true);
      setTerminalError(null);

      try {
        const data = await getTerminals();

        if (active) setTerminals(data);
      } catch (error: unknown) {
        if (active) {
          setTerminalError(
            error instanceof Error
              ? error.message
              : "Unable to load terminals."
          );
        }
      } finally {
        if (active) setTerminalsLoading(false);
      }
    }

    void loadTerminals();

    return () => {
      active = false;
    };
  }, []);

  // Load active routes and their visible map points.
  useEffect(() => {
    let active = true;

    async function loadRouteMap() {
      setRoutesLoading(true);
      setRouteMapError(null);

      try {
        const index = await getRouteMapIndex();
        if (active) setRouteMapIndex(index);
      } catch (error: unknown) {
        if (active) {
          setRouteMapError(
            error instanceof Error
              ? error.message
              : "Unable to load routes and map points."
          );
        }
      } finally {
        if (active) setRoutesLoading(false);
      }
    }

    void loadRouteMap();

    return () => {
      active = false;
    };
  }, []);

  const loadRouteLayer = useCallback(
    (routeId: number): Promise<LoadedRouteLayer> => {
      const cached = routeLayerCache.current.get(routeId);
      if (cached) return cached;

      setRouteLayers((current) => ({
        ...current,
        [routeId]: { ...current[routeId], status: "loading", error: undefined },
      }));

      const request = (async (): Promise<LoadedRouteLayer> => {
        const route = await getRouteDetails(routeId);
        setRouteLayers((current) => ({
          ...current,
          [routeId]: { status: "loading", route },
        }));

        try {
          const geometry = await getRouteGeometry(route);
          setRouteLayers((current) => ({
            ...current,
            [routeId]: { status: "ready", route, geometry },
          }));
          return { route, geometry };
        } catch (error: unknown) {
          setRouteLayers((current) => ({
            ...current,
            [routeId]: {
              status: "error",
              route,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to calculate this route's geometry.",
            },
          }));
          routeLayerCache.current.delete(routeId);
          return { route, geometry: null };
        }
      })();

      routeLayerCache.current.set(routeId, request);
      void request.catch((error: unknown) => {
        if (routeLayerCache.current.get(routeId) === request) {
          routeLayerCache.current.delete(routeId);
        }
        setRouteLayers((current) => ({
          ...current,
          [routeId]: {
            ...current[routeId],
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Unable to load this route.",
          },
        }));
      });

      return request;
    },
    []
  );

  const loadVisibleRouteLayers = useCallback(
    (routeIds: number[]) => {
      const uniqueIds = [...new Set(routeIds)];
      setVisibleRouteIds(uniqueIds);
      uniqueIds.forEach((routeId) => {
        void loadRouteLayer(routeId).catch(() => undefined);
      });
    },
    [loadRouteLayer]
  );

  // Load route details (type, variant, ordered stops) when the selection changes.
  useEffect(() => {
    let active = true;

    async function loadSelectedRoute() {
      setSelectedRoute(null);
      setSelectedRouteStops([]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setFareOptions([]);
      setRailFare(null);
      setFareOptionsError(null);
      setFareOptionsLoading(false);
      setRailFareError(null);
      setRailFareLoading(false);
      setRouteError(null);
      setRouteStopsLoading(false);

      if (!selectedRouteId) {
        pendingBoardingPoint.current = null;
        return;
      }

      setRouteStopsLoading(true);

      try {
        const { route: details } = await loadRouteLayer(
          Number(selectedRouteId)
        );

        if (active) {
          const pendingPoint = pendingBoardingPoint.current;
          pendingBoardingPoint.current = null;

          setSelectedRoute(details);
          setSelectedRouteStops(details.route_stops);

          if (pendingPoint) {
            const index = findRouteStopIndex(
              details.route_stops,
              pendingPoint
            );
            if (index !== null) setBoardingIndex(index);
          }
        }
      } catch (error: unknown) {
        if (active) {
          pendingBoardingPoint.current = null;
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load this route."
          );
        }
      } finally {
        if (active) setRouteStopsLoading(false);
      }
    }

    void loadSelectedRoute();

    return () => {
      active = false;
    };
  }, [loadRouteLayer, selectedRouteId]);

  // Load all active fare variants and matching rules for this route's area.
  useEffect(() => {
    let active = true;

    async function loadFareOptions() {
      setFareOptions([]);
      setFareOptionsError(null);

      if (!selectedRoute) {
        setFareOptionsLoading(false);
        return;
      }

      setFareOptionsLoading(true);

      try {
        const options = await getTransportFareOptions(
          selectedRoute.transport_type_id,
          selectedRoute.fare_area_id
        );

        if (active) setFareOptions(options);
      } catch (error: unknown) {
        if (active) {
          setFareOptionsError(
            error instanceof Error
              ? error.message
              : "Unable to load fare comparisons."
          );
        }
      } finally {
        if (active) setFareOptionsLoading(false);
      }
    }

    void loadFareOptions();

    return () => {
      active = false;
    };
  }, [selectedRoute]);

  // Rail: look up the station-to-station fare for the chosen pair.
  useEffect(() => {
    let active = true;

    async function loadRailFare() {
      if (
        !selectedRoute ||
        selectedRoute.transport_variants.fare_model !== "matrix"
      ) {
        return;
      }

      setRailFare(null);
      setRailFareError(null);
      setRailFareLoading(false);

      if (boardingIndex === null || destinationIndex === null) return;

      const board = selectedRouteStops[boardingIndex];
      const alight = selectedRouteStops[destinationIndex];

      if (!board || !alight) return;

      if (board.kind !== "stop" || alight.kind !== "stop") {
        setRailFareError("Rail fares are only available between stations.");
        return;
      }

      setRailFareLoading(true);

      try {
        const fare = await getRailFare(
          selectedRoute.id,
          board.ref_id,
          alight.ref_id
        );

        if (active) setRailFare(fare);
      } catch (error: unknown) {
        if (active) {
          setRailFareError(
            error instanceof Error
              ? error.message
              : "Unable to load the rail fare."
          );
        }
      } finally {
        if (active) setRailFareLoading(false);
      }
    }

    void loadRailFare();

    return () => {
      active = false;
    };
  }, [selectedRoute, selectedRouteStops, boardingIndex, destinationIndex]);

  // Load photos for terminals, selected-route stops, and the open place.
  useEffect(() => {
    let active = true;

    async function loadPointImages() {
      const terminalIds = terminals.map((terminal) => terminal.id);
      const stopIds = selectedRouteStops
        .filter((stop) => stop.kind === "stop")
        .map((stop) => stop.ref_id);
      if (selectedPlace?.kind === "terminal") {
        terminalIds.push(selectedPlace.ref_id);
      } else if (selectedPlace?.kind === "stop") {
        stopIds.push(selectedPlace.ref_id);
      }

      try {
        const images = await getPointImages(terminalIds, stopIds);

        if (active) setPointImages(images);
      } catch {
        // Photos are optional, so a failure just means no image in the popup.
        if (active) setPointImages({});
      }
    }

    void loadPointImages();

    return () => {
      active = false;
    };
  }, [terminals, selectedRouteStops, selectedPlace]);

  // Derived route display values.
  const routeColor = selectedRoute?.transport_types.color ?? "#2563eb";
  const isRailRoute =
    selectedRoute?.transport_variants.fare_model === "matrix";
  const originName = selectedRouteStops[0]?.name;
  const destinationName =
    selectedRouteStops[selectedRouteStops.length - 1]?.name;
  const canEditRoute =
    !!selectedRoute &&
    !!currentUserId &&
    selectedRoute.created_by === currentUserId;
  const selectedPlaceImage = selectedPlace
    ? pointImages[`${selectedPlace.kind}-${selectedPlace.ref_id}`]
    : undefined;

  // Trip + fare.
  const boardingStop =
    boardingIndex !== null ? selectedRouteStops[boardingIndex] : null;
  const destinationStop =
    destinationIndex !== null ? selectedRouteStops[destinationIndex] : null;
  const hasTripSegment =
    !!selectedRoute &&
    boardingIndex !== null &&
    destinationIndex !== null &&
    destinationIndex > boardingIndex &&
    boardingStop?.route_id === selectedRoute.id &&
    destinationStop?.route_id === selectedRoute.id;

  const tripDistanceMeters =
    hasTripSegment &&
    stopDistances.length === selectedRouteStops.length
      ? Number.isFinite(stopDistances[boardingIndex]) &&
        Number.isFinite(stopDistances[destinationIndex])
        ? stopDistances[destinationIndex] - stopDistances[boardingIndex]
        : null
      : null;

  const fareOptionEstimates =
    hasTripSegment && tripDistanceMeters !== null
      ? calculateFareOptionEstimates(fareOptions, tripDistanceMeters)
      : [];
  const fareCards = buildFareCards(
    fareOptionEstimates,
    railFare,
    isRailRoute ? selectedRoute?.transport_variants.id ?? null : null
  );

  const handleTripStop = (index: number) => {
    const selection = selectTripStop(
      { boardingIndex, destinationIndex },
      index
    );
    setBoardingIndex(selection.boardingIndex);
    setDestinationIndex(selection.destinationIndex);
  };

  const handlePlaceSelect = (point: RouteMapPoint) => {
    setSelectedPlacePoint(point);
    loadVisibleRouteLayers(point.routes.map(({ route }) => route.id));
    setShowSearchResults(false);
    setSearchQuery("");
    setActiveSearchIndex(0);

    if (selectedRoute) {
      const routeStopIndex = findRouteStopIndex(selectedRouteStops, point);
      if (routeStopIndex !== null) handleTripStop(routeStopIndex);
      return;
    }

    if (selectedRouteId) {
      const activeRouteId = Number(selectedRouteId);
      if (point.routes.some(({ route }) => route.id === activeRouteId)) {
        pendingBoardingPoint.current = {
          kind: point.kind,
          ref_id: point.ref_id,
        };
      }
      return;
    }

    const uniqueRoute = getUniqueServingRoute(point);
    if (!uniqueRoute) return;

    pendingBoardingPoint.current = {
      kind: point.kind,
      ref_id: point.ref_id,
    };
    setSelectedRouteId(String(uniqueRoute.id));
  };

  const handleRouteLineSelect = (routeId: number) => {
    const nextRouteId = String(routeId);
    if (selectedRouteId === nextRouteId) return;
    pendingBoardingPoint.current = null;
    setSelectedRouteId(nextRouteId);
  };

  const handleSearchResultSelect = (result: RouteMapSearchResult) => {
    setSearchQuery("");
    setShowSearchResults(false);
    setActiveSearchIndex(0);

    if (result.kind === "route") {
      pendingBoardingPoint.current = null;
      setSelectedPlacePoint(null);
      loadVisibleRouteLayers([result.route.id]);
      setBoardingIndex(null);
      setDestinationIndex(null);
      setSelectedRouteId(String(result.route.id));
      return;
    }

    handlePlaceSelect(result.point);
  };

  const handleSearchKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Escape") {
      setShowSearchResults(false);
      return;
    }

    if (!showSearchResults || searchResults.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index >= searchResults.length - 1 ? 0 : index + 1
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchIndex((index) =>
        index <= 0 ? searchResults.length - 1 : index - 1
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      handleSearchResultSelect(searchResults[activeSearchIndex]);
    }
  };

  const clearTrip = () => {
    pendingBoardingPoint.current = null;
    setBoardingIndex(null);
    setDestinationIndex(null);
  };

  const handleListPick = (index: number) => {
    handleTripStop(index);
  };

  const pointIcon = (index: number, stop: RouteStop) => {
    if (index === boardingIndex) return getMapIcon("boarding");
    if (index === destinationIndex) return getMapIcon("destination");
    if (stop.kind === "terminal") return getMapIcon("terminal");

    return stop.stop_type === "train_station"
      ? getMapIcon("train_station", routeColor)
      : getMapIcon("stop", routeColor);
  };

  const handleNavigation = (name: string) => {
    // Connect Recents, Saved, and vehicle filters later.
    void name;
    void currentUserId;
  };

  const handleGoHome = () => {
    window.location.href = "/home";
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await onLogout();
      window.location.href = "/";
    } catch {
      setLoggingOut(false);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-white">
      {/* MAP */}
      <section className="absolute inset-0 z-0 h-full w-full">
        <MapContainer
          center={defaultPosition}
          zoom={14}
          scrollWheelZoom
          zoomControl={false}
          dragging
          touchZoom
          doubleClickZoom
          boxZoom
          keyboard
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <CurrentLocationMarker position={currentPosition} />
          <PlaceViewport
            position={
              selectedPlace
                ? [selectedPlace.latitude, selectedPlace.longitude]
                : null
            }
          />

          {displayedRouteLayers.map(({ routeId, route, geometry }) => {
            const isActive = routeId === Number(selectedRouteId);
            const transportName = route.transport_types.name.toLowerCase();
            const dashArray = transportName.includes("bus")
              ? "3 7"
              : transportName.includes("jeep")
                ? "12 7"
                : routeId % 2 === 0
                  ? "8 5"
                  : "2 5";
            const geometryKey = getRouteGeometryKey(geometry.positions);

            return geometry.positions.length >= 2 ? (
              <Fragment key={routeId}>
                <Polyline
                  positions={geometry.positions}
                  pathOptions={{
                    color: "#ffffff",
                    weight: isActive ? 11 : 8,
                    opacity: isActive ? 0.9 : 0.55,
                  }}
                />
                <Polyline
                  positions={geometry.positions}
                  pathOptions={{
                    color: route.transport_types.color,
                    weight: isActive ? 7 : 4,
                    opacity: isActive ? 1 : 0.7,
                    dashArray,
                  }}
                  eventHandlers={{
                    click: () =>
                      handleRouteLineSelect(
                        getNextOverlappingRouteId(
                          coincidentRouteIdsByGeometry.get(geometryKey) ?? [
                            routeId,
                          ],
                          selectedRouteId ? Number(selectedRouteId) : null,
                          routeId
                        )
                      ),
                  }}
                />
              </Fragment>
            ) : null;
          })}
          {displayedRoutePositions.length > 0 && (
            <RouteViewport positions={displayedRoutePositions} />
          )}

          {mapPoints.flatMap((point) => {
            const routeStopIndex = selectedRoute
              ? findRouteStopIndex(selectedRouteStops, point)
              : null;
            const routeStop =
              routeStopIndex === null
                ? null
                : selectedRouteStops[routeStopIndex] ?? null;
            const isOnSelectedRoute =
              routeStopIndex !== null && routeStop !== null;
            const position: Coordinates =
              routeStopIndex !== null && routeStop
                ? stopMapPositions[routeStopIndex] ?? [
                    point.latitude,
                    point.longitude,
                  ]
                : [point.latitude, point.longitude];
            const routeModes = new Map<
              number,
              {
                kind: "bus_stop" | "jeepney_stop" | "train_station" | "stop";
                color: string;
              }
            >();
            point.routes.forEach(({ route }) => {
              const name = route.transport_types.name.toLowerCase();
              const kind = point.stop_type === "train_station"
                ? "train_station"
                : name.includes("jeep")
                  ? "jeepney_stop"
                  : name.includes("bus")
                    ? "bus_stop"
                    : "stop";
              routeModes.set(route.transport_type_id, {
                kind,
                color: route.transport_types.color,
              });
            });
            const modes = [...routeModes.values()];
            if (modes.length === 0 && point.kind === "stop") {
              modes.push({
                kind:
                  point.stop_type === "train_station"
                    ? "train_station"
                    : "stop",
                color: "#2563eb",
              });
            }

            const isBoardingMarker = routeStopIndex === boardingIndex;
            const isDestinationMarker = routeStopIndex === destinationIndex;
            const markerModes =
              isBoardingMarker || isDestinationMarker
                ? [
                    {
                      kind: isBoardingMarker
                        ? ("boarding" as const)
                        : ("destination" as const),
                      color: routeColor,
                    },
                  ]
                : point.kind === "terminal"
                  ? [{ kind: "terminal" as const, color: "#0f2a47" }]
                  : modes;
            const offsetStart = -((markerModes.length - 1) * 9) / 2;

            return markerModes.map((mode, modeIndex) => {
              const icon =
                (isBoardingMarker || isDestinationMarker) &&
                routeStopIndex !== null &&
                routeStop
                  ? pointIcon(routeStopIndex, routeStop)
                  : getMapIcon(
                      mode.kind,
                      mode.color,
                      offsetStart + modeIndex * 9
                    );

              return (
                <Marker
                  key={`${point.kind}-${point.ref_id}-${mode.kind}`}
                  position={position}
                  icon={icon}
                  alt={`${point.name} ${mode.kind.replace("_stop", "")}`}
                  title={`${point.name} — ${mode.kind.replace("_stop", "")}`}
                  zIndexOffset={isOnSelectedRoute ? 1000 : 500}
                  eventHandlers={{
                    click: () => handlePlaceSelect(point),
                  }}
                />
              );
            });
          })}
        </MapContainer>
      </section>

      {/* LOCATION STATUS */}
      {showLocationPopup && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-5 right-5 z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg"
        >
          {locationStatus === "loading" && (
            <p className="text-gray-700">
              Getting your location...
            </p>
          )}

          {locationStatus === "success" && (
            <p className="text-green-700">
              <MapPin size={16} className="mr-1 inline" />
              Your location has been detected.
            </p>
          )}

          {locationStatus === "error" && (
            <p className="text-red-700">{locationError}</p>
          )}
        </div>
      )}

      {/* TERMINAL STATUS */}
      {(terminalsLoading || terminalError) && (
        <div
          role={terminalError ? "alert" : "status"}
          className="absolute bottom-5 left-[230px] z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg sm:left-[240px] md:left-[250px]"
        >
          {terminalsLoading && (
            <p className="text-gray-700">
              Loading saved terminals...
            </p>
          )}

          {terminalError && (
            <p className="text-red-700">
              Failed to load terminals: {terminalError}
            </p>
          )}
        </div>
      )}

      {/* SIDEBAR */}
      <aside
        className="
          absolute left-0 top-0 z-[2000]
          flex h-screen w-[220px] flex-col
          border-r border-white/10 bg-[#0f2a47] text-white
          sm:w-[230px] md:w-[240px] lg:w-[250px]
        "
      >
        <button
          type="button"
          onClick={handleGoHome}
          title="Home"
          className="
            absolute flex items-center justify-center rounded-lg
            transition-colors duration-200 hover:bg-white/10
          "
          style={{ top: "30px", width: "100%", height: "75px" }}
        >
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        </button>

        <nav
          className="
            absolute left-0 top-[145px]
            flex w-full flex-col gap-1.5 px-3
          "
        >
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === "Your Contribution") {
                    window.location.href = "/contribution";
                    return;
                  }

                  if (item.label === "Community") {
                    window.location.href = "/community";
                    return;
                  }

                  handleNavigation(item.label);
                }}
                className="
                  group flex h-[46px] w-full items-center
                  rounded-xl px-3 text-left font-medium text-white
                  transition-colors duration-200
                  hover:bg-[#d0d5db] hover:text-[#0f2a47]
                "
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

      {/* HEADER */}
      <header
        className="
          absolute left-[270px] top-[45px] z-[3000]
          flex items-center
          sm:left-[280px] md:left-[290px] lg:left-[300px]
        "
        style={{ height: "45px" }}
      >
        {/* SEARCH */}
        <div
          className="
            relative h-[50px] w-[260px] shrink-0
            sm:w-[320px] md:w-[360px] lg:w-[400px]
          "
        >
          <MapPin
            size={19}
            strokeWidth={2}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600"
          />

          <Input
            type="text"
            role="combobox"
            aria-label="Search routes, stops, and terminals"
            aria-autocomplete="list"
            aria-expanded={
              showSearchResults && searchQuery.trim().length > 0
            }
            aria-controls={
              showSearchResults && searchQuery.trim().length > 0
                ? "route-place-search-results"
                : undefined
            }
            aria-activedescendant={
              showSearchResults && searchResults.length > 0
                ? `route-place-search-result-${activeSearchIndex}`
                : undefined
            }
            placeholder="Search routes, stops, and terminals..."
            value={searchQuery}
            className="
              h-full w-full rounded-full border border-gray-300
              bg-white pl-12 pr-5 text-[16px]
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              outline-none placeholder:text-gray-500
              focus-visible:ring-1 focus-visible:ring-gray-300
            "
            onFocus={() => setShowSearchResults(true)}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setActiveSearchIndex(0);
              setShowSearchResults(true);
            }}
            onKeyDown={handleSearchKeyDown}
          />

          {showSearchResults && searchQuery.trim() && (
            <div
              id="route-place-search-results"
              role="listbox"
              aria-label="Route and place search results"
              className="absolute left-0 right-0 top-[56px] z-[3500] max-h-[60vh] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
            >
              {searchResults.length === 0 ? (
                <p role="status" className="px-3 py-2 text-sm text-gray-500">
                  No matching routes or places.
                </p>
              ) : (
                searchResults.map((result, index) => {
                  const label =
                    result.kind === "route"
                      ? result.route.name
                      : result.point.name;
                  const detail =
                    result.kind === "route"
                      ? result.route.transport_types.name
                      : `${stopTypeLabel(result.point)} · ${
                          result.point.routes.length
                        } ${
                          result.point.routes.length === 1 ? "route" : "routes"
                        }`;

                  return (
                    <button
                      key={
                        result.kind === "route"
                          ? `route-${result.route.id}`
                          : `point-${result.point.kind}-${result.point.ref_id}`
                      }
                      id={`route-place-search-result-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      onClick={() => handleSearchResultSelect(result)}
                      className={`flex w-full flex-col rounded-lg px-3 py-2 text-left ${
                        index === activeSearchIndex
                          ? "bg-blue-50"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-sm font-medium text-gray-900">
                        {label}
                      </span>
                      <span className="mt-0.5 text-xs text-gray-500">
                        {result.kind === "point" &&
                        result.point.routes.length === 0
                          ? `${detail} · no routes listed`
                          : detail}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* VEHICLE FILTERS */}
        <div
          className="
            ml-[8px] flex h-[52px] flex-nowrap items-center gap-[5px]
            sm:ml-[12px] sm:gap-[7px]
            lg:ml-[35px] lg:gap-[10px]
          "
        >
          <button
            type="button"
            onClick={() => handleNavigation("Jeep")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <Car size={18} strokeWidth={2} />
            <span>jeep</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigation("Bus")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <Bus size={18} strokeWidth={2} />
            <span>bus</span>
          </button>

          <button
            type="button"
            onClick={() => handleNavigation("Train")}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:-translate-y-0.5
              hover:bg-[#eaf5fb] hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <TrainFront size={18} strokeWidth={2} />
            <span>train</span>
          </button>
        </div>

        {/* NOTIFICATION + PROFILE */}
        <div className="relative ml-[300px] flex h-[55px] items-center gap-[20px]">
          <button
            type="button"
            onClick={() => handleNavigation("Notifications")}
            title="Notifications"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell size={20} strokeWidth={2} />
          </button>

          <button
            type="button"
            onClick={() => setShowProfileMenu((previous) => !previous)}
            title="Profile"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200 hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <UserCircle size={21} strokeWidth={2} />
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

                  if (currentUserId) {
                    window.location.href = "/points-badges";
                  } else {
                    setShowSignInPrompt(true);
                  }
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
                Badges
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loggingOut ? "Logging out..." : "Log Out"}
              </button>
            </div>
          )}
        </div>
      </header>

      {/* PLACE DETAILS + ACTIVE ROUTE */}
      {(selectedPlace ||
        selectedRoute ||
        routesLoading ||
        routeStopsLoading ||
        routeMapError ||
        routeError ||
        (!routesLoading && routeMapIndex.routes.length === 0)) && (
      <div className="absolute left-[230px] top-[110px] z-[1500] max-h-[calc(100vh-130px)] w-[min(360px,calc(100vw-245px))] overflow-y-auto rounded-xl bg-white p-4 shadow-lg sm:left-[240px] md:left-[250px] lg:left-[300px]">
        {routesLoading && (
          <p role="status" className="text-sm text-gray-500">
            Loading routes and stops...
          </p>
        )}

        {routeMapError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            Failed to load routes and map points: {routeMapError}
          </p>
        )}

        {routeError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {routeError}
          </p>
        )}

        {!routesLoading &&
          !routeMapError &&
          routeMapIndex.routes.length === 0 && (
            <p className="text-sm text-gray-500">No active routes found.</p>
          )}

        {selectedPlace && (
          <section
            aria-labelledby="selected-place-title"
            className={selectedRoute ? "border-b border-gray-200 pb-4" : ""}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="selected-place-title"
                  className="text-base font-semibold text-gray-900"
                >
                  {selectedPlace.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  {stopTypeLabel(selectedPlace)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close place details"
                onClick={() => setSelectedPlacePoint(null)}
                className="rounded-full px-2 py-1 text-lg leading-none text-gray-500 hover:bg-gray-100"
              >
                ×
              </button>
            </div>

            {selectedPlaceImage && (
              <div className="mt-3">
                <img
                  src={selectedPlaceImage.url}
                  alt={selectedPlace.name}
                  loading="lazy"
                  className="h-36 w-full rounded-lg object-cover"
                />
                {!selectedPlaceImage.is_approved && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    Photo pending admin review
                  </p>
                )}
              </div>
            )}

            {selectedPlace.description && (
              <p className="mt-3 text-sm text-gray-700">
                {selectedPlace.description}
              </p>
            )}
            <p className="mt-2 text-[11px] text-gray-500">
              {selectedPlace.latitude.toFixed(5)},{" "}
              {selectedPlace.longitude.toFixed(5)}
            </p>

            {selectedPlace.routes.length > 1 && (
              <p className="mt-2 text-xs text-gray-600">
                Several routes serve this place. Click a colored route line to
                choose one; click again to cycle through overlapping lines.
              </p>
            )}

            {selectedRoute &&
              !routeStopsLoading &&
              findRouteStopIndex(selectedRouteStops, selectedPlace) ===
                null && (
                <p className="mt-2 text-xs text-amber-700">
                  This place is not served by {selectedRoute.name}. Select a
                  compatible route to use it as a trip stop.
                </p>
              )}

          </section>
        )}

        {routeStopsLoading && (
          <p role="status" className="mt-2 text-sm text-gray-500">
            Loading route details...
          </p>
        )}

        {roadRouteLoading && (
          <p role="status" className="mt-2 text-sm text-gray-500">
            Finding roads between stops...
          </p>
        )}

        {selectedRoute &&
          !roadRouteLoading &&
          routeDistanceMeters !== null &&
          routeDurationSeconds !== null && (
            <p className="mt-3 text-xs text-gray-500">
              {(routeDistanceMeters / 1000).toFixed(1)} km route
              {" · "}
              {Math.round(routeDurationSeconds / 60)} min
            </p>
          )}

        {/* Active route details */}
        {selectedRoute && (
          <div
            className={`flex min-h-0 flex-col ${
              selectedPlace
                ? "mt-4"
                : ""
            }`}
          >
            <div className="flex flex-wrap gap-2">
              <span
                className="w-fit rounded-full px-4 py-1 text-[11px] font-medium text-white"
                style={{ backgroundColor: routeColor }}
              >
                {selectedRoute.transport_variants.name}
              </span>

              {!selectedRoute.is_approved && (
                <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-[11px] font-medium text-amber-800">
                  {selectedRoute.moderation_status === "rejected"
                    ? "Rejected"
                    : "Pending admin approval"}
                </span>
              )}
            </div>

            <h2 className="mt-3 text-base font-semibold text-gray-900">
              {selectedRoute.name}
            </h2>

            <p className="mt-2 text-[11px] text-gray-500">
              Origin: {originName}
            </p>
            <p className="mt-1 text-[11px] text-gray-500">
              Destination: {destinationName}
            </p>

            {/* Trip + fare */}
            <div className="mt-3 rounded-lg bg-gray-50 p-3 text-[11px] text-gray-700">
              <div className="flex justify-between gap-2">
                <span>Boarding</span>
                <span className="text-right font-medium">
                  {boardingStop?.name ?? "Tap a stop or terminal"}
                </span>
              </div>

              <div className="mt-1 flex justify-between gap-2">
                <span>Destination</span>
                <span className="text-right font-medium">
                  {destinationStop?.name ?? "Tap a later stop"}
                </span>
              </div>

              {fareOptionsLoading && (
                <p role="status" className="mt-2 text-gray-500">
                  Loading fare comparisons...
                </p>
              )}

              {fareOptionsError && (
                <p role="alert" className="mt-2 text-red-600">
                  {fareOptionsError}
                </p>
              )}

              {isRailRoute && (
                <>
                  {railFareLoading && (
                    <p role="status" className="mt-2 text-gray-500">
                      Loading station fares...
                    </p>
                  )}
                  {railFareError && (
                    <p role="alert" className="mt-2 text-red-600">
                      {railFareError}
                    </p>
                  )}
                </>
              )}

              {!isRailRoute && selectedRoute.fare_area_id === null && (
                <p className="mt-2 text-amber-700">
                  Fare area is not assigned to this route. Fare estimates are
                  unavailable until its area and matching rules are configured.
                </p>
              )}

              {!hasTripSegment && (
                <p className="mt-2 text-gray-600">
                  Click a start point on this route, then a later stop to
                  compare fares.
                </p>
              )}

              {hasTripSegment &&
                !isRailRoute &&
                tripDistanceMeters === null && (
                  <p className="mt-2 text-gray-600">
                    {roadRouteLoading
                      ? "Calculating distance along the route..."
                      : "Route distance is unavailable, so fare estimates cannot be calculated."}
                  </p>
                )}

              {!fareOptionsLoading &&
                !fareOptionsError &&
                fareOptions.length === 0 && (
                  <p className="mt-2 text-amber-700">
                    No active fare variants are configured for this transport
                    type.
                  </p>
                )}

              {hasTripSegment &&
                isRailRoute &&
                railFareLoading && (
                  <p role="status" className="mt-2 text-gray-500">
                    Loading station fares...
                  </p>
                )}

              {hasTripSegment &&
                !fareOptionsLoading &&
                !fareOptionsError &&
                fareOptions.length > 0 &&
                (!isRailRoute ||
                  (isRailRoute && !railFareLoading)) &&
                (isRailRoute || tripDistanceMeters !== null) && (
                  <section
                    aria-label="Estimated fares"
                    className="mt-3"
                  >
                    <p className="mb-2 text-[10px] leading-snug text-gray-500">
                      Estimates only. Fares are based on the selected route
                      and configured rules.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {fareCards.map((card) => {
                        const Icon =
                          card.category === "regular"
                            ? UserRound
                            : card.category === "student"
                              ? GraduationCap
                              : Accessibility;

                        return (
                          <article
                            key={card.category}
                            aria-label={`${card.label} fare`}
                            className="min-w-0 rounded-lg border border-gray-200 bg-white p-2"
                          >
                            <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-800">
                              <Icon
                                aria-hidden="true"
                                className="h-4 w-4 shrink-0 text-blue-700"
                              />
                              {card.label}
                            </h4>

                            {card.options.length === 0 ? (
                              <p className="mt-2 text-[10px] text-amber-700">
                                Fare unavailable
                              </p>
                            ) : (
                              <div className="mt-1.5 space-y-2">
                                {card.options.map((option) => (
                                  <div
                                    key={option.variantId}
                                    className="border-t border-gray-100 pt-1.5 first:border-0 first:pt-0"
                                  >
                                    {card.options.length > 1 && (
                                      <p className="text-[9px] font-medium text-gray-500">
                                        {option.variantName}
                                      </p>
                                    )}
                                    {option.amounts.length > 0 ? (
                                      option.amounts.map((amount) => (
                                        <p
                                          key={amount.label || "fare"}
                                          className="text-[11px] font-semibold text-gray-900"
                                        >
                                          {amount.label && (
                                            <span className="font-normal text-gray-500">
                                              {amount.label}:{" "}
                                            </span>
                                          )}
                                          {amount.amount === null
                                            ? option.unavailableReason ??
                                              "Fare unavailable"
                                            : isRailRoute
                                              ? peso(amount.amount)
                                              : wholePeso(amount.amount)}
                                        </p>
                                      ))
                                    ) : (
                                      <p className="text-[10px] text-amber-700">
                                        {option.unavailableReason ??
                                          "Fare unavailable"}
                                      </p>
                                    )}
                                    {option.sources.map((source, index) => (
                                      <FareSource
                                        key={`${source.name}-${source.effectiveFrom}-${index}`}
                                        name={source.name}
                                        url={source.url}
                                        effectiveFrom={source.effectiveFrom}
                                        status={source.status}
                                      />
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}

              {(boardingIndex !== null || destinationIndex !== null) && (
                <button
                  type="button"
                  onClick={clearTrip}
                  className="mt-2 text-[11px] text-gray-500 underline"
                >
                  Clear trip
                </button>
              )}
            </div>

            <hr className="my-3 border-gray-200" />

            <h3 className="text-xs font-semibold text-gray-800">
              Stops ({selectedRouteStops.length})
            </h3>

            <ol
              aria-label={`Stops on ${selectedRoute.name}`}
              className="mt-3 max-h-[30vh] overflow-y-auto pr-1"
            >
              {selectedRouteStops.map((stop, index) => {
                const isBoarding = index === boardingIndex;
                const isDestination = index === destinationIndex;

                return (
                  <li
                    key={`${stop.kind}-${stop.ref_id}-${stop.stop_order}`}
                    className="relative pb-4 last:pb-0"
                  >
                    {index < selectedRouteStops.length - 1 && (
                      <span
                        className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px"
                        style={{ backgroundColor: routeColor, opacity: 0.4 }}
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => handleListPick(index)}
                      className="flex w-full items-center gap-3 text-left"
                    >
                      <span
                        className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center text-[10px] font-semibold text-white ${
                          stop.kind === "terminal"
                            ? "rounded-md"
                            : "rounded-full"
                        } ${
                          isBoarding
                            ? "ring-2 ring-green-500"
                            : isDestination
                              ? "ring-2 ring-red-500"
                              : ""
                        }`}
                        style={{ backgroundColor: routeColor }}
                      >
                        {stop.stop_order}
                      </span>

                      <span className="text-[11px] text-gray-800">
                        {stop.name}
                        {stop.kind === "terminal" ? " (Terminal)" : ""}
                        {stop.stop_type === "train_station"
                          ? " (Station)"
                          : ""}
                        {isBoarding && (
                          <span className="ml-1 font-semibold text-green-700">
                            · Boarding
                          </span>
                        )}
                        {isDestination && (
                          <span className="ml-1 font-semibold text-red-700">
                            · Destination
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 flex flex-col gap-2">
              {canEditRoute && (
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `/contribution?route=${selectedRoute.id}`;
                  }}
                  className="w-full rounded-full border border-gray-800 px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50"
                >
                  Edit route
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedRouteId("")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50"
              >
                Clear selected route
              </button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* SIGN-IN PROMPT */}
      {showSignInPrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">
              Sign in required
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              Please sign in to view your QPoints and badges.
            </p>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignInPrompt(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowSignInPrompt(false);
                  window.location.href = "/login";
                }}
                className="rounded-lg bg-[#0f2a47] px-4 py-2 text-sm font-medium text-white hover:bg-[#183b60]"
              >
                Sign In
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}