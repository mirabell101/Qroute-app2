
import { useNavigate } from "react-router-dom";

import {
  Car,
  Home,
  MapPin,
  MessageSquare,
  Settings,
  UserCircle,
} from "lucide-react";

import qrouteWhiteLogo from "@/assets/White Qroute Logo.png";

import AdminNotificationBell from "@/components/admin/AdminNotificationBell";
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

// ==================================================
// NAVIGATION
// ==================================================

const navItems = [
  { label: "Recents", icon: Home },
  { label: "Saved", icon: MapPin },
  { label: "Your Contribution", icon: Car },
  { label: "Community", icon: MessageSquare },
  { label: "Profile", icon: UserCircle },
];

// ==================================================
// ADMIN LANDING
// ==================================================

export default function Base() {
  const navigate = useNavigate();
  const { userId } = useAccountProfile();

  const map = useTransitMap();

  const navigateTo = (label: string) => {
    const destination = getAdminNavigationDestination(label);

    if (destination) {
      navigate(destination);
    }
  };

  const refreshPage = () => {
    window.location.reload();
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
          <AdminNotificationBell adminUserId={userId ?? ""} />

          <button
            type="button"
            onClick={() => navigateTo("Profile")}
            title="Profile"
            className="
              group flex h-[45px] w-[45px] items-center justify-center
              rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:scale-105 hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <UserCircle
              size={21}
              strokeWidth={2}
              className="transition-transform duration-200 group-hover:scale-105"
            />
          </button>
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
