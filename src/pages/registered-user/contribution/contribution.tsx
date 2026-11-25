import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Bell,
  Car,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  Plus,
} from "lucide-react";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import MapSidebar from "@/components/map-layout/MapSidebar";
import MapHeader from "@/components/map-layout/MapHeader";
import AccountAvatar from "@/components/account/AccountAvatar";
import { useAccountProfile } from "@/components/account/accountProfileStore";

import ContributionHistory from "@/components/contributions/ContributionHistory";
import ContributionFormModal from "@/components/contributions/ContributionFormModal";

import type {
  ContributionMapLine,
  ContributionMapMarker,
} from "@/components/contributions/ContributionMap";
import type {
  RouteSequenceEntry,
} from "@/components/contributions/RouteSequencePanel";
import type {
  PhotoPreview,
} from "@/components/contributions/PhotoUploadGrid";

import {
  attachMapImage,
  validateImage,
} from "@/lib/mapImages";

import {
  getMyContributions,
  getTransitCatalog,
  getTransportOptions,
  pointKey,
  submitContribution,
  submitRouteChangeProposal,
} from "@/lib/contributions";

import type {
  ContributionInput,
  ContributionKind,
  ExistingPoint,
  ExistingRoute,
  MyContribution,
  MyContributionStatus,
  PointInput,
  PointKind,
  RouteChangePointInput,
  RouteChangeProposalInput,
  StopKind,
  TransportTypeOption,
  TransportVariantOption,
} from "@/lib/contributions";

import {
  buildAutomaticRouteSequence,
  suggestExtendedRouteName,
} from "@/lib/routePlacement";
import type {
  RoutePlacementPoint,
} from "@/lib/routePlacement";

interface ContributionProps {
  currentUserId: string;
  onLogout: () => void;
}

type Coordinates = [number, number];
type FormAction = "terminal" | "route" | "modify_route";

interface PhotoItem {
  file: File;
  previewUrl: string;
}

interface RoutePoint {
  key: string;
  kind: PointKind;
  existingId: number | null;
  name: string;
  description: string;
  stopType: StopKind;
  latitude: number;
  longitude: number;
  photo: PhotoItem | null;
}

interface AutomaticBasePoint extends RoutePlacementPoint {
  source: "base";
  kind: PointKind;
  existingId: number;
  point: ExistingPoint;
}

interface AutomaticAdditionPoint extends RoutePlacementPoint {
  source: "addition";
  kind: PointKind;
  existingId: number | null;
  point: RoutePoint;
}

const MAX_PHOTOS = 3;
const MAX_ROUTE_POINTS = 60;
const MAX_PROPOSED_ROUTE_POINTS = 100;

