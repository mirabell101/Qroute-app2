import { useNavigate } from "react-router-dom";
import {
  Bell,
  Bus,
  Car,
  Home,
  MapPin,
  MessageSquare,
  Settings,
  TrainFront,
  UserCircle,
} from "lucide-react";

import {
  TransitMapCanvas,
  TransitMapPanel,
  TransitMapSearch,
  TransitMapStatus,
  useTransitMap,
} from "@/components/transit-map";

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
// ADMIN LANDING
// ==================================================

export default function Base() {
  const navigate = useNavigate();

  // Shared map state (search, routes, trip selection, fares).
  const map = useTransitMap();

  const handleClick = (name: string) => {
    console.log(`${name} clicked`);
  };

  const refreshPage = () => {
    window.location.reload();
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-white">
      {/* ==================================================
          MAP
          ================================================== */}

      <TransitMapCanvas map={map} />

      {/* LOCATION + TERMINAL STATUS */}
      <TransitMapStatus
        map={map}
        terminalStatusClassName="absolute bottom-5 left-[230px] z-[3000] max-w-sm rounded-xl bg-white px-4 py-3 text-sm shadow-lg sm:left-[240px] md:left-[250px]"
      />

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
            left-0
            top-[145px]
            flex
            w-full
            flex-col
            gap-0
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
                  px-6
                  text-left
                  transition-colors
                  duration-200
                  hover:bg-[#d9dee3]
                  hover:text-[#12395A]
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

        {/* ==================================================
            MANAGE SITE
            ================================================== */}

        <button
          type="button"
          onClick={() => navigate("/admin/dashboard")}
          className="
            group
            absolute
            bottom-[30px]
            left-1/2
            flex
            h-[40px]
            w-[160px]
            -translate-x-1/2
            items-center
            justify-center
            gap-2
            rounded-lg
            bg-white
            text-[#12395A]
            font-semibold
            transition-all
            duration-200
            hover:-translate-y-0.5
            hover:bg-gray-100
          "
        >
          <Settings
            size={16}
            strokeWidth={2}
            className="
              transition-transform
              duration-200
              group-hover:rotate-45
            "
          />

          <span className="text-[13px]">
            Manage Site
          </span>
        </button>
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
            SEARCH (shared)
            ================================================== */}

        <TransitMapSearch map={map} />

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
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
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
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
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
              sm:w-[70px]
              md:w-[90px]
              lg:w-[105px]
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

      {/* ==================================================
          PLACE DETAILS + ACTIVE ROUTE + FARES (shared)
          ================================================== */}

      <TransitMapPanel
        map={map}
        className="absolute left-[230px] top-[110px] z-[1500] max-h-[calc(100vh-130px)] w-[min(360px,calc(100vw-245px))] overflow-y-auto rounded-xl bg-white p-4 shadow-lg sm:left-[240px] md:left-[250px] lg:left-[300px]"
      />
    </main>
  );
}