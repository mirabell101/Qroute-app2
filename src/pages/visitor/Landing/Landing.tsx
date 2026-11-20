
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  Bell,
  Car,
  Home,
  MapPin,
  MessageSquare,
} from "lucide-react";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import {
  TransitMapCanvas,
  TransitMapPanel,
  TransitMapSearch,
  TransitMapStatus,
  useTransitMap,
} from "@/components/transit-map";

import AccountAvatar from "@/components/account/AccountAvatar";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import { parseSavedMapSelection } from "@/lib/routeMap";
import { parseCommunityMapLocation } from "@/lib/communityMapLocation";

import MapSidebar from "@/components/map-layout/MapSidebar";
import MapHeader from "@/components/map-layout/MapHeader";
import VehicleFilterBar from "@/components/map-layout/VehicleFilterBar";

// ==================================================
// NAVIGATION
// ==================================================

const navItems = [
  { label: "Recents", icon: Home },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
];

// ==================================================
// LANDING
// ==================================================

interface LandingProps {
  currentUserId: string | null;
  onLogout: () => void;
}

export default function Landing({
  currentUserId,
  onLogout,
}: LandingProps) {
  const { account, userId: profileUserId } = useAccountProfile();

  const profileAccount =
    profileUserId === currentUserId ? account : null;

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const map = useTransitMap(currentUserId);
  const location = useLocation();
  const navigate = useNavigate();

  const handledSavedSelection = useRef<string | null>(null);

  const refreshPage = () => {
    window.location.reload();
  };

  const savedSelection = parseSavedMapSelection(location.state);

  const savedSelectionKey = savedSelection
    ? `${savedSelection.kind}:${savedSelection.targetId}`
    : null;

  useEffect(() => {
    if (
      !savedSelection ||
      !savedSelectionKey ||
      handledSavedSelection.current === savedSelectionKey ||
      map.routesLoading ||
      map.terminalsLoading
    ) {
      return;
    }

    handledSavedSelection.current = savedSelectionKey;

    map.handleSavedItemSelect(
      savedSelection.kind,
      savedSelection.targetId
    );

    navigate("/", { replace: true, state: null });
  }, [
    map,
    navigate,
    savedSelection,
    savedSelectionKey,
  ]);

  useEffect(() => {
    const pinnedLocation = parseCommunityMapLocation(location.state);
    if (!pinnedLocation) return;
    map.handleCommunityMapLocation(
      pinnedLocation.latitude,
      pinnedLocation.longitude,
      pinnedLocation.label,
    );
    navigate("/home", { replace: true, state: null });
  }, [location.state, map, navigate]);

  const handleClick = (name: string) => {
    if (name === "Recents") {
      navigate("/recents");
      return;
    }

    // Community is accessible to guests and logged-in users.
    if (name === "Community") {
      navigate("/community");
      return;
    }

    // These features require login for guests.
    if (
      !currentUserId &&
      (
        name === "Saved" ||
        name === "Your Contribution" ||
        name === "Notifications"
      )
    ) {
      setShowLoginPrompt(true);
      return;
    }

    console.log(`${name} clicked`, {
      currentUserId,
    });
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-white">
      {/* MAP */}
      <TransitMapCanvas map={map} />

      {/* LOCATION + TERMINAL STATUS */}
      <TransitMapStatus
        map={map}
        terminalStatusClassName="
          absolute bottom-5 left-[230px] z-[3000]
          max-w-sm rounded-xl bg-white px-4 py-3
          text-sm shadow-lg
          sm:left-[240px] md:left-[250px]
        "
      />

      {/* SHARED SIDEBAR */}
      <MapSidebar
        logo={
          <img
            src={qrouteWhiteLogo}
            alt="Qroute"
            className="max-h-full max-w-full object-contain"
          />
        }
        items={navItems}
        logoTitle="Refresh"
        onLogoClick={refreshPage}
        onItemClick={handleClick}
        footer={
          !currentUserId ? (
            <button
              type="button"
              onClick={() => {
                window.location.href = "/login";
              }}
              className="
                flex h-[40px] w-[160px] mx-auto
                items-center justify-center rounded-xl
                bg-[#d9dee3] font-semibold text-[#0f2a47]
                transition-all duration-200
                hover:-translate-y-0.5 hover:bg-white
              "
            >
              Sign In
            </button>
          ) : undefined
        }
      />

      {/* SHARED HEADER */}
      <MapHeader>
        {/* SEARCH */}
        <TransitMapSearch map={map} />

        {/* VEHICLE FILTERS */}
        <VehicleFilterBar
          onSelect={(vehicle) => handleClick(vehicle)}
        />

        {/* NOTIFICATION + PROFILE */}
        <div className="relative ml-[300px] flex h-[55px] items-center gap-[20px]">
          {/* NOTIFICATION */}
          <button
            type="button"
            onClick={() => handleClick("Notifications")}
            title="Notifications"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-6"
            />
          </button>

          {/* PROFILE */}
          <button
            type="button"
            onClick={() => {
              setShowProfileMenu((previous) => !previous);
            }}
            title="Profile"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <AccountAvatar
              key={currentUserId ?? "anonymous"}
              account={profileAccount}
              className="h-full w-full transition-transform duration-200 group-hover:scale-105"
              iconSize={21}
            />
          </button>

          {showProfileMenu && (
            <div
              className="
                absolute right-0 top-[58px] z-[4000]
                w-[150px] rounded-xl bg-white p-2
                shadow-[0_4px_15px_rgba(0,0,0,0.18)]
              "
            >
              {!currentUserId ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    window.location.href = "/login";
                  }}
                  className="
                    w-full rounded-lg px-3 py-2 text-left
                    text-[13px] font-medium text-gray-700
                    transition-colors hover:bg-gray-100
                  "
                >
                  Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileMenu(false);
                    onLogout();
                  }}
                  className="
                    w-full rounded-lg px-3 py-2 text-left
                    text-[13px] font-medium text-gray-700
                    transition-colors hover:bg-gray-100
                  "
                >
                  Log Out
                </button>
              )}
            </div>
          )}
        </div>
      </MapHeader>

      {/* PLACE DETAILS + ACTIVE ROUTE + FARES */}
      <TransitMapPanel
        map={map}
        className="
          absolute left-[230px] top-[110px] z-[1500]
          max-h-[calc(100vh-130px)]
          w-[min(360px,calc(100vw-245px))]
          overflow-y-auto rounded-xl bg-white p-4
          shadow-lg
        "
      />

      {/* VISITOR SIGN-IN PROMPT */}
      {showLoginPrompt && (
        <div className="
          fixed inset-0 z-[5000] flex items-center
          justify-center bg-black/30
        ">
          <div className="
            w-[320px] rounded-xl bg-white p-6
            text-center shadow-[0_4px_20px_rgba(0,0,0,0.2)]
          ">
            <h2 className="text-[18px] font-semibold text-gray-900">
              Sign in to access this
            </h2>

            <p className="mt-2 text-[12px] leading-relaxed text-gray-600">
              Please log in or sign in to your QRoute account to access this
              feature.
            </p>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowLoginPrompt(false)}
                className="
                  h-9 flex-1 rounded-[6px] border border-gray-300
                  bg-white text-[11px] font-medium text-gray-700
                  hover:bg-gray-50
                "
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLoginPrompt(false);
                  window.location.href = "/login";
                }}
                className="
                  h-9 flex-1 rounded-[6px] bg-[#6355F5]
                  text-[11px] font-medium text-white
                  hover:bg-[#5547E8]
                "
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
