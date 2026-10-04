import { useState } from "react";
import {
  Bell,
  Bus,
  Car,
  Home,
  MapPin,
  MessageSquare,
  TrainFront,
  UserCircle,
} from "lucide-react";

import { MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { Input } from "@/components/ui/input";

// ==================================================
// LEAFLET MARKER FIX
// ==================================================

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// ==================================================
// MAP
// ==================================================

const defaultPosition: [number, number] = [14.7167, 121.05];

// ==================================================
// NAVIGATION
// ==================================================

const navItems = [
  {
    label: "Recents",
    icon: Home,
  },
  {
    label: "Saved",
    icon: MapPin,
  },
  {
    label: "Your Contribution",
    icon: Car,
  },
  {
    label: "Community",
    icon: MessageSquare,
  },
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
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const refreshPage = () => {
    window.location.reload();
  };


  const handleClick = (name: string) => {
  if (
    !currentUserId &&
    (name === "Saved" ||
      name === "Your Contribution" ||
      name === "Notifications")
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

      {/* ==================================================
          MAP
          ================================================== */}

      <section className="absolute inset-0 z-0 h-full w-full">

        <MapContainer
          center={defaultPosition}
          zoom={14}
          scrollWheelZoom={true}
          zoomControl={false}
          dragging={true}
          touchZoom={true}
          doubleClickZoom={true}
          boxZoom={true}
          keyboard={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={defaultPosition} />
        </MapContainer>

      </section>

      {/* ==================================================
          SIDEBAR
          ================================================== */}

      <aside
  className="
    absolute
    left-0
    top-0
    z-[2000]
    flex
    h-screen
    w-[220px]
    flex-col
    bg-[#12395A]
    text-white
    sm:w-[230px]
    md:w-[240px]
    lg:w-[250px]
  "
>

        {/* ==================================================
            LOGO
            ================================================== */}

        <button
          type="button"
          onClick={refreshPage}
          title="Refresh"
          className="
            absolute
            flex
            items-center
            justify-center
            rounded-lg
            transition-colors
            duration-200
            hover:bg-[#1b4b6f]
          "
          style={{
            top: "30px",
            width: "100%",
            height: "75px",
          }}
        >
          <span
  className="
    font-bold
    tracking-[-2px]
    text-white
    text-[36px]
    sm:text-[40px]
    lg:text-[44px]
  "
  style={{
    lineHeight: "1",
  }}
>
  Qroute
</span>
        </button>

        {/* ==================================================
            NAVIGATION
            ================================================== */}

        <nav
  className="
    absolute
    left-1/2
    top-[145px]
    flex
    w-[calc(100%-32px)]
    -translate-x-1/2
    flex-col
    gap-[10px]
    px-0
  "
>
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleClick(item.label)}
                className="
  group
  flex
  h-[46px]
  w-full
  items-center
  rounded-lg
  px-3
  text-left
  transition-all
  duration-200
  hover:bg-[#1b4b6f]
  hover:translate-x-1
"
              >
                <span
                  className="
                    flex
                    w-[28px]
                    shrink-0
                    items-center
                    justify-center
                  "
                >
                  <Icon
                    size={19}
                    strokeWidth={1.8}
                    className="
                      transition-transform
                      duration-200
                      group-hover:scale-110
                    "
                  />
                </span>

                <span
                  className="
                    ml-2
                    whitespace-nowrap
                    font-medium
                  "
                  style={{
                    fontSize: "16px",
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>

      </aside>

      {/* ==================================================
          HEADER
          ================================================== */}

      <header
  className="
    absolute
    left-[270px]
    top-[45px]
    z-[3000]
    flex
    items-center
    sm:left-[280px]
    md:left-[290px]
    lg:left-[300px]
  "
  style={{
    height: "45px",
  }}
>

        {/* ==================================================
            SEARCH
            ================================================== */}

        <div
  className="
    relative
    h-[50px]
    w-[260px]
    shrink-0
    sm:w-[320px]
    md:w-[360px]
    lg:w-[400px]
  "
>
          <MapPin
            size={19}
            strokeWidth={2}
            className="
              absolute
              left-4
              top-1/2
              -translate-y-1/2
              text-gray-600
            "
          />

          <Input
            type="text"
            placeholder="Search your location here...."
            className="
              h-full
              w-full
              rounded-full
              border
              border-gray-300
              bg-white
              pl-12
              pr-5
              text-[16px]
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              outline-none
              placeholder:text-gray-500
              focus-visible:ring-1
              focus-visible:ring-gray-300
            "
            onChange={(event) => {
              console.log("Search:", event.target.value);
            }}
          />
        </div>

        {/* ==================================================
            VEHICLE FILTERS
            ================================================== */}

        <div
  className="
  ml-[8px]
  flex
  h-[52px]
  flex-nowrap
  items-center
  gap-[5px]
  sm:ml-[12px]
  sm:gap-[7px]
  lg:ml-[35px]
  lg:gap-[10px]
"
>

          {/* JEEP */}

          <button
            type="button"
            onClick={() => handleClick("Jeep")}
            className="
              group
              flex
              h-[52px]
w-[52px]
sm:w-[70px]
md:w-[90px]
lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <Car
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>jeep</span>
          </button>

          {/* BUS */}

          <button
            type="button"
            onClick={() => handleClick("Bus")}
            className="
              group
              flex
              h-[52px]
w-[52px]
sm:w-[70px]
md:w-[90px]
lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <Bus
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>bus</span>
          </button>

          {/* TRAIN */}

          <button
            type="button"
            onClick={() => handleClick("Train")}
            className="
              group
              flex
             h-[52px]
w-[52px]
sm:w-[70px]
md:w-[90px]
lg:w-[105px]
              items-center
              justify-center
              gap-[6px]
              rounded-full
              border
              border-gray-300
              bg-white
              font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:-translate-y-0.5
              hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
            style={{
              fontSize: "15px",
            }}
          >
            <TrainFront
              size={18}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-110
              "
            />

            <span>train</span>
          </button>

        </div>

        {/* ==================================================
            NOTIFICATION + PROFILE
            ================================================== */}

        <div
          className="
          relative
            ml-[300px]
            flex
            h-[55px]
            items-center
            gap-[20px]
          "
        >

          {/* NOTIFICATION */}

          <button
            type="button"
            onClick={() => handleClick("Notifications")}
            title="Notifications"
            className="
              group
              flex
              h-[45px]
              w-[45px]
              items-center
              justify-center
              rounded-full
              bg-white
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:scale-105
              hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <Bell
              size={20}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:rotate-6
              "
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
              group
              flex
              h-[45px]
              w-[45px]
              items-center
              justify-center
              rounded-full
              bg-white
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all
              duration-200
              hover:scale-105
              hover:bg-gray-100
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
            "
          >
            <UserCircle
              size={21}
              strokeWidth={2}
              className="
                transition-transform
                duration-200
                group-hover:scale-105
              "
            />
                    </button>

          {showProfileMenu && (
  <div className="absolute right-0 top-[58px] z-[4000] w-[150px] rounded-xl bg-white p-2 shadow-[0_4px_15px_rgba(0,0,0,0.18)]">
    {!currentUserId ? (
      <button
        type="button"
        onClick={() => {
          setShowProfileMenu(false);
          window.location.href = "/login";
        }}
        className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
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
        className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium text-gray-700 transition-colors hover:bg-gray-100"
      >
        Log Out
      </button>
    )}
  </div>
)}
        </div>
      </header>

      {showLoginPrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/30">
          <div className="w-[320px] rounded-xl bg-white p-6 text-center shadow-[0_4px_20px_rgba(0,0,0,0.2)]">
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
                className="h-9 flex-1 rounded-[6px] border border-gray-300 bg-white text-[11px] font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowLoginPrompt(false);
                  window.location.href = "/login";
                }}
                className="h-9 flex-1 rounded-[6px] bg-[#6355F5] text-[11px] font-medium text-white hover:bg-[#5547E8]"
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