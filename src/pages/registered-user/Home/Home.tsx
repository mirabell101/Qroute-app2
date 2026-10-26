
import { useEffect, useState } from "react";

import {
  Bell,
  Bus,
  Car,
  Home as HomeIcon,
  MapPin,
  MessageSquare,
  TrainFront,
  UserCircle,
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
import { getRouteStops } from "@/lib/routes";
import type { RouteStop } from "@/lib/routes";
import { supabase } from "@/lib/supabase";

// Configure Leaflet's default marker images.
delete (L.Icon.Default.prototype as any)._getIconUrl;

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

interface RouteOption {
  id: number;
  name: string;
}

type Coordinates = [number, number];

interface OSRMResponse {
  code: string;
  message?: string;
  routes?: {
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }[];
}

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
    <Marker position={position}>
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
      paddingTopLeft: [280, 140],
      paddingBottomRight: [50, 80],
      maxZoom: 16,
      duration: 0.8,
    });
  }, [map, positions]);

  return null;
}

export default function Home({
  currentUserId,
  onLogout,
}: HomeProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const [currentPosition, setCurrentPosition] =
    useState<Coordinates | null>(null);

  const [locationStatus, setLocationStatus] =
    useState<LocationStatus>("loading");

  const [locationError, setLocationError] =
    useState<string | null>(null);

  const [showLocationPopup, setShowLocationPopup] = useState(true);

  // Terminal data.
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [terminalsLoading, setTerminalsLoading] = useState(true);

  // Route selection and route stops.
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [routesLoading, setRoutesLoading] = useState(true);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [selectedRouteStops, setSelectedRouteStops] =
    useState<RouteStop[]>([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // Road-following geometry returned by OSRM.
  const [routePositions, setRoutePositions] =
    useState<Coordinates[]>([]);
  const [roadRouteLoading, setRoadRouteLoading] = useState(false);

  // Watch the device's current location.
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      setLocationError(
        "Your browser does not support location access."
      );
      return;
    }

    let bestAccuracy = Number.POSITIVE_INFINITY;
    let hasReceivedPosition = false;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;

        if (hasReceivedPosition && accuracy >= bestAccuracy) {
          return;
        }

        hasReceivedPosition = true;
        bestAccuracy = accuracy;

        setCurrentPosition([
          position.coords.latitude,
          position.coords.longitude,
        ]);

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
      navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(popupTimer);
    };
  }, []);

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

  // Load active routes for the selector.
  useEffect(() => {
    let active = true;

    async function loadRoutes() {
      setRoutesLoading(true);

      try {
        const { data, error } = await supabase
          .from("routes")
          .select("id, name")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (error) throw new Error(error.message);

        if (active) {
          setRoutes(data ?? []);
        }
      } catch (error: unknown) {
        if (active) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load routes."
          );
        }
      } finally {
        if (active) setRoutesLoading(false);
      }
    }

    void loadRoutes();

    return () => {
      active = false;
    };
  }, []);

  // Load the ordered stops whenever the selected route changes.
  useEffect(() => {
    let active = true;

    async function loadSelectedRoute() {
      setSelectedRouteStops([]);
      setRoutePositions([]);
      setRouteError(null);
      setRouteStopsLoading(false);
      setRoadRouteLoading(false);

      if (!selectedRouteId) return;

      setRouteStopsLoading(true);

      try {
        const stops = await getRouteStops(Number(selectedRouteId));

        if (active) {
          setSelectedRouteStops(stops);
        }
      } catch (error: unknown) {
        if (active) {
          setRouteError(
            error instanceof Error
              ? error.message
              : "Unable to load this route's stops."
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
  }, [selectedRouteId]);

  // Ask OSRM for a road-following route through the saved stops.
  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadRoadRoute() {
      setRoutePositions([]);

      if (!selectedRouteId || selectedRouteStops.length < 2) {
        setRoadRouteLoading(false);
        return;
      }

      setRoadRouteLoading(true);

      try {
        // OSRM expects longitude,latitude for every waypoint.
        const waypoints = selectedRouteStops
          .map((stop) => {
            const { latitude, longitude } = stop.terminals;
            return `${longitude},${latitude}`;
          })
          .join(";");

        const url =
          `https://router.project-osrm.org/route/v1/driving/${waypoints}` +
          "?overview=full&geometries=geojson&steps=false";

        const response = await fetch(url, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `Routing service returned HTTP ${response.status}.`
          );
        }

        const result: OSRMResponse = await response.json();

        if (result.code !== "Ok" || !result.routes?.length) {
          throw new Error(
            result.message || "No road route could be found."
          );
        }

        // GeoJSON coordinates are [longitude, latitude].
        // Leaflet coordinates are [latitude, longitude].
        const positions: Coordinates[] =
          result.routes[0].geometry.coordinates.map(
            ([longitude, latitude]) => [latitude, longitude]
          );

        if (active) {
          setRoutePositions(positions);
        }
      } catch (error: unknown) {
        if (!active || controller.signal.aborted) return;

        setRouteError(
          error instanceof Error
            ? error.message
            : "Unable to calculate the road route."
        );
      } finally {
        if (active) setRoadRouteLoading(false);
      }
    }

    void loadRoadRoute();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedRouteId, selectedRouteStops]);

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

          {/* All saved terminal markers */}
          {terminals.map((terminal) => (
            <Marker
              key={terminal.id}
              position={[terminal.latitude, terminal.longitude]}
            >
              <Popup>
                <strong>{terminal.name}</strong>
                <br />
                <span>Saved QRoute terminal</span>
              </Popup>
            </Marker>
          ))}

          {/* Road-following route geometry */}
          {routePositions.length >= 2 && (
            <>
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: "#2563eb",
                  weight: 7,
                  opacity: 0.25,
                }}
              />
              <Polyline
                positions={routePositions}
                pathOptions={{
                  color: "#2563eb",
                  weight: 4,
                  opacity: 0.95,
                }}
              />
              <RouteViewport positions={routePositions} />
            </>
          )}

          {/* Selected route stop markers and labels */}
          {selectedRouteStops.map((stop) => (
            <Marker
              key={`${stop.route_id}-${stop.stop_order}`}
              position={[
                stop.terminals.latitude,
                stop.terminals.longitude,
              ]}
            >
              <Popup>
                <strong>{stop.terminals.name}</strong>
                <br />
                <span>Stop {stop.stop_order}</span>
              </Popup>
            </Marker>
          ))}
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
            placeholder="Search your location here...."
            className="
              h-full w-full rounded-full border border-gray-300
              bg-white pl-12 pr-5 text-[16px]
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              outline-none placeholder:text-gray-500
              focus-visible:ring-1 focus-visible:ring-gray-300
            "
            onChange={(event) => {
              // Connect location search later.
              void event.target.value;
            }}
          />
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

      {/* ROUTE SELECTOR */}
      <div className="absolute left-[270px] top-[110px] z-[1500] w-[280px] rounded-xl bg-white p-4 shadow-lg sm:left-[280px] md:left-[290px] lg:left-[300px]">
        <label
          htmlFor="route-selector"
          className="mb-2 block text-sm font-semibold text-gray-800"
        >
          Select a saved route
        </label>

        <select
          id="route-selector"
          value={selectedRouteId}
          onChange={(event) => setSelectedRouteId(event.target.value)}
          disabled={routesLoading}
          className="w-full rounded-lg border border-gray-300 bg-white p-2 text-sm text-gray-800 outline-none focus:border-blue-500 disabled:opacity-60"
        >
          <option value="">
            {routesLoading ? "Loading routes..." : "Choose a route"}
          </option>

          {routes.map((route) => (
            <option key={route.id} value={route.id}>
              {route.name}
            </option>
          ))}
        </select>

        {routesLoading && (
          <p className="mt-2 text-sm text-gray-500">
            Loading saved routes...
          </p>
        )}

        {routeStopsLoading && (
          <p role="status" className="mt-2 text-sm text-gray-500">
            Loading route stops...
          </p>
        )}

        {roadRouteLoading && (
          <p role="status" className="mt-2 text-sm text-gray-500">
            Finding roads between stops...
          </p>
        )}

        {routeError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {routeError}
          </p>
        )}

        {!routesLoading && !routeError && routes.length === 0 && (
          <p className="mt-2 text-sm text-gray-500">
            No active routes found.
          </p>
        )}

        {selectedRouteId &&
          !routeStopsLoading &&
          !roadRouteLoading &&
          !routeError && (
            <p className="mt-2 text-xs text-gray-500">
              {selectedRouteStops.length} stops loaded
              {routePositions.length >= 2
                ? " · Road route ready"
                : selectedRouteStops.length < 2
                  ? " · At least two stops are needed"
                  : ""}
            </p>
          )}

        {selectedRouteId &&
          !roadRouteLoading &&
          routePositions.length >= 2 && (
            <button
              type="button"
              onClick={() => setSelectedRouteId("")}
              className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Clear selected route
            </button>
          )}
      </div>

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
