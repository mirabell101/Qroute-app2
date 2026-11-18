
import { Bus, Car, TrainFront } from "lucide-react";

export type VehicleType = "Jeep" | "Bus" | "Train";

interface VehicleFilterBarProps {
  onSelect?: (vehicle: VehicleType) => void;
  disabled?: boolean;
}

const vehicles = [
  { label: "Jeep", icon: Car, displayLabel: "jeep" },
  { label: "Bus", icon: Bus, displayLabel: "bus" },
  { label: "Train", icon: TrainFront, displayLabel: "train" },
] as const;

export default function VehicleFilterBar({
  onSelect,
  disabled = false,
}: VehicleFilterBarProps) {
  return (
    <div
      className="
        ml-[8px] flex h-[52px] flex-nowrap items-center gap-[5px]
        sm:ml-[12px] sm:gap-[7px]
        lg:ml-[35px] lg:gap-[10px]
      "
    >
      {vehicles.map((vehicle) => {
        const Icon = vehicle.icon;

        return (
          <button
            key={vehicle.label}
            type="button"
            disabled={disabled}
            onClick={() => onSelect?.(vehicle.label)}
            className="
              group flex h-[52px] w-[52px] items-center justify-center
              gap-[6px] rounded-full border border-gray-300 bg-white
              font-medium shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:-translate-y-0.5 hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              disabled:cursor-not-allowed disabled:opacity-50
              disabled:hover:translate-y-0 disabled:hover:bg-white
              disabled:hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
            "
            style={{ fontSize: "15px" }}
          >
            <Icon size={18} strokeWidth={2} />
            <span>{vehicle.displayLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
