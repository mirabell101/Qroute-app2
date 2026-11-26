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
  attachRouteChangeProposalImage,
  submitRouteChangeProposalWithEdits,
} from "@/lib/routeChangeProposals";

import {
  getMyContributions,
  getTransitCatalog,
  getTransportOptions,
  pointKey,
  submitContribution,
} from "@/lib/contributions";

import type {
  ContributionInput,
  ExistingPoint,
  ExistingRoute,
  MyContribution,
  PointInput,
  PointKind,
  RouteChangePointInput,
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

interface RouteChangePointEdit {
  name: string;
  photo: PhotoItem | null;
  latitude?: number;
  longitude?: number;
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
  /** Canonical order of the original route point replaced by this new point. */
  replacesPointKey?: string;
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
  const kind = formAction === "terminal" ? "terminal" : "route";
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
  // Draft-only edits for original points in the approved route.
  // These are stored with the proposal and never mutate shared rows while pending.
  const [routeChangeEdits, setRouteChangeEdits] = useState<Record<string, RouteChangePointEdit>>({});
  // A point-type change on an approved route is a route-specific replacement.
  // The original shared location remains intact for every other route.
  const [routeChangeRemovedKeys, setRouteChangeRemovedKeys] = useState<string[]>([]);
  const [routeChangeRemarks, setRouteChangeRemarks] = useState("");
  // When a contributor manually reorders or moves a marker, preserve the
  // visible sequence instead of letting coordinate-based placement reset it.
  const [routeChangeOrder, setRouteChangeOrder] = useState<string[] | null>(null);
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

      // A route may consist entirely of road stops. A catalog terminal may
      // be selected as the first point; the final point can be converted to
      // a terminal from the sequence editor.
      if (routePoints.length === 0 && point.kind === "terminal") return true;
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

  const selectedRouteFirstPoint = selectedExistingRoute
    ? existingByKey.get(selectedExistingRoute.keys[0] ?? "")
    : undefined;
  const selectedRouteLastPoint = selectedExistingRoute
    ? existingByKey.get(selectedExistingRoute.keys[selectedExistingRoute.keys.length - 1] ?? "")
    : undefined;

  // Keep the coordinate-based placement as the legacy/base sequence. The
  // submitted RPC still receives this order so its existing route-snapshot
  // and insertion checks continue to work unchanged.
  const automaticRouteChangePlacement = useMemo(() => {
    if (
      !isRouteChange ||
      !selectedExistingRoute ||
      routeChangeBasePoints.length !== selectedExistingRoute.keys.length ||
      (routePoints.length === 0 && routeChangeRemovedKeys.length === 0)
    ) return null;

    const basePoints: AutomaticBasePoint[] = routeChangeBasePoints.map((point) => {
      const key = pointKey(point.kind, point.id);
      const edit = routeChangeEdits[key];
      return {
        key,
        name: edit?.name ?? point.name,
        latitude: edit?.latitude ?? point.latitude,
        longitude: edit?.longitude ?? point.longitude,
        source: "base",
        kind: point.kind,
        existingId: point.id,
        point,
      };
    });

    if (routePoints.length === 0) {
      return {
        status: "ready" as const,
        proposalType: "remove_points" as const,
        points: basePoints,
        placements: [],
      };
    }

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
  }, [
    isRouteChange,
    selectedExistingRoute,
    routeChangeBasePoints,
    routePoints,
    routeChangeEdits,
    routeChangeRemovedKeys,
  ]);

  // Apply the contributor's manual order over the automatic placement. Newly
  // added points retain their calculated relative insertion when possible.
  const routeChangePlacement = useMemo(() => {
    const placement = automaticRouteChangePlacement;
    if (!placement || placement.status !== "ready") return placement;

    const removedKeys = new Set(routeChangeRemovedKeys);
    const activePoints = placement.points.filter((point) => !removedKeys.has(point.key));
    if (activePoints.length < 2) {
      return {
        status: "error" as const,
        reason: "invalid_route" as const,
        message: "A route must retain at least two locations after the requested removals.",
      };
    }
    if (!routeChangeOrder?.length) {
      return { ...placement, points: activePoints };
    }

    const byKey = new Map(activePoints.map((point) => [point.key, point] as const));
    const ordered = routeChangeOrder.flatMap((key) => {
      const point = byKey.get(key);
      return point ? [point] : [];
    });
    const seen = new Set(ordered.map((point) => point.key));

    for (let index = 0; index < activePoints.length; index += 1) {
      const point = activePoints[index];
      if (!point || seen.has(point.key)) continue;

      const nextKnownKey = activePoints
        .slice(index + 1)
        .find((candidate) => seen.has(candidate.key))?.key;

      if (nextKnownKey) {
        const insertAt = ordered.findIndex((candidate) => candidate.key === nextKnownKey);
        ordered.splice(insertAt < 0 ? ordered.length : insertAt, 0, point);
      } else {
        const previousKnownKey = activePoints
          .slice(0, index)
          .reverse()
          .find((candidate) => seen.has(candidate.key))?.key;
        const previousIndex = previousKnownKey
          ? ordered.findIndex((candidate) => candidate.key === previousKnownKey)
          : -1;
        ordered.splice(previousIndex < 0 ? ordered.length : previousIndex + 1, 0, point);
      }
      seen.add(point.key);
    }

    return { ...placement, points: ordered };
  }, [automaticRouteChangePlacement, routeChangeOrder, routeChangeRemovedKeys]);

  const newRouteNameSuggestion = useMemo(() => {
    if (formAction !== "route" || routePoints.length < 2) return null;

    const effectivePoints = routePoints.map((point) => ({
      key: point.key,
      latitude: point.latitude,
      longitude: point.longitude,
      name: point.existingId === null
        ? point.name
        : existingByKey.get(pointKey(point.kind, point.existingId))?.name ?? point.name,
    }));

    return suggestExtendedRouteName(effectivePoints);
  }, [formAction, routePoints, existingByKey]);

  const routeNameSuggestion = useMemo(() => {
    if (
      routeChangePlacement?.status !== "ready" ||
      !routeChangePlacement.placements.some((placement) => placement.placement === "extend")
    ) return null;

    const effectivePoints = routeChangePlacement.points.map((item) => ({
      ...item,
      name: item.source === "base"
        ? routeChangeEdits[item.key]?.name ?? item.name
        : item.name,
    }));

    return suggestExtendedRouteName(effectivePoints);
  }, [routeChangePlacement, routeChangeEdits]);

  useEffect(() => {
    if (routeNameEdited) return;
    if (formAction === "route") {
      setName(newRouteNameSuggestion ?? "");
      return;
    }
    if (isRouteChange) {
      setName(routeNameSuggestion ?? "");
    }
  }, [
    formAction,
    isRouteChange,
    routeNameEdited,
    newRouteNameSuggestion,
    routeNameSuggestion,
  ]);

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

  // Complete sequence shown below the map. Every point in a route-change
  // proposal is editable, including original shared points and reused points.
  const routeSequenceEntries = useMemo<RouteSequenceEntry[]>(() => {
    if (isRouteChange) {
      if (routeChangePlacement?.status === "ready") {
        let stopNumber = 0;

        const activeEntryCount = routeChangePlacement.points.length;
        const activeEntries = routeChangePlacement.points.map((item, index): RouteSequenceEntry => {
          if (item.source === "base") {
            const point = item.point;
            const edit = routeChangeEdits[item.key];
            if (point.kind === "stop") stopNumber += 1;

            return {
              key: item.key,
              kind: point.kind,
              name: edit?.name ?? point.name,
              stopNumber: point.kind === "stop" ? stopNumber : null,
              typeLabel: existingPointTypeLabel(point),
              existing: true,
              editable: true,
              draftIndex: index,
              canMove: point.kind === "stop",
              canConvertToStop:
                point.kind === "terminal" &&
                selectedExistingRouteVariant?.fare_model === "distance",
              canConvertToTerminal:
                point.kind === "stop" &&
                point.stopType === "road_stop" &&
                selectedExistingRouteVariant?.fare_model === "distance",
              canRemove: activeEntryCount > 2,
              canRestore: false,
              pendingRemoval: false,
              canUpload: true,
              photoPreviewUrl: edit?.photo?.previewUrl ?? null,
              photoFileName: edit?.photo?.file.name ?? null,
              positionPending: false,
            };
          }

          const point = item.point;
          const isExisting = point.existingId !== null;
          if (point.kind === "stop") stopNumber += 1;

          return {
            key: point.key,
            kind: point.kind,
            name: point.name,
            stopNumber: point.kind === "stop" ? stopNumber : null,
            typeLabel: routePointTypeLabel(point),
            existing: isExisting,
            editable: true,
            draftIndex: index,
            canMove: point.kind === "stop",
            canConvertToStop:
              point.kind === "terminal" &&
              selectedExistingRouteVariant?.fare_model === "distance",
            canConvertToTerminal:
              point.kind === "stop" &&
              point.stopType === "road_stop" &&
              selectedExistingRouteVariant?.fare_model === "distance",
            canRemove: activeEntryCount > 2,
            canRestore: false,
            pendingRemoval: false,
            canUpload: true,
            photoPreviewUrl: point.photo?.previewUrl ?? null,
            photoFileName: point.photo?.file.name ?? null,
            positionPending: false,
          };
        });
        const replacedOriginalKeys = new Set(
          routePoints.flatMap((point) => point.replacesPointKey ? [point.replacesPointKey] : [])
        );
        const pendingRemovalEntries = routeChangeBasePoints.flatMap((point): RouteSequenceEntry[] => {
          const key = pointKey(point.kind, point.id);
          if (!routeChangeRemovedKeys.includes(key) || replacedOriginalKeys.has(key)) return [];
          const edit = routeChangeEdits[key];
          return [{
            key,
            kind: point.kind,
            name: edit?.name ?? point.name,
            stopNumber: null,
            typeLabel: existingPointTypeLabel(point),
            existing: true,
            editable: false,
            draftIndex: null,
            canMove: false,
            canConvertToStop: false,
            canConvertToTerminal: false,
            canRemove: false,
            canRestore: true,
            pendingRemoval: true,
            canUpload: false,
            photoPreviewUrl: edit?.photo?.previewUrl ?? null,
            photoFileName: edit?.photo?.file.name ?? null,
            positionPending: false,
          }];
        });
        return [...activeEntries, ...pendingRemovalEntries];
      }

      const baseByKey = new Map(routeChangeBasePoints.map((point) => [
        pointKey(point.kind, point.id),
        point,
      ] as const));
      const removedKeys = new Set(routeChangeRemovedKeys);
      const fallbackBasePoints = routeChangeOrder?.length
        ? [
            ...routeChangeOrder.flatMap((key) => {
              const point = baseByKey.get(key);
              return point && !removedKeys.has(key) ? [point] : [];
            }),
            ...routeChangeBasePoints.filter((point) => {
              const key = pointKey(point.kind, point.id);
              return !removedKeys.has(key) && !routeChangeOrder.includes(key);
            }),
          ]
        : routeChangeBasePoints.filter((point) =>
            !removedKeys.has(pointKey(point.kind, point.id))
          );
      let stopNumber = 0;
      const entries: RouteSequenceEntry[] = fallbackBasePoints.map((point, index) => {
        const key = pointKey(point.kind, point.id);
        const edit = routeChangeEdits[key];
        if (point.kind === "stop") stopNumber += 1;
        return {
          key,
          kind: point.kind,
          name: edit?.name ?? point.name,
          stopNumber: point.kind === "stop" ? stopNumber : null,
          typeLabel: existingPointTypeLabel(point),
          existing: true,
          editable: true,
          draftIndex: index,
          canMove: point.kind === "stop",
          canConvertToStop:
            point.kind === "terminal" &&
            selectedExistingRouteVariant?.fare_model === "distance",
          canConvertToTerminal:
            point.kind === "stop" &&
            point.stopType === "road_stop" &&
            selectedExistingRouteVariant?.fare_model === "distance",
          canRemove: fallbackBasePoints.length + routePoints.length > 2,
          canRestore: false,
          pendingRemoval: false,
          canUpload: true,
          photoPreviewUrl: edit?.photo?.previewUrl ?? null,
          photoFileName: edit?.photo?.file.name ?? null,
          positionPending: false,
        };
      });

      for (const point of routePoints) {
        const isExisting = point.existingId !== null;
        const draftIndex = entries.length;
        entries.push({
          key: point.key,
          kind: point.kind,
          name: point.name,
          stopNumber: null,
          typeLabel: routePointTypeLabel(point),
          existing: isExisting,
          editable: true,
          draftIndex: draftIndex >= 0 ? draftIndex : null,
          canMove: point.kind === "stop",
          canConvertToStop:
            point.kind === "terminal" &&
            selectedExistingRouteVariant?.fare_model === "distance",
          canConvertToTerminal:
            point.kind === "stop" &&
            point.stopType === "road_stop" &&
            selectedExistingRouteVariant?.fare_model === "distance",
          canRemove: fallbackBasePoints.length + routePoints.length > 2,
          canRestore: false,
          pendingRemoval: false,
          canUpload: true,
          photoPreviewUrl: point.photo?.previewUrl ?? null,
          photoFileName: point.photo?.file.name ?? null,
          positionPending: true,
        });
      }

      const replacedOriginalKeys = new Set(
        routePoints.flatMap((point) => point.replacesPointKey ? [point.replacesPointKey] : [])
      );
      const pendingRemovalEntries = routeChangeBasePoints.flatMap((point): RouteSequenceEntry[] => {
        const key = pointKey(point.kind, point.id);
        if (!routeChangeRemovedKeys.includes(key) || replacedOriginalKeys.has(key)) return [];
        const edit = routeChangeEdits[key];
        return [{
          key,
          kind: point.kind,
          name: edit?.name ?? point.name,
          stopNumber: null,
          typeLabel: existingPointTypeLabel(point),
          existing: true,
          editable: false,
          draftIndex: null,
          canMove: false,
          canConvertToStop: false,
          canConvertToTerminal: false,
          canRemove: false,
          canRestore: true,
          pendingRemoval: true,
          canUpload: false,
          photoPreviewUrl: edit?.photo?.previewUrl ?? null,
          photoFileName: edit?.photo?.file.name ?? null,
          positionPending: false,
        }];
      });
      return [...entries, ...pendingRemovalEntries];
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
      canMove: point.kind === "stop",
      canConvertToStop:
        point.kind === "terminal" &&
        (index === 0 || index === routePoints.length - 1) &&
        selectedVariant?.fare_model === "distance",
      canConvertToTerminal:
        point.kind === "stop" &&
        point.stopType === "road_stop" &&
        (index === 0 || index === routePoints.length - 1) &&
        selectedVariant?.fare_model === "distance",
      canRemove: true,
      canRestore: false,
      pendingRemoval: false,
      canUpload: point.existingId === null && point.kind === "stop",
      photoPreviewUrl: point.existingId === null ? point.photo?.previewUrl ?? null : null,
      photoFileName: point.existingId === null ? point.photo?.file.name ?? null : null,
      positionPending: false,
    }));
  }, [
    isRouteChange,
    routeChangePlacement,
    routeChangeBasePoints,
    routePoints,
    routeChangeEdits,
    routeChangeOrder,
    routeChangeRemovedKeys,
    selectedExistingRouteVariant,
  ]);

  const routeMarkers = useMemo<ContributionMapMarker[]>(
    () => routeSequenceEntries.filter((entry) => !entry.pendingRemoval).map((entry) => {
      const draftPoint = isRouteChange
        ? routePoints.find((point) => point.key === entry.key)
        : entry.draftIndex !== null
          ? routePoints[entry.draftIndex]
          : undefined;
      const existingPoint = existingByKey.get(entry.key);
      const edit = routeChangeEdits[entry.key];
      const latitude = draftPoint?.latitude ?? edit?.latitude ?? existingPoint?.latitude ?? 0;
      const longitude = draftPoint?.longitude ?? edit?.longitude ?? existingPoint?.longitude ?? 0;

      return {
        key: entry.key,
        kind: entry.kind,
        name: entry.name,
        latitude,
        longitude,
        stopNumber: entry.stopNumber,
        // In route-change mode this index represents the complete proposed
        // sequence (not only the additions array), so original markers can move.
        draftIndex: entry.draftIndex,
        draggable: isRouteChange
          ? true
          : entry.draftIndex !== null && !entry.existing,
        isNewPoint: draftPoint !== undefined && draftPoint.existingId === null,
      };
    }),
    [isRouteChange, routeSequenceEntries, routePoints, existingByKey, routeChangeEdits]
  );

  const routeLinePositions = useMemo<Coordinates[]>(() => {
    if (isRouteChange) {
      return routeSequenceEntries.filter((entry) => !entry.pendingRemoval).flatMap((entry): Coordinates[] => {
        const draftPoint = routePoints.find((point) => point.key === entry.key);
        const existingPoint = existingByKey.get(entry.key);
        const edit = routeChangeEdits[entry.key];
        const latitude = draftPoint?.latitude ?? edit?.latitude ?? existingPoint?.latitude;
        const longitude = draftPoint?.longitude ?? edit?.longitude ?? existingPoint?.longitude;
        return latitude === undefined || longitude === undefined
          ? []
          : [[latitude, longitude]];
      });
    }
    if (formAction === "route") return getCoordinates(routePoints);
    return [];
  }, [
    isRouteChange,
    routeSequenceEntries,
    routePoints,
    existingByKey,
    routeChangeEdits,
    formAction,
  ]);

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

  const revokeRouteChangeEditPhotos = (edits: Record<string, RouteChangePointEdit>) => {
    Object.values(edits).forEach((edit) => {
      if (edit.photo) URL.revokeObjectURL(edit.photo.previewUrl);
    });
  };

  const clearDraft = (nextAction: FormAction) => {
    revokePointPhotos(routePoints);
    revokeRouteChangeEditPhotos(routeChangeEdits);
    photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    catalogRequestId.current += 1;

    setFormAction(nextAction);
    setName("");
    setDescription("");
    setRouteNameEdited(false);
    setPin(null);
    setRoutePoints([]);
    setRouteChangeEdits({});
    setRouteChangeRemovedKeys([]);
    setRouteChangeRemarks("");
    setRouteChangeOrder(null);
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
    revokeRouteChangeEditPhotos(routeChangeEdits);
    setRoutePoints([]);
    setRouteChangeEdits({});
    setRouteChangeRemovedKeys([]);
    setRouteChangeRemarks("");
    setRouteChangeOrder(null);

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
    revokeRouteChangeEditPhotos(routeChangeEdits);
    setRouteChangeEdits({});
    setRouteChangeRemovedKeys([]);
    setRouteChangeRemarks("");
    setRouteChangeOrder(null);
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

    const pointKind: PointKind = "stop";

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

    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const key = keys[keyIndex];
      if (!key) continue;
      const point = existingByKey.get(key);
      if (!point || used.has(key)) continue;

      if (next.length >= MAX_ROUTE_POINTS) {
        setFormError("A new route cannot contain more than 60 locations.");
        break;
      }

      // Distance-based routes may begin and/or end with a terminal, but a
      // terminal must never be inserted between road stops. Stops remain
      // valid even when the route has no terminal at either endpoint.
      const terminalIsEndpoint = point.kind === "terminal" &&
        (next.length === 0 || keyIndex === keys.length - 1);
      const valid = isRail
        ? point.kind === "stop" && point.stopType === "train_station"
        : point.kind === "terminal"
          ? terminalIsEndpoint
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

  const updateRoutePoint = (key: string, updates: Partial<RoutePoint>) => {
    setRoutePoints((previous) => previous.map((point) =>
      point.key === key ? { ...point, ...updates } : point
    ));
  };

  const moveRoutePoint = (index: number, direction: -1 | 1) => {
    if (isRouteChange) {
      const currentEntries = routeSequenceEntries;
      const target = index + direction;
      const moving = currentEntries[index];
      const neighbor = currentEntries[target];
      // In Modify route, road stops can be reordered; terminal entries keep their current sequence position.
      if (
        !moving || !neighbor ||
        moving.kind !== "stop" || neighbor.kind !== "stop"
      ) return;

      const nextOrder = currentEntries.map((entry) => entry.key);
      [nextOrder[index], nextOrder[target]] = [nextOrder[target], nextOrder[index]];
      setRouteChangeOrder(nextOrder);
      setSelectedPointKey(moving.key);
      return;
    }

    setRoutePoints((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const moveRoutePointTo = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;

    if (isRouteChange) {
      const currentEntries = routeSequenceEntries;
      const moving = currentEntries[fromIndex];
      const target = currentEntries[toIndex];
      // In Modify route, reordering is limited to road stops; terminal entries keep their current sequence position.
      if (
        !moving || !target ||
        moving.kind !== "stop" || target.kind !== "stop"
      ) return;

      const nextOrder = currentEntries.map((entry) => entry.key);
      const [movedKey] = nextOrder.splice(fromIndex, 1);
      if (!movedKey) return;
      nextOrder.splice(toIndex, 0, movedKey);
      setRouteChangeOrder(nextOrder);
      setSelectedPointKey(moving.key);
      return;
    }

    if (
      fromIndex >= routePoints.length ||
      toIndex >= routePoints.length
    ) return;

    const movedPoint = routePoints[fromIndex];
    if (!movedPoint) return;

    setRoutePoints((previous) => {
      if (
        fromIndex >= previous.length ||
        toIndex >= previous.length ||
        fromIndex === toIndex
      ) return previous;

      const next = [...previous];
      const [moved] = next.splice(fromIndex, 1);
      if (!moved) return previous;
      next.splice(toIndex, 0, moved);
      return next;
    });
    setSelectedPointKey(movedPoint.key);
  };

  const moveRouteChangePointOnMap = (sequenceIndex: number, position: Coordinates) => {
    const entry = routeSequenceEntries[sequenceIndex];
    if (!entry) return;

    setRouteChangeOrder((current) =>
      current ?? routeSequenceEntries.map((item) => item.key)
    );

    const draftPoint = routePoints.find((point) => point.key === entry.key);
    if (draftPoint) {
      updateRoutePoint(entry.key, {
        latitude: position[0],
        longitude: position[1],
      });
      return;
    }

    const original = existingByKey.get(entry.key);
    if (!original) return;

    setRouteChangeEdits((current) => ({
      ...current,
      [entry.key]: {
        name: current[entry.key]?.name ?? original.name,
        photo: current[entry.key]?.photo ?? null,
        latitude: position[0],
        longitude: position[1],
      },
    }));
    setSelectedPointKey(entry.key);
    setFormError("");
  };

  const convertRoutePointKind = (key: string, targetKind: PointKind) => {
    const sequenceIndex = routeSequenceEntries.findIndex((entry) => entry.key === key);
    const sequenceEntry = routeSequenceEntries[sequenceIndex];
    if (!sequenceEntry) return;

    if (isRouteChange) {
      if (selectedExistingRouteVariant?.fare_model !== "distance") {
        setFormError("Only distance-based routes can use terminals. Rail routes must use stations.");
        return;
      }
      const draft = routePoints.find((point) => point.key === key);
      const originalForConversion = existingByKey.get(key);
      const sourceStopType = draft?.stopType ?? originalForConversion?.stopType;
      if (
        targetKind === "terminal" &&
        sequenceEntry.kind === "stop" &&
        sourceStopType !== "road_stop"
      ) {
        setFormError("Only a road stop on a distance-based route can be converted into a terminal.");
        return;
      }

      // Converting a replacement back to its original point type simply
      // restores the original shared point and preserves its pending edits.
      if (draft?.replacesPointKey) {
        const original = existingByKey.get(draft.replacesPointKey);
        if (original?.kind === targetKind) {
          const originalKey = draft.replacesPointKey;
          const originalPoint = existingByKey.get(originalKey);
          setRouteChangeRemovedKeys((previous) => previous.filter((item) => item !== originalKey));
          setRouteChangeOrder(routeSequenceEntries.map((entry) =>
            entry.key === key ? originalKey : entry.key
          ));
          setRouteChangeEdits((previous) => ({
            ...previous,
            [originalKey]: {
              name: draft.name || previous[originalKey]?.name || originalPoint?.name || "",
              latitude: draft.latitude,
              longitude: draft.longitude,
              photo: draft.photo ?? previous[originalKey]?.photo ?? null,
            },
          }));
          setRoutePoints((previous) => previous.filter((point) => point.key !== key));
          setSelectedPointKey(originalKey);
          setFormError("");
          return;
        }
        if (draft.kind === targetKind) return;
        updateRoutePoint(key, {
          kind: targetKind,
          existingId: null,
          stopType: "road_stop",
        });
        setSelectedPointKey(key);
        setFormError("");
        return;
      }

      // A newly placed or reused point that is not part of the original route
      // can be represented as a new pending point of the other kind.
      if (draft) {
        if (draft.kind === targetKind) return;
        updateRoutePoint(key, {
          kind: targetKind,
          existingId: null,
          stopType: "road_stop",
        });
        setSelectedPointKey(key);
        setFormError("");
        return;
      }

      const original = existingByKey.get(key);
      if (!original || !routeChangeBaseKeys.has(key)) {
        setFormError("The selected route location is no longer available.");
        return;
      }
      if (original.kind === targetKind) return;
      if (routeChangeBasePoints.length + routePoints.length >= MAX_PROPOSED_ROUTE_POINTS) {
        setFormError("The proposed route cannot contain more than 100 locations.");
        return;
      }

      const originalEdit = routeChangeEdits[key];
      const replacementKey = `replacement-${original.kind}-${original.id}-${crypto.randomUUID()}`;
      const replacement: RoutePoint = {
        key: replacementKey,
        kind: targetKind,
        existingId: null,
        name: originalEdit?.name ?? original.name,
        description: "",
        stopType: "road_stop",
        latitude: originalEdit?.latitude ?? original.latitude,
        longitude: originalEdit?.longitude ?? original.longitude,
        photo: originalEdit?.photo ?? null,
        replacesPointKey: key,
      };

      setRoutePoints((previous) => [...previous, replacement]);
      setRouteChangeRemovedKeys((previous) =>
        previous.includes(key) ? previous : [...previous, key]
      );
      setRouteChangeEdits((previous) => {
        if (!previous[key]) return previous;
        return { ...previous, [key]: { ...previous[key], photo: null } };
      });
      const nextOrder = routeSequenceEntries.map((entry) =>
        entry.key === key ? replacementKey : entry.key
      );
      setRouteChangeOrder(nextOrder);
      setSelectedPointKey(replacementKey);
      setFocus([replacement.latitude, replacement.longitude]);
      setFormError("");
      return;
    }

    if (formAction !== "route" || selectedVariant?.fare_model !== "distance") {
      setFormError("Only distance-based route endpoints can be converted to terminals or stops.");
      return;
    }

    const draft = routePoints.find((point) => point.key === key);
    if (targetKind === "terminal" && draft?.kind === "stop" && draft.stopType !== "road_stop") {
      setFormError("Only a road stop can be converted into a terminal.");
      return;
    }
    if (!draft) return;
    if (draft.kind === targetKind) return;
    updateRoutePoint(key, {
      kind: targetKind,
      existingId: null,
      stopType: "road_stop",
    });
    setSelectedPointKey(key);
    setFormError("");
  };

  const removeRoutePoint = (key: string) => {
    if (isRouteChange && routeChangeBaseKeys.has(key)) {
      const activeCount = routeSequenceEntries.filter((entry) => !entry.pendingRemoval).length;
      if (activeCount <= 2) {
        setFormError("A proposed route must retain at least two locations. You cannot remove another point.");
        return;
      }
      setRouteChangeRemovedKeys((previous) =>
        previous.includes(key) ? previous : [...previous, key]
      );
      if (selectedPointKey === key) setSelectedPointKey(null);
      setFormError("");
      return;
    }

    const target = routePoints.find((point) => point.key === key);
    const isRoutePointReplacement = isRouteChange && !!target?.replacesPointKey;

    // A converted point's photo is transferred back to the original shared
    // point when the contributor undoes the conversion.
    if (target?.photo && !isRoutePointReplacement) {
      URL.revokeObjectURL(target.photo.previewUrl);
    }
    if (selectedPointKey === key) setSelectedPointKey(null);

    if (isRoutePointReplacement && target?.replacesPointKey) {
      const originalKey = target.replacesPointKey;
      const originalPoint = existingByKey.get(originalKey);

      setRouteChangeRemovedKeys((previous) => previous.filter((item) => item !== originalKey));
      setRouteChangeOrder(routeSequenceEntries.map((entry) =>
        entry.key === key ? originalKey : entry.key
      ));
      setRouteChangeEdits((previous) => ({
        ...previous,
        [originalKey]: {
          name: target.name || previous[originalKey]?.name || originalPoint?.name || "",
          latitude: target.latitude,
          longitude: target.longitude,
          photo: target.photo ?? previous[originalKey]?.photo ?? null,
        },
      }));
    } else if (isRouteChange) {
      setRouteChangeOrder((previous) =>
        previous ? previous.filter((item) => item !== key) : null
      );
    }

    setRoutePoints((previous) => previous.filter((point) => point.key !== key));
  };

  const restoreRoutePoint = (key: string) => {
    if (!isRouteChange || !routeChangeBaseKeys.has(key)) return;
    setRouteChangeRemovedKeys((previous) => previous.filter((item) => item !== key));
    setSelectedPointKey(key);
    setFormError("");
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

    const routePoint = routePoints.find((point) => point.key === key);
    if (routePoint) {
      if (routePoint.photo) URL.revokeObjectURL(routePoint.photo.previewUrl);
      updateRoutePoint(key, {
        photo: { file, previewUrl: URL.createObjectURL(file) },
      });
      setFormError("");
      return;
    }

    // Original points are not in routePoints. Keep their proposed photo
    // separately until the proposal is submitted.
    const existing = isRouteChange ? existingByKey.get(key) : undefined;
    if (!existing || !routeChangeBaseKeys.has(key)) return;

    const previous = routeChangeEdits[key];
    if (previous?.photo) URL.revokeObjectURL(previous.photo.previewUrl);
    const photo = { file, previewUrl: URL.createObjectURL(file) };
    setRouteChangeEdits((current) => ({
      ...current,
      [key]: {
        name: current[key]?.name ?? existing.name,
        photo,
        latitude: current[key]?.latitude,
        longitude: current[key]?.longitude,
      },
    }));
    setFormError("");
  };

  const removePointPhoto = (key: string) => {
    const routePoint = routePoints.find((point) => point.key === key);
    if (routePoint) {
      if (routePoint.photo) URL.revokeObjectURL(routePoint.photo.previewUrl);
      updateRoutePoint(key, { photo: null });
      return;
    }

    const previous = routeChangeEdits[key];
    if (!previous?.photo) return;
    URL.revokeObjectURL(previous.photo.previewUrl);
    const original = existingByKey.get(key);
    if (!original) return;
    setRouteChangeEdits((current) => ({
      ...current,
      [key]: {
        name: current[key]?.name ?? original.name,
        photo: null,
        latitude: current[key]?.latitude,
        longitude: current[key]?.longitude,
      },
    }));
  };

  const handleRoutePointNameChange = (key: string, value: string) => {
    const routePoint = routePoints.find((point) => point.key === key);
    if (routePoint) {
      updateRoutePoint(key, { name: value });
      return;
    }

    if (!isRouteChange || !routeChangeBaseKeys.has(key)) return;
    const original = existingByKey.get(key);
    if (!original) return;

    setRouteChangeEdits((current) => ({
      ...current,
      [key]: {
        name: value,
        photo: current[key]?.photo ?? null,
        latitude: current[key]?.latitude,
        longitude: current[key]?.longitude,
      },
    }));
  };

  // Validation
  const validateNormalContribution = (): string | null => {
    if (!vehicleTypeId) return "Choose the type of vehicle.";

    if (kind === "terminal") {
      if (!name.trim()) return "Give this terminal a name.";
      if (!pin) return "Tap the map to place the terminal pin.";
      return null;
    }

    if (!name.trim()) return "Give the route a name.";
    if (!variantId) return "Choose the vehicle variant.";
    if (routePoints.length < 2) return "Add at least two route locations.";
    if (routePoints.some((point) => !point.name.trim())) {
      return "Every route location needs a name.";
    }

    if (isRail) {
      if (routePoints.some((point) =>
        point.kind !== "stop" || point.stopType !== "train_station"
      )) {
        return "Rail routes can only use train stations.";
      }
      return null;
    }

    if (routePoints.some((point) =>
      point.kind === "stop" && point.stopType !== "road_stop"
    )) {
      return "Distance-based routes can only use road locations.";
    }
    if (routePoints.slice(1, -1).some((point) => point.kind === "terminal")) {
      return "Terminals can only appear at the beginning or end of a route.";
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
    if (routePoints.length < 1 && routeChangeRemovedKeys.length < 1) {
      return "Add a new location, convert an existing location, or request removal of a route location.";
    }
    if (routeChangeBasePoints.length + routePoints.length > MAX_PROPOSED_ROUTE_POINTS) {
      return "A proposed route cannot contain more than 100 locations.";
    }
    if (routePoints.some((point) => !point.name.trim())) {
      return "Every new route location needs a name.";
    }
    if (routeChangeRemarks.trim().length > 1000) {
      return "Contributor remarks cannot exceed 1,000 characters.";
    }

    const replacementKeys = routePoints
      .map((point) => point.replacesPointKey)
      .filter((value): value is string => !!value);
    if (replacementKeys.some((key) => !routeChangeRemovedKeys.includes(key))) {
      return "Every converted original route location must be marked for removal before its replacement can be submitted.";
    }
    if (routeChangePlacement?.status !== "ready") {
      return routeChangePlacement?.message ?? "The automatic route position could not be determined.";
    }
    const unnamedPoint = routeChangePlacement.points.some((item) => {
      const pointName = item.source === "base"
        ? routeChangeEdits[item.key]?.name ?? item.point.name
        : item.point.name;
      return !pointName.trim();
    });
    if (unnamedPoint) return "Every terminal and stop in the proposed route needs a name.";
    if (name.trim().length > 180) return "The proposed route name cannot exceed 180 characters.";

    const seen = new Set<string>();
    for (const point of routePoints) {
      if (selectedExistingRouteVariant.fare_model === "matrix") {
        if (point.kind !== "stop" || point.stopType !== "train_station") {
          return "Rail route proposals can only contain train stations.";
        }
      } else if (point.kind === "stop" && point.stopType !== "road_stop") {
        return "This route can only use road stops.";
      }

      if (point.existingId === null) continue;
      const key = pointKey(point.kind, point.existingId);
      if (routeChangeBaseKeys.has(key)) return "A location already in the route cannot be added again.";
      if (seen.has(key)) return "The same existing location cannot be added more than once.";
      seen.add(key);

      const existing = existingByKey.get(key);
      if (!existing) return "One of the selected locations is unavailable. Remove it and select another.";
      if (existing.transportTypeId !== selectedExistingRoute.transportTypeId) {
        return "An existing location is incompatible with the selected route.";
      }
      if (selectedExistingRouteVariant.fare_model === "matrix" &&
          (existing.kind !== "stop" || existing.stopType !== "train_station")) {
        return "This rail route can only use train stations.";
      }
      if (selectedExistingRouteVariant.fare_model === "distance" &&
          existing.kind === "stop" && existing.stopType !== "road_stop") {
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

  const buildRouteChangeInput = () => {
    const canonical = automaticRouteChangePlacement;
    const proposed = routeChangePlacement;
    if (
      !selectedExistingRoute ||
      canonical?.status !== "ready" ||
      proposed?.status !== "ready"
    ) return null;

    // Keep the legacy proposal payload in its automatic/original-compatible
    // order. proposedStopOrder separately captures the contributor's final
    // manually arranged route sequence.
    const points: RouteChangePointInput[] = canonical.points.map((item) => {
      if (item.source === "base") {
        return { kind: item.point.kind, existingId: item.point.id };
      }
      return buildRouteChangePoint(item.point);
    });

    const proposedOrderByKey = new Map(
      proposed.points.map((item, index) => [item.key, index + 1] as const)
    );
    const finalPointCount = proposed.points.length;
    let removedOrderIndex = 0;

    const pointEdits = canonical.points.map((item, index) => {
      const isRemoved = item.source === "base" && routeChangeRemovedKeys.includes(item.key);
      const proposedStopOrder = isRemoved
        ? finalPointCount + (++removedOrderIndex)
        : proposedOrderByKey.get(item.key);

      if (!proposedStopOrder) {
        throw new Error("The proposed route sequence is incomplete.");
      }

      if (isRemoved) {
        return {
          stopOrder: index + 1,
          proposedStopOrder,
          removeFromRoute: true,
        };
      }

      if (item.source === "base") {
        const original = item.point;
        const edit = routeChangeEdits[item.key];
        const proposedName = (edit?.name ?? original.name).trim();
        const latitude = edit?.latitude ?? original.latitude;
        const longitude = edit?.longitude ?? original.longitude;
        const nameChanged = proposedName !== original.name;
        const coordinatesChanged =
          latitude !== original.latitude || longitude !== original.longitude;

        return {
          stopOrder: index + 1,
          proposedStopOrder,
          ...(nameChanged ? { proposedName } : {}),
          ...(coordinatesChanged ? { latitude, longitude } : {}),
        };
      }

      if (item.point.existingId === null) {
        const replacesStopOrder = item.point.replacesPointKey
          ? canonical.points.findIndex((candidate) => candidate.key === item.point.replacesPointKey) + 1
          : undefined;
        return {
          stopOrder: index + 1,
          proposedStopOrder,
          ...(replacesStopOrder && replacesStopOrder > 0 ? { replacesStopOrder } : {}),
        };
      }

      const original = existingByKey.get(pointKey(item.point.kind, item.point.existingId));
      const proposedName = item.point.name.trim();
      const nameChanged = !!original && proposedName !== original.name;
      const coordinatesChanged = !!original && (
        item.point.latitude !== original.latitude ||
        item.point.longitude !== original.longitude
      );

      return {
        stopOrder: index + 1,
        proposedStopOrder,
        ...(nameChanged ? { proposedName } : {}),
        ...(coordinatesChanged
          ? { latitude: item.point.latitude, longitude: item.point.longitude }
          : {}),
      };
    });

    return {
      routeId: selectedExistingRoute.id,
      proposalType: canonical.proposalType,
      proposedName:
        canonical.placements.some((placement) => placement.placement === "extend") && name.trim()
          ? name.trim()
          : undefined,
      points,
      pointEdits,
      contributorRemarks: routeChangeRemarks.trim(),
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
    proposalId: number,
    placementPoints: (AutomaticBasePoint | AutomaticAdditionPoint)[]
  ) => {
    let failures = 0;
    const canonicalPoints =
      automaticRouteChangePlacement?.status === "ready"
        ? automaticRouteChangePlacement.points
        : [];
    const canonicalOrderByKey = new Map(
      canonicalPoints.map((item, index) => [item.key, index + 1] as const)
    );

    for (const item of placementPoints) {
      // Photos attached to a point that is being removed are not uploaded or
      // approved as part of the removal request.
      if (item.source === "base" && routeChangeRemovedKeys.includes(item.key)) {
        continue;
      }

      const photo = item.source === "base"
        ? routeChangeEdits[item.key]?.photo ?? null
        : item.point.photo;
      if (!photo) continue;

      // Proposal image attachments use canonical stop_order, not the
      // contributor's manually reordered proposed_stop_order.
      const canonicalStopOrder = canonicalOrderByKey.get(item.key);
      if (!canonicalStopOrder) {
        failures += 1;
        continue;
      }

      const uploadError = await attachRouteChangeProposalImage(
        proposalId,
        canonicalStopOrder,
        photo.file
      );
      if (uploadError) failures += 1;
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

        const result = await submitRouteChangeProposalWithEdits(proposalInput);
        const photoFailures = await uploadRouteProposalImages(
          result.proposalId,
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
          if (await attachMapImage(result.points[0].kind, result.points[0].id, file)) {
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
              Add terminals and stops, create routes, or propose changes to an existing approved route.
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
            routeChangeRemarks,
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
            selectedRouteFirstPoint,
            selectedRouteLastPoint,
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
            onPickExisting: addExistingPoint,
            onAddExistingPoint: addExistingPoint,
            onAddExistingKeys: addExistingKeys,
            onSelectPoint: setSelectedPointKey,
            onMovePin: setPin,
            onMoveRoutePoint: (index, position) => {
              if (isRouteChange) {
                moveRouteChangePointOnMap(index, position);
                return;
              }

              const point = routePoints[index];
              if (!point) return;
              updateRoutePoint(point.key, {
                latitude: position[0],
                longitude: position[1],
              });
            },
            onNameChange: (value) => {
              setName(value);
              if (formAction === "route" || isRouteChange) {
                setRouteNameEdited(true);
              }
            },
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
            onRoutePointNameChange: handleRoutePointNameChange,
            onMoveRoutePointInSequence: moveRoutePoint,
            onMoveRoutePointTo: moveRoutePointTo,
            onConvertRoutePointKind: convertRoutePointKind,
            onRouteChangeRemarksChange: setRouteChangeRemarks,
            onRemoveRoutePoint: removeRoutePoint,
            onRestoreRoutePoint: restoreRoutePoint,
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
