
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export interface MapSidebarItem {
  label: string;
  icon: LucideIcon;
}

interface MapSidebarProps {
  logo: ReactNode;
  items: MapSidebarItem[];
  onLogoClick: () => void;
  onItemClick: (label: string) => void;
  logoTitle?: string;
  footer?: ReactNode;
}

export default function MapSidebar({
  logo,
  items,
  onLogoClick,
  onItemClick,
  logoTitle = "Home",
  footer,
}: MapSidebarProps) {
  return (
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
        onClick={onLogoClick}
        title={logoTitle}
        className="
          absolute flex items-center justify-center rounded-lg
          transition-colors duration-200 hover:bg-white/10
        "
        style={{ top: "30px", width: "100%", height: "75px" }}
      >
        {logo}
      </button>

      <nav
        className="
          absolute left-0 top-[145px]
          flex w-full flex-col gap-1.5 px-3
        "
      >
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onItemClick(item.label)}
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

      {footer && (
        <div className="absolute bottom-[30px] left-0 w-full px-3">
          {footer}
        </div>
      )}
    </aside>
  );
}
