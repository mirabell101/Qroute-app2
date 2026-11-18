
import type { ReactNode } from "react";

interface MapHeaderProps {
  children: ReactNode;
}

export default function MapHeader({ children }: MapHeaderProps) {
  return (
    <header
      className="
        absolute left-[270px] top-[45px] z-[3000]
        flex items-center
        sm:left-[280px] md:left-[290px] lg:left-[300px]
      "
      style={{ height: "45px" }}
    >
      {children}
    </header>
  );
}
