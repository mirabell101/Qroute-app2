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

export default function Landing() {
  const refreshPage = () => {
    window.location.reload();
  };

  const handleClick = (name: string) => {
    console.log(`${name} clicked`);
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
          flex-col
          bg-[#12395A]
          text-white
        "
        style={{
          width: "250px",
        }}
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
            "
            style={{
              fontSize: "44px",
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
          className="absolute flex flex-col"
          style={{
            left: "32px",
            top: "145px",
            width: "235px",
            gap: "10px",
          }}
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
                  w-[215px]
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
          z-[3000]
          flex
          items-center
        "
        style={{
          left: "300px",
          top: "45px",
          height: "45px",
        }}
      >

        {/* ==================================================
            SEARCH
            ================================================== */}

        <div
          className="relative shrink-0"
          style={{
            width: "400px",
            height: "50px",
          }}
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
    ml-[35px]
    flex
    h-[52px]
    items-center
    gap-[10px]
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
              w-[105px]
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
              w-[105px]
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
              w-[105px]
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
            onClick={() => handleClick("Profile")}
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

        </div>

      </header>

    </main>
  );
}