const navItems = [
  { label: "Recents", icon: HomeIcon },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

function safeColor(color: string | undefined) {
  return color && /^#[0-9a-fA-F]{3,8}$/.test(color)
    ? color
    : "#12395A";
}

function existingPointTypeLabel(point: ExistingPoint) {
  if (point.kind === "terminal") return "Terminal";
  return point.stopType === "train_station" ? "Station" : "Stop";
}

function routePointTypeLabel(point: RoutePoint) {
  if (point.kind === "terminal") return "Terminal";
  return point.stopType === "train_station" ? "Station" : "Stop";
}

function getPointStopNumber(
  points: readonly { kind: PointKind }[],
  index: number
): number | null {
  if (points[index]?.kind !== "stop") return null;
  return points
    .slice(0, index + 1)
    .filter((point) => point.kind === "stop")
    .length;
}

function getCoordinates(
  points: readonly { latitude: number; longitude: number }[]
): Coordinates[] {
  return points.map(({ latitude, longitude }) => [latitude, longitude]);
}

function toRoutePoint(point: ExistingPoint): RoutePoint {
  return {
    key: pointKey(point.kind, point.id),
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

export default function Contribution({
  currentUserId,
  onLogout,
}: ContributionProps) {
  const { account, userId: profileUserId } = useAccountProfile();
  const profileAccount = profileUserId === currentUserId ? account : null;

  // Page and modal state
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Draft mode and fields
  const [formAction, setFormAction] = useState<FormAction>("terminal");
  const isRouteChange = formAction === "modify_route";
  const kind: ContributionKind = formAction === "terminal" ? "terminal" : "route";
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [routeNameEdited, setRouteNameEdited] = useState(false);

  // Vehicle and route selection
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [selectedExistingRouteId, setSelectedExistingRouteId] = useState("");
  const [types, setTypes] = useState<TransportTypeOption[]>([]);
  const [variants, setVariants] = useState<TransportVariantOption[]>([]);
  const [optionsError, setOptionsError] = useState("");

  // Catalog is fetched only after a vehicle type is selected.
  const [existingPoints, setExistingPoints] = useState<ExistingPoint[]>([]);
  const [existingRoutes, setExistingRoutes] = useState<ExistingRoute[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [existingError, setExistingError] = useState("");
  const catalogRequestId = useRef(0);

  // Map and route draft
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [routePoints, setRoutePoints] = useState<RoutePoint[]>([]);
  const [currentPosition, setCurrentPosition] = useState<Coordinates | null>(null);
  const [focus, setFocus] = useState<Coordinates | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const autoPinned = useRef(false);
  const [existingQuery, setExistingQuery] = useState("");
  const [inspectKey, setInspectKey] = useState<string | null>(null);
  const [selectedPointKey, setSelectedPointKey] = useState<string | null>(null);
  const [selectedPreviewRouteId, setSelectedPreviewRouteId] = useState<number | null>(null);

  // Photos
  const [photos, setPhotos] = useState<PhotoItem[]>([]);

  // Contribution history
  const [mine, setMine] = useState<MyContribution[]>([]);
  const [mineLoading, setMineLoading] = useState(true);
  const [mineError, setMineError] = useState("");

  // Derived selections and lookups
  const selectedType = types.find((type) => String(type.id) === vehicleTypeId);
  const typeVariants = variants.filter(
    (variant) => String(variant.transport_type_id) === vehicleTypeId
  );
  const selectedVariant = variants.find((variant) => String(variant.id) === variantId);
  const routeColor = safeColor(selectedType?.color);

  const existingByKey = useMemo(
    () => new Map(
      existingPoints.map((point) => [pointKey(point.kind, point.id), point] as const)
    ),
    [existingPoints]
  );

  const usedKeys = useMemo(
    () => new Set(
      routePoints.flatMap((point) =>
        point.existingId === null
          ? []
          : [pointKey(point.kind, point.existingId)]
      )
    ),
    [routePoints]
  );

  const query = existingQuery.trim().toLowerCase();
  const matches = useCallback(
    (point: ExistingPoint) =>
      !query || point.name.toLowerCase().includes(query),
    [query]
  );

  const selectedExistingRoute = useMemo(
    () => existingRoutes.find(
      (route) => String(route.id) === selectedExistingRouteId
    ) ?? null,
    [existingRoutes, selectedExistingRouteId]
  );

  const selectedExistingRouteVariant = selectedExistingRoute
    ? variants.find((variant) => variant.id === selectedExistingRoute.variantId)
    : undefined;
  const selectedExistingRouteType = selectedExistingRoute
    ? types.find((type) => type.id === selectedExistingRoute.transportTypeId)
    : undefined;
  const selectedExistingRouteColor = safeColor(selectedExistingRouteType?.color);
  const isRail = (
    isRouteChange
      ? selectedExistingRouteVariant?.fare_model
      : selectedVariant?.fare_model
  ) === "matrix";
  const selectedVehicleTypeName = isRouteChange
    ? selectedExistingRouteType?.name ?? ""
    : selectedType?.name ?? "";
  const activeRouteColor = isRouteChange
    ? selectedExistingRouteColor
    : routeColor;

  // Data loading
  const loadMine = useCallback(async () => {
    setMineLoading(true);
    setMineError("");

    try {
      setMine(await getMyContributions(currentUserId));
    } catch (error: unknown) {
      setMineError(
        error instanceof Error ? error.message : "Unable to load your contributions."
      );
    } finally {
      setMineLoading(false);
    }
  }, [currentUserId]);

  const loadCatalogForVehicle = useCallback(async (transportTypeId: number) => {
    const requestId = ++catalogRequestId.current;
    setCatalogLoading(true);
    setExistingError("");
    setExistingPoints([]);
    setExistingRoutes([]);

    try {
      const catalog = await getTransitCatalog(currentUserId, transportTypeId);
      if (requestId !== catalogRequestId.current) return;
      setExistingPoints(catalog.points);
      setExistingRoutes(catalog.routes);
    } catch (error: unknown) {
      if (requestId !== catalogRequestId.current) return;
      setExistingError(
        error instanceof Error
          ? error.message
          : "Unable to load the selected vehicle's approved locations."
      );
    } finally {
      if (requestId === catalogRequestId.current) setCatalogLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  useEffect(() => {
    let active = true;

    getTransportOptions(currentUserId)
      .then((options) => {
        if (!active) return;
        setTypes(options.types);
        setVariants(options.variants);
        setOptionsError("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setOptionsError(
          error instanceof Error ? error.message : "Unable to load vehicle types."
        );
      });

    return () => {
      active = false;
    };
  }, [currentUserId]);

  useEffect(() => () => {
    catalogRequestId.current += 1;
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Existing locations available when creating a new route
  const candidates = useMemo(() => {
    if (formAction !== "route" || !vehicleTypeId || !selectedVariant) return [];

    return existingPoints.filter((point) => {
      const key = pointKey(point.kind, point.id);
      if (String(point.transportTypeId) !== vehicleTypeId || usedKeys.has(key)) {
        return false;
      }

      if (selectedVariant.fare_model === "matrix") {
        return point.kind === "stop" && point.stopType === "train_station";
      }

      if (routePoints.length === 0) return point.kind === "terminal";
      return point.kind === "stop" && point.stopType === "road_stop";
    });
  }, [formAction, vehicleTypeId, selectedVariant, existingPoints, usedKeys, routePoints.length]);

  const lastPoint = routePoints[routePoints.length - 1];
  const lastExisting = lastPoint?.existingId !== null && lastPoint?.existingId !== undefined
    ? existingByKey.get(pointKey(lastPoint.kind, lastPoint.existingId))
    : undefined;

  const connectedKeys = useMemo(() => {
    if (!lastExisting) return new Set<string>();
    const routeIds = new Set(lastExisting.routeIds);
    return new Set(
      candidates
        .filter((point) => point.routeIds.some((routeId) => routeIds.has(routeId)))
        .map((point) => pointKey(point.kind, point.id))
    );
  }, [lastExisting, candidates]);

  const connectedList = candidates.filter((point) =>
    connectedKeys.has(pointKey(point.kind, point.id)) && matches(point)
  );
  const otherTerminals = candidates.filter(
    (point) => point.kind === "terminal" &&
      !connectedKeys.has(pointKey(point.kind, point.id)) && matches(point)
  );
  const otherStops = candidates.filter(
    (point) => point.kind === "stop" &&
      !connectedKeys.has(pointKey(point.kind, point.id)) && matches(point)
  );

  // Existing route's approved sequence
  const routeChangeBasePoints = useMemo(
    () => selectedExistingRoute
      ? selectedExistingRoute.keys.flatMap((key) => {
          const point = existingByKey.get(key);
          return point ? [point] : [];
        })
      : [],
    [selectedExistingRoute, existingByKey]
  );

  const routeChangeBaseKeys = useMemo(
    () => new Set(selectedExistingRoute?.keys ?? []),
    [selectedExistingRoute]
  );

  const routeChangeCandidates = useMemo(() => {
    if (!selectedExistingRoute || !selectedExistingRouteVariant) return [];

    return existingPoints.filter((point) => {
      if (
        point.kind !== "stop" ||
        point.transportTypeId !== selectedExistingRoute.transportTypeId
      ) return false;

      const key = pointKey(point.kind, point.id);
      if (routeChangeBaseKeys.has(key) || usedKeys.has(key)) return false;

      return selectedExistingRouteVariant.fare_model === "matrix"
        ? point.stopType === "train_station"
        : point.stopType === "road_stop";
    });
  }, [
    existingPoints,
    selectedExistingRoute,
    selectedExistingRouteVariant,
    routeChangeBaseKeys,
    usedKeys,
  ]);

  const matchingRouteChangeCandidates = routeChangeCandidates.filter(matches);

  // Build an ordered route proposal from coordinates, without a distance cutoff.
  const routeChangePlacement = useMemo(() => {
    if (
      !isRouteChange ||
      !selectedExistingRoute ||
      routePoints.length === 0 ||
      routeChangeBasePoints.length !== selectedExistingRoute.keys.length
    ) return null;

    const basePoints: AutomaticBasePoint[] = routeChangeBasePoints.map((point) => ({
      key: pointKey(point.kind, point.id),
      name: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
      source: "base",
      kind: point.kind,
      existingId: point.id,
      point,
    }));

    const additionPoints: AutomaticAdditionPoint[] = routePoints.map((point) => ({
      key: point.key,
      name: point.name,
      latitude: point.latitude,
      longitude: point.longitude,
      source: "addition",
      kind: point.kind,
      existingId: point.existingId,
      point,
    }));

    return buildAutomaticRouteSequence(basePoints, additionPoints);
  }, [isRouteChange, selectedExistingRoute, routeChangeBasePoints, routePoints]);

  const routeNameSuggestion = useMemo(() => {
    if (
      routeChangePlacement?.status !== "ready" ||
      routeChangePlacement.proposalType !== "extend_route"
    ) return null;

    return suggestExtendedRouteName(routeChangePlacement.points);
  }, [routeChangePlacement]);

  useEffect(() => {
    if (!isRouteChange || routeNameEdited) return;
    setName(routeNameSuggestion ?? "");
  }, [isRouteChange, routeNameEdited, routeNameSuggestion]);

  // Existing route inspection (used while creating a new route)
  const inspectPoint = inspectKey ? existingByKey.get(inspectKey) : undefined;
  const inspectRoutes = useMemo(
    () => inspectKey
      ? existingRoutes.filter((route) =>
          String(route.transportTypeId) === vehicleTypeId &&
          route.keys.includes(inspectKey)
        )
      : [],
    [existingRoutes, inspectKey, vehicleTypeId]
  );

  const previewLines = useMemo<ContributionMapLine[]>(
    () => inspectRoutes.map((route) => ({
      id: route.id,
      color: safeColor(
        types.find((type) => type.id === route.transportTypeId)?.color
      ),
      positions: route.keys.flatMap((key): Coordinates[] => {
        const point = existingByKey.get(key);
        return point ? [[point.latitude, point.longitude]] : [];
      }),
    })),
    [inspectRoutes, existingByKey, types]
  );

  // Complete sequence shown below the map
  const routeSequenceEntries = useMemo<RouteSequenceEntry[]>(() => {
    if (isRouteChange) {
      if (routeChangePlacement?.status === "ready") {
        let stopNumber = 0;

        return routeChangePlacement.points.map((item): RouteSequenceEntry => {
          if (item.source === "base") {
            const point = item.point;
            if (point.kind === "stop") stopNumber += 1;

            return {
              key: item.key,
              kind: point.kind,
              name: point.name,
              stopNumber: point.kind === "stop" ? stopNumber : null,
              typeLabel: existingPointTypeLabel(point),
              existing: true,
              editable: false,
              draftIndex: null,
              canMove: false,
              canRemove: false,
              canUpload: false,
              photoPreviewUrl: null,
              photoFileName: null,
              positionPending: false,
            };
          }

          const point = item.point;
          const isExisting = point.existingId !== null;
          const draftIndex = routePoints.findIndex((draft) => draft.key === point.key);
          if (point.kind === "stop") stopNumber += 1;

          return {
            key: point.key,
            kind: point.kind,
            name: point.name,
            stopNumber: point.kind === "stop" ? stopNumber : null,
            typeLabel: routePointTypeLabel(point),
            existing: isExisting,
            editable: !isExisting,
            draftIndex: draftIndex >= 0 ? draftIndex : null,
            canMove: false,
            canRemove: true,
            canUpload: !isExisting && point.kind === "stop",
            photoPreviewUrl: isExisting ? null : point.photo?.previewUrl ?? null,
            photoFileName: isExisting ? null : point.photo?.file.name ?? null,
            positionPending: false,
          };
        });
      }

      let stopNumber = 0;
      const entries: RouteSequenceEntry[] = routeChangeBasePoints.map((point) => {
        if (point.kind === "stop") stopNumber += 1;
        return {
          key: pointKey(point.kind, point.id),
          kind: point.kind,
          name: point.name,
          stopNumber: point.kind === "stop" ? stopNumber : null,
          typeLabel: existingPointTypeLabel(point),
          existing: true,
          editable: false,
          draftIndex: null,
          canMove: false,
          canRemove: false,
          canUpload: false,
          photoPreviewUrl: null,
          photoFileName: null,
          positionPending: false,
        };
      });

      for (const point of routePoints) {
        const isExisting = point.existingId !== null;
        const draftIndex = routePoints.findIndex((draft) => draft.key === point.key);
        entries.push({
          key: point.key,
          kind: point.kind,
          name: point.name,
          stopNumber: null,
          typeLabel: routePointTypeLabel(point),
          existing: isExisting,
          editable: !isExisting,
          draftIndex: draftIndex >= 0 ? draftIndex : null,
          canMove: false,
          canRemove: true,
          canUpload: !isExisting && point.kind === "stop",
          photoPreviewUrl: isExisting ? null : point.photo?.previewUrl ?? null,
          photoFileName: isExisting ? null : point.photo?.file.name ?? null,
          positionPending: true,
        });
      }

      return entries;
    }

    return routePoints.map((point, index): RouteSequenceEntry => ({
      key: point.key,
      kind: point.kind,
      name: point.name,
      stopNumber: getPointStopNumber(routePoints, index),
      typeLabel: routePointTypeLabel(point),
      existing: point.existingId !== null,
      editable: point.existingId === null,
      draftIndex: index,
      canMove: true,
      canRemove: true,
      canUpload: point.existingId === null && point.kind === "stop",
      photoPreviewUrl: point.existingId === null ? point.photo?.previewUrl ?? null : null,
      photoFileName: point.existingId === null ? point.photo?.file.name ?? null : null,
      positionPending: false,
    }));
  }, [isRouteChange, routeChangePlacement, routeChangeBasePoints, routePoints]);

  const routeMarkers = useMemo<ContributionMapMarker[]>(
    () => routeSequenceEntries.map((entry) => {
      const point = entry.draftIndex !== null
        ? routePoints[entry.draftIndex]
        : existingByKey.get(entry.key);

      return {
        key: entry.key,
        kind: entry.kind,
        name: entry.name,
        latitude: point?.latitude ?? 0,
        longitude: point?.longitude ?? 0,
        stopNumber: entry.stopNumber,
        draftIndex: entry.draftIndex,
        draggable: entry.draftIndex !== null && !entry.existing,
      };
    }),
    [routeSequenceEntries, routePoints, existingByKey]
  );

  const routeLinePositions = useMemo<Coordinates[]>(() => {
    if (isRouteChange && routeChangePlacement?.status === "ready") {
      return getCoordinates(routeChangePlacement.points);
    }
    if (isRouteChange) return getCoordinates(routeChangeBasePoints);
    if (formAction === "route") return getCoordinates(routePoints);
    return [];
  }, [isRouteChange, routeChangePlacement, routeChangeBasePoints, formAction, routePoints]);

  const mapCandidates = formAction === "route" ? candidates : [];
  const mapConnectedKeys = formAction === "route" ? connectedKeys : new Set<string>();
  const mapPreviewLines = formAction === "route" ? previewLines : [];

  // Location and map interaction
  const locate = useCallback((pinOnSuccess = false) => {
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

        if (pinOnSuccess && !autoPinned.current) {
          autoPinned.current = true;
          setPin(next);
          setSelectedPointKey("terminal-pin");
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

  const revokePointPhotos = (points: RoutePoint[]) => {
    points.forEach((point) => {
      if (point.photo) URL.revokeObjectURL(point.photo.previewUrl);
    });
  };

  const clearDraft = (nextAction: FormAction) => {
    revokePointPhotos(routePoints);
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    catalogRequestId.current += 1;

    setFormAction(nextAction);
    setName("");
    setDescription("");
    setRouteNameEdited(false);
    setPin(null);
    setRoutePoints([]);
    setPhotos([]);
    setVehicleTypeId("");
    setVariantId("");
    setSelectedExistingRouteId("");
    setExistingPoints([]);
    setExistingRoutes([]);
    setCatalogLoading(false);
    setExistingError("");
    setExistingQuery("");
    setInspectKey(null);
    setSelectedPointKey(null);
    setSelectedPreviewRouteId(null);
    setCurrentPosition(null);
    setFocus(null);
    setLocationMessage("");
    setShowValidation(false);
    setFormError("");
    autoPinned.current = false;
  };

  const resetForm = () => clearDraft("terminal");

  const switchFormAction = (action: FormAction) => {
    if (submitting || action === formAction) return;
    clearDraft(action);
  };

  const openModal = () => {
    resetForm();
    setShowModal(true);
    locate(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setShowModal(false);
    resetForm();
  };

  const handleVehicleTypeChange = (value: string) => {
    setVehicleTypeId(value);
    setVariantId("");
    setSelectedExistingRouteId("");
    setName("");
    setRouteNameEdited(false);
    setExistingQuery("");
    setInspectKey(null);
    setSelectedPointKey(null);
    setSelectedPreviewRouteId(null);
    revokePointPhotos(routePoints);
    setRoutePoints([]);

    if (!value) {
      catalogRequestId.current += 1;
      setExistingPoints([]);
      setExistingRoutes([]);
      setExistingError("");
      setCatalogLoading(false);
      return;
    }

    if (formAction === "terminal") {
      catalogRequestId.current += 1;
      setExistingPoints([]);
      setExistingRoutes([]);
      setCatalogLoading(false);
      return;
    }

    void loadCatalogForVehicle(Number(value));
  };

  const handleExistingRouteChange = (value: string) => {
    revokePointPhotos(routePoints);
    setSelectedExistingRouteId(value);
    setRoutePoints([]);
    setName("");
    setRouteNameEdited(false);
    setExistingQuery("");
    setInspectKey(null);
    setSelectedPointKey(null);
    setFormError("");
    setShowValidation(false);
    setSelectedPreviewRouteId(null);

    if (!value) {
      setVariantId("");
      setFocus(null);
      return;
    }

    const route = existingRoutes.find((item) => String(item.id) === value);
    if (!route) {
      setVariantId("");
      setFocus(null);
      setFormError(
        "The selected route is no longer available. Reload the vehicle catalog and try again."
      );
      return;
    }

    setVariantId(String(route.variantId));
    const firstPoint = existingByKey.get(route.keys[0] ?? "");
    if (firstPoint) {
      setFocus([firstPoint.latitude, firstPoint.longitude]);
    } else {
      setFocus(null);
      setFormError("The selected route's starting location could not be loaded.");
    }
  };

  const handleMapPick = (position: Coordinates) => {
    if (formAction === "terminal") {
      setPin(position);
      setSelectedPointKey("terminal-pin");
      setFormError("");
      return;
    }

    if (!vehicleTypeId || (formAction === "route" && !variantId)) {
      setFormError("Choose a vehicle type and variant before adding route locations.");
      return;
    }

    if (isRouteChange) {
      if (!selectedExistingRoute) {
        setFormError("Select an approved route before adding locations.");
        return;
      }
      if (catalogLoading || routeChangeBasePoints.length !== selectedExistingRoute.keys.length) {
        setFormError("Wait for the complete approved route to load before adding a stop.");
        return;
      }
      if (routeChangeBasePoints.length + routePoints.length >= MAX_PROPOSED_ROUTE_POINTS) {
        setFormError("The proposed route cannot contain more than 100 locations.");
        return;
      }
    } else if (routePoints.length >= MAX_ROUTE_POINTS) {
      setFormError("A new route cannot contain more than 60 locations.");
      return;
    }

    const pointKind: PointKind = isRail || isRouteChange
      ? "stop"
      : routePoints.length === 0
        ? "terminal"
        : "stop";

    const point: RoutePoint = {
      key: crypto.randomUUID(),
      kind: pointKind,
      existingId: null,
      name: "",
      description: "",
      stopType: isRail ? "train_station" : "road_stop",
      latitude: position[0],
      longitude: position[1],
      photo: null,
    };

    setRoutePoints((previous) => [...previous, point]);
    setSelectedPointKey(point.key);
    setFormError("");
  };

  // Add approved points to a new route. All selection state is derived
  // before calling setters, avoiding side effects inside a state updater.
  const addExistingKeys = (keys: string[]) => {
    const next = [...routePoints];
    const used = new Set(
      next.flatMap((point) => point.existingId === null
        ? []
        : [pointKey(point.kind, point.existingId)])
    );
    let lastAdded: ExistingPoint | null = null;

    for (const key of keys) {
      const point = existingByKey.get(key);
      if (!point || used.has(key)) continue;

      if (next.length >= MAX_ROUTE_POINTS) {
        setFormError("A new route cannot contain more than 60 locations.");
        break;
      }

      const valid = isRail
        ? point.kind === "stop" && point.stopType === "train_station"
        : next.length === 0
          ? point.kind === "terminal"
          : point.kind === "stop" && point.stopType === "road_stop";

      if (!valid) continue;

      next.push(toRoutePoint(point));
      used.add(key);
      lastAdded = point;
    }

    if (next.length !== routePoints.length) setRoutePoints(next);

    if (lastAdded) {
      setFocus([lastAdded.latitude, lastAdded.longitude]);
      setSelectedPointKey(pointKey(lastAdded.kind, lastAdded.id));
    }
  };

  const addExistingPoint = (point: ExistingPoint) => {
    const key = pointKey(point.kind, point.id);
    addExistingKeys([key]);
    setInspectKey(key);
    setSelectedPreviewRouteId(null);
  };

  const addRouteChangeExistingPoint = (point: ExistingPoint) => {
    if (!selectedExistingRoute) {
      setFormError("Select an approved route first.");
      return;
    }
    if (point.kind !== "stop") {
      setFormError("Only existing stops can be added through this workflow. Terminal relocation is handled separately.");
      return;
    }

    const key = pointKey(point.kind, point.id);
    if (routeChangeBaseKeys.has(key)) {
      setFormError("This stop is already part of the selected route.");
      return;
    }
    if (usedKeys.has(key)) {
      setFormError("This stop has already been added to your proposal.");
      return;
    }
    if (point.transportTypeId !== selectedExistingRoute.transportTypeId) {
      setFormError("This stop is not compatible with the selected route's vehicle type.");
      return;
    }
    if (selectedExistingRouteVariant?.fare_model === "matrix" && point.stopType !== "train_station") {
      setFormError("This route can only use train stations.");
      return;
    }
    if (selectedExistingRouteVariant?.fare_model === "distance" && point.stopType !== "road_stop") {
      setFormError("This route can only use road stops.");
      return;
    }
    if (routeChangeBasePoints.length + routePoints.length >= MAX_PROPOSED_ROUTE_POINTS) {
      setFormError("The proposed route cannot contain more than 100 locations.");
      return;
    }

    const routePoint = toRoutePoint(point);
    setRoutePoints((previous) => [...previous, routePoint]);
    setSelectedPointKey(routePoint.key);
    setFocus([point.latitude, point.longitude]);
    setFormError("");
  };

  const updateRoutePoint = (key: string, updates: Partial<RoutePoint>) => {
    setRoutePoints((previous) => previous.map((point) =>
      point.key === key ? { ...point, ...updates } : point
    ));
  };

  const moveRoutePoint = (index: number, direction: -1 | 1) => {
    if (isRouteChange) return;
    setRoutePoints((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeRoutePoint = (key: string) => {
    const target = routePoints.find((point) => point.key === key);
    if (target?.photo) URL.revokeObjectURL(target.photo.previewUrl);
    if (selectedPointKey === key) setSelectedPointKey(null);
    setRoutePoints((previous) => previous.filter((point) => point.key !== key));
  };

  const addTerminalPhotos = (files: File[]) => {
    const accepted: PhotoItem[] = [];
    for (const file of files) {
      const problem = validateImage(file);
      if (problem) {
        setFormError(problem);
        continue;
      }
      accepted.push({ file, previewUrl: URL.createObjectURL(file) });
    }

    const room = Math.max(0, MAX_PHOTOS - photos.length);
    accepted.slice(room).forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    if (room > 0) setPhotos((previous) => [...previous, ...accepted.slice(0, room)]);
  };

  const removeTerminalPhoto = (index: number) => {
    const target = photos[index];
    if (target) URL.revokeObjectURL(target.previewUrl);
    setPhotos((previous) => previous.filter((_, photoIndex) => photoIndex !== index));
  };

  const addPointPhoto = (key: string, file: File) => {
    const problem = validateImage(file);
    if (problem) {
      setFormError(problem);
      return;
    }
    if (!routePoints.some((point) => point.key === key)) return;

    const previous = routePoints.find((point) => point.key === key)?.photo;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    updateRoutePoint(key, {
      photo: { file, previewUrl: URL.createObjectURL(file) },
    });
  };

  const removePointPhoto = (key: string) => {
    const previous = routePoints.find((point) => point.key === key)?.photo;
    if (previous) URL.revokeObjectURL(previous.previewUrl);
    updateRoutePoint(key, { photo: null });
  };

  // Validation
  const validateNormalContribution = (): string | null => {
    if (!vehicleTypeId) return "Choose the type of vehicle.";
    if (!name.trim()) {
      return kind === "route" ? "Give the route a name." : "Give this terminal a name.";
    }

    if (kind === "terminal") return pin ? null : "Tap the map to place the terminal pin.";
    if (!variantId) return "Choose the vehicle variant.";
    if (routePoints.length < 2) return "Add at least two route locations.";
    if (routePoints.some((point) => point.existingId === null && !point.name.trim())) {
      return "Every new route location needs a name.";
    }
    if (isRail && routePoints.some((point) =>
      point.kind !== "stop" || point.stopType !== "train_station"
    )) {
      return "Rail routes can only use train stations.";
    }
    if (!isRail) {
      if (routePoints[0]?.kind !== "terminal") {
        return "A distance-based route must begin with a terminal.";
      }
      if (routePoints.slice(1).some((point) =>
        point.kind !== "stop" || point.stopType !== "road_stop"
      )) {
        return "After its starting terminal, a distance-based route must contain road stops.";
      }
    }
    return null;
  };

  const validateRouteChangeProposal = (): string | null => {
    if (!vehicleTypeId) return "Choose the vehicle type first.";
    if (!selectedExistingRoute) return "Choose an approved route to modify.";
    if (routeChangeBasePoints.length !== selectedExistingRoute.keys.length) {
      return "The selected route could not be loaded completely. Reload the vehicle catalog and try again.";
    }
    if (!selectedExistingRouteVariant) return "The selected route's variant is unavailable.";
    if (routePoints.length < 1) return "Add at least one location to the proposal.";
    if (routeChangeBasePoints.length + routePoints.length > MAX_PROPOSED_ROUTE_POINTS) {
      return "A proposed route cannot contain more than 100 locations.";
    }
    if (routePoints.some((point) => point.existingId === null && !point.name.trim())) {
      return "Every new stop needs a name.";
    }
    if (routeChangePlacement?.status !== "ready") {
      return routeChangePlacement?.message ?? "The automatic route position could not be determined.";
    }
    if (name.trim().length > 180) return "The proposed route name cannot exceed 180 characters.";

    const seen = new Set<string>();
    for (const point of routePoints) {
      if (point.kind !== "stop") {
        return "Route modifications can add stops only. Use the terminal relocation workflow when it becomes available.";
      }
      if (point.existingId === null) {
        if (selectedExistingRouteVariant.fare_model === "matrix" && point.stopType !== "train_station") {
          return "This route can only use new train stations.";
        }
        if (selectedExistingRouteVariant.fare_model === "distance" && point.stopType !== "road_stop") {
          return "This route can only use new road stops.";
        }
        continue;
      }

      const key = pointKey(point.kind, point.existingId);
      if (routeChangeBaseKeys.has(key)) return "A stop already in the route cannot be added again.";
      if (seen.has(key)) return "The same existing stop cannot be added more than once.";
      seen.add(key);

      const existing = existingByKey.get(key);
      if (!existing) return "One of the selected stops is unavailable. Remove it and select another.";
      if (existing.transportTypeId !== selectedExistingRoute.transportTypeId) {
        return "An existing stop is incompatible with the selected route.";
      }
      if (selectedExistingRouteVariant.fare_model === "matrix" && existing.stopType !== "train_station") {
        return "This route can only use train stations.";
      }
      if (selectedExistingRouteVariant.fare_model === "distance" && existing.stopType !== "road_stop") {
        return "This route can only use road stops.";
      }
    }
    return null;
  };

  const validate = () => isRouteChange
    ? validateRouteChangeProposal()
    : validateNormalContribution();

  // Submission payloads
  const buildInput = (): ContributionInput | null => {
    if (kind === "terminal") {
      if (!pin) return null;
      return {
        kind: "terminal",
        transportTypeId: Number(vehicleTypeId),
        name: name.trim(),
        description: description.trim(),
        stopType: "road_stop",
        latitude: pin[0],
        longitude: pin[1],
      };
    }

    const points: PointInput[] = routePoints.map((point) => ({
      kind: point.kind,
      existingId: point.existingId,
      name: point.name.trim(),
      description: point.existingId !== null ? "" : point.description.trim(),
      stopType: point.stopType,
      latitude: point.latitude,
      longitude: point.longitude,
    }));

    return {
      kind: "route",
      name: name.trim(),
      variantId: Number(variantId),
      points,
    };
  };

  const buildRouteChangePoint = (point: RoutePoint): RouteChangePointInput => {
    if (point.existingId !== null) {
      return { kind: point.kind, existingId: point.existingId };
    }
    if (point.kind === "terminal") {
      return {
        kind: "terminal",
        existingId: null,
        name: point.name.trim(),
        latitude: point.latitude,
        longitude: point.longitude,
      };
    }
    return {
      kind: "stop",
      existingId: null,
      name: point.name.trim(),
      description: point.description.trim(),
      stopType: point.stopType,
      latitude: point.latitude,
      longitude: point.longitude,
    };
  };

  const buildRouteChangeInput = (): RouteChangeProposalInput | null => {
    if (!selectedExistingRoute || routeChangePlacement?.status !== "ready") return null;

    const points: RouteChangePointInput[] = routeChangePlacement.points.map((item) => {
      if (item.source === "base") {
        return { kind: item.point.kind, existingId: item.point.id };
      }
      return buildRouteChangePoint(item.point);
    });

    return {
      routeId: selectedExistingRoute.id,
      proposalType: routeChangePlacement.proposalType,
      proposedName:
        routeChangePlacement.proposalType === "extend_route" && name.trim()
          ? name.trim()
          : undefined,
      points,
    };
  };

  const uploadRoutePointImages = async (
    resultPoints: { kind: PointKind; id: number }[],
    files: (File | null)[]
  ) => {
    let failures = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const saved = resultPoints[index];
      if (!file || !saved) continue;
      if (await attachMapImage(saved.kind, saved.id, file)) failures += 1;
    }
    return failures;
  };

  const uploadRouteProposalImages = async (
    resultPoints: { kind: PointKind; id: number; isNewPoint: boolean }[],
    placementPoints: (AutomaticBasePoint | AutomaticAdditionPoint)[]
  ) => {
    let failures = 0;
    for (let index = 0; index < placementPoints.length; index += 1) {
      const item = placementPoints[index];
      const saved = resultPoints[index];
      if (!item || item.source !== "addition" || !saved) continue;

      const point = item.point;
      if (point.existingId !== null || !point.photo || !saved.isNewPoint) continue;
      if (await attachMapImage(saved.kind, saved.id, point.photo.file)) failures += 1;
    }
    return failures;
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setShowValidation(true);
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    setFormError("");
    setSubmitting(true);

    try {
      if (isRouteChange) {
        const placement = routeChangePlacement;
        if (!placement || placement.status !== "ready") {
          throw new Error("The automatic route sequence is not ready.");
        }
        const proposalInput = buildRouteChangeInput();
        if (!proposalInput) {
          throw new Error("Unable to construct the proposed route sequence.");
        }

        const result = await submitRouteChangeProposal(proposalInput);
        const photoFailures = await uploadRouteProposalImages(
          result.points,
          placement.points as (AutomaticBasePoint | AutomaticAdditionPoint)[]
        );

        setShowModal(false);
        resetForm();
        void loadMine();
        setNotice(
          photoFailures > 0
            ? `Route-change proposal #${result.proposalId} submitted, but ${photoFailures} photo(s) could not be uploaded.`
            : `Route-change proposal #${result.proposalId} submitted for admin review. The approved route remains unchanged until approval.`
        );
        return;
      }

      const input = buildInput();
      if (!input) {
        throw new Error("Unable to construct the contribution. Check the selected location.");
      }

      const pointFiles = routePoints.map((point) => point.photo?.file ?? null);
      const terminalFiles = photos.map((photo) => photo.file);
      const result = await submitContribution(input);
      let photoFailures = 0;

      if (input.kind === "route") {
        photoFailures += await uploadRoutePointImages(result.points, pointFiles);
      } else if (result.points[0]) {
        for (const file of terminalFiles) {
          if (await attachMapImage("terminal", result.points[0].id, file)) {
            photoFailures += 1;
          }
        }
      }

      setShowModal(false);
      resetForm();
      void loadMine();

      const autoApproved = result.moderationStatus === "approved";
      setNotice(
        photoFailures > 0
          ? autoApproved
            ? `Submitted and approved, but ${photoFailures} photo(s) could not be uploaded.`
            : `Submitted for admin review, but ${photoFailures} photo(s) could not be uploaded.`
          : autoApproved
            ? "Submitted and approved. It can now appear on the map."
            : "Submitted! An admin will review it before it appears on the map."
      );
    } catch (error: unknown) {
      setFormError(error instanceof Error ? error.message : "Unable to submit. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Navigation and display data
  const handleNavigation = (label: string) => {
    if (label === "Recents") {
      window.location.href = "/home";
    } else if (label === "Saved") {
      window.location.href = "/saved";
    } else if (label === "Community") {
      window.location.href = "/community";
    }
  };

  const terminalPhotoPreviews: PhotoPreview[] = photos.map((photo) => ({
    previewUrl: photo.previewUrl,
    fileName: photo.file.name,
  }));

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#f7f7f7]">
      <MapSidebar
        logo={
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        }
        logoTitle="Home"
        onLogoClick={() => { window.location.href = "/home"; }}
        items={navItems}
        onItemClick={handleNavigation}
      />

      <MapHeader>
        <div className="flex w-[calc(100vw-330px)] min-h-[80px] items-start justify-between gap-6">
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="text-[26px] font-semibold tracking-[-0.4px] text-gray-900">
              Your Contributions
            </h1>
            <p className="mt-1 max-w-[620px] text-[14px] text-gray-500">
              Add terminals and routes, or propose changes to an existing approved route.
            </p>
          </div>

          <div className="relative flex h-[55px] shrink-0 items-center gap-[20px]">
            <button
              type="button"
              onClick={() => setNotice("Notifications are not available here yet.")}
              title="Notifications"
              className="group flex h-[45px] w-[45px] items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
            >
              <Bell size={20} strokeWidth={2} className="transition-transform duration-200 group-hover:rotate-6" />
            </button>

            <button
              type="button"
              onClick={() => setShowProfileMenu((previous) => !previous)}
              title="Profile"
              className="group flex h-[45px] w-[45px] items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-200 hover:scale-105 hover:bg-gray-100 hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]"
            >
              <AccountAvatar
                key={currentUserId}
                account={profileAccount}
                className="h-full w-full"
                iconSize={21}
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
        </div>
      </MapHeader>

      <section className="absolute inset-0 z-0 ml-[220px] overflow-y-auto pt-[10px] sm:ml-[230px] md:ml-[170px] lg:ml-[250px]">
        <div className="mx-auto w-full max-w-[900px] px-8 pb-12 pt-[105px]">
          <button
            type="button"
            onClick={openModal}
            className="group mt-7 flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-[0_4px_12px_rgba(0,0,0,0.14)]"
          >
            <div className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[#12395A] text-white transition-transform duration-200 group-hover:scale-105">
              <Plus size={21} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-gray-900">Add a contribution</p>
              <p className="mt-0.5 text-[13px] text-gray-500">
                Add a terminal, create a new route, or propose changes to an existing route.
              </p>
            </div>
          </button>

          <ContributionHistory
            contributions={mine}
            loading={mineLoading}
            error={mineError}
          />
        </div>
      </section>

      {showModal && (
        <ContributionFormModal
          state={{
            formAction,
            submitting,
            showValidation,
            formError,
            vehicleTypeId,
            variantId,
            selectedExistingRouteId,
            name,
            description,
            existingQuery,
            selectedPointKey,
            selectedPreviewRouteId,
            pin,
            currentPosition,
            focus,
            locationMessage,
            routePointCount: routePoints.length,
            terminalPhotos: terminalPhotoPreviews,
          }}
          data={{
            types,
            typeVariants,
            existingByKey,
            existingRoutes,
            catalogLoading,
            existingError,
            optionsError,
            selectedExistingRoute,
            selectedExistingRouteType,
            selectedExistingRouteVariant,
            selectedVehicleTypeName,
            activeRouteColor,
            routeMarkers,
            candidatePoints: mapCandidates,
            connectedKeys: mapConnectedKeys,
            linePositions: routeLinePositions,
            previewLines: mapPreviewLines,
            routeSequenceEntries,
            routeChangePlacement,
            connectedList,
            otherTerminals,
            otherStops,
            lastExistingPoint: lastExisting,
            matchingRouteChangeCandidates,
            inspectKey,
            inspectPoint,
            inspectRoutes,
          }}
          actions={{
            onClose: closeModal,
            onSwitchAction: switchFormAction,
            onVehicleTypeChange: handleVehicleTypeChange,
            onVariantChange: setVariantId,
            onExistingRouteChange: handleExistingRouteChange,
            onLocate: () => locate(),
            onMapPick: handleMapPick,
            onPickExisting: isRouteChange ? addRouteChangeExistingPoint : addExistingPoint,
            onAddExistingPoint: addExistingPoint,
            onAddRouteChangeExistingPoint: addRouteChangeExistingPoint,
            onAddExistingKeys: addExistingKeys,
            onSelectPoint: setSelectedPointKey,
            onMovePin: setPin,
            onMoveRoutePoint: (index, position) => {
              const point = routePoints[index];
              if (!point) return;
              updateRoutePoint(point.key, {
                latitude: position[0],
                longitude: position[1],
              });
            },
            onNameChange: setName,
            onProposedRouteNameChange: (value) => {
              setName(value);
              setRouteNameEdited(true);
            },
            onDescriptionChange: setDescription,
            onExistingQueryChange: setExistingQuery,
            onSelectPreviewRoute: setSelectedPreviewRouteId,
            onCloseInspection: () => {
              setInspectKey(null);
              setSelectedPreviewRouteId(null);
            },
            onRoutePointNameChange: (key, value) => updateRoutePoint(key, { name: value }),
            onMoveRoutePointInSequence: moveRoutePoint,
            onRemoveRoutePoint: removeRoutePoint,
            onPointPhotoFile: addPointPhoto,
            onRemovePointPhoto: removePointPhoto,
            onTerminalPhotosChange: addTerminalPhotos,
            onRemoveTerminalPhoto: removeTerminalPhoto,
            onSubmit: () => { void handleSubmit(); },
          }}
        />
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
