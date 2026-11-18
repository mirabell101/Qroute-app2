
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  Car,
  Home,
  MapPin,
  MessageSquare,
  Settings,
} from "lucide-react";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
import AccountAvatar from "@/components/account/AccountAvatar";
import { useAccountProfile } from "@/components/account/accountProfileStore";
import { getAdminNavigationDestination } from "@/pages/admin/adminNavigation";

import {
  TransitMapCanvas,
  TransitMapPanel,
  TransitMapSearch,
  TransitMapStatus,
  useTransitMap,
} from "@/components/transit-map";

import MapSidebar from "@/components/map-layout/MapSidebar";
import MapHeader from "@/components/map-layout/MapHeader";
import VehicleFilterBar from "@/components/map-layout/VehicleFilterBar";

interface BaseProps {
  currentUserId: string;
  onLogout: () => Promise<void>;
}

// ==================================================
// NAVIGATION
// ==================================================

const navItems = [
  { label: "Recents", icon: Home },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
  { label: "Profile", icon: Settings },
];

// ==================================================
// ADMIN LANDING
// ==================================================

export default function Base({
  currentUserId,
  onLogout,
}: BaseProps) {
  const navigate = useNavigate();

  const { account, userId: profileUserId } = useAccountProfile();

  const profileAccount =
    profileUserId === currentUserId ? account : null;

  const map = useTransitMap();

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const navigateTo = (label: string) => {
    const destination = getAdminNavigationDestination(label);

    if (destination) {
      navigate(destination);
    }
  };

  const refreshPage = () => {
    window.location.reload();
  };

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await onLogout();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
      setLoggingOut(false);
    }
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
        onItemClick={navigateTo}
        footer={
          <button
            type="button"
            onClick={() => navigate("/admin/dashboard")}
            className="
              group flex h-[40px] w-[160px] mx-auto
              items-center justify-center gap-2 rounded-xl
              bg-[#d9dee3] font-semibold text-[#0f2a47]
              transition-all duration-200
              hover:-translate-y-0.5 hover:bg-white
            "
          >
            <Settings
              size={16}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:rotate-45"
            />

            <span className="text-[13px]">
              Manage Site
            </span>
          </button>
        }
      />

      {/* SHARED HEADER */}
      <MapHeader>
        {/* SEARCH */}
        <TransitMapSearch map={map} />

        {/* VEHICLE FILTERS: DISABLED FOR ADMIN */}
        <VehicleFilterBar disabled />

        {/* ADMIN NOTIFICATION + PROFILE */}
        <div className="relative ml-[300px] flex h-[55px] items-center gap-[20px]">
          <AdminNotificationBell adminUserId={currentUserId} />

          {/* PROFILE AVATAR */}
          <button
            type="button"
            onClick={() =>
              setShowProfileMenu((previous) => !previous)
            }
            title="Profile"
            aria-label="Open account menu"
            aria-expanded={showProfileMenu}
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              overflow-hidden rounded-full bg-white
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <AccountAvatar
              key={currentUserId}
              account={profileAccount}
              className="h-full w-full"
              iconSize={21}
            />
          </button>

          {/* PROFILE DROPDOWN */}
          {showProfileMenu && (
            <div
              className="
                absolute right-0 top-[58px] z-[4000]
                w-[150px] rounded-xl bg-white p-2
                shadow-[0_4px_15px_rgba(0,0,0,0.18)]
              "
            >
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  navigateTo("Profile");
                }}
                className="
                  w-full rounded-lg px-3 py-2 text-left
                  text-[13px] font-medium text-gray-700
                  transition-colors hover:bg-gray-100
                "
              >
                Account
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  window.location.href = "/points-badges";
                }}
                className="
                  mt-1 flex w-full items-center gap-2
                  rounded-lg px-3 py-2 text-left
                  text-[13px] font-medium text-gray-700
                  transition-colors hover:bg-gray-100
                "
              >
                Badges
              </button>

              <button
                type="button"
                disabled={loggingOut}
                onClick={() => void handleLogout()}
                className="
                  mt-1 w-full rounded-lg px-3 py-2 text-left
                  text-[13px] font-medium text-gray-700
                  transition-colors hover:bg-gray-100
                  disabled:cursor-not-allowed disabled:opacity-50
                "
              >
                {loggingOut ? "Logging out..." : "Log Out"}
              </button>
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
          sm:left-[240px] md:left-[250px] lg:left-[300px]
        "
      />
    </main>
  );
}
