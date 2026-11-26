import { Bus, Car, RotateCcw, TrainFront } from "lucide-react";

export interface VehicleFilterOption {
  id: number;
  name: string;
  color: string;
}

interface VehicleFilterBarProps {
  /** Options are loaded from the public transport_types table. */
  transportTypes: VehicleFilterOption[];
  activeVehicleTypeId: number | null;
  onSelect?: (transportTypeId: number) => void;
  onClear?: () => void;
  disabled?: boolean;
}

function getVehicleIcon(name: string) {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.includes("bus")) {
    return Bus;
  }

  if (normalizedName.includes("train")) {
    return TrainFront;
  }

  // Jeepney uses the same Car icon as the original design.
  return Car;
}

function getVehicleDisplayLabel(name: string): string {
  const normalizedName = name.trim().toLowerCase();

  if (normalizedName.includes("jeep")) return "jeep";
  if (normalizedName.includes("bus")) return "bus";
  if (normalizedName.includes("train")) return "train";

  return normalizedName || "vehicle";
}

function getActiveBackground(color: string): string | undefined {
  return /^#[0-9a-fA-F]{6}$/.test(color)
    ? `${color}18`
    : undefined;
}

export default function VehicleFilterBar({
  transportTypes,
  activeVehicleTypeId,
  onSelect,
  onClear,
  disabled = false,
}: VehicleFilterBarProps) {
  return (
    <div
      className="
        ml-[8px] flex h-[52px] flex-nowrap items-center gap-[5px]
        sm:ml-[12px] sm:gap-[7px]
        lg:ml-[35px] lg:gap-[10px]
      "
      aria-label="Filter map by vehicle type"
    >
      {transportTypes.map((vehicle) => {
        const Icon = getVehicleIcon(vehicle.name);
        const isActive = activeVehicleTypeId === vehicle.id;
        const displayLabel = getVehicleDisplayLabel(vehicle.name);

        return (
          <button
            key={vehicle.id}
            type="button"
            disabled={disabled}
            aria-pressed={isActive}
            aria-label={`Show ${vehicle.name} locations only`}
            title={`Show ${vehicle.name} locations only`}
            onClick={() => onSelect?.(vehicle.id)}
            className={`
              group flex h-[52px] w-[52px] shrink-0 items-center justify-center
              gap-[6px] rounded-full border bg-white px-2 font-medium
              shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              transition-all duration-200
              hover:-translate-y-0.5 hover:bg-[#eaf5fb]
              hover:shadow-[0_4px_12px_rgba(0,0,0,0.22)]
              disabled:cursor-not-allowed disabled:opacity-50
              disabled:hover:translate-y-0 disabled:hover:bg-white
              disabled:hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]
              sm:w-[70px] md:w-[90px] lg:w-[105px]
              ${isActive ? "ring-2 ring-offset-1" : "border-gray-300"}
            `}
            style={
              isActive
                ? {
                    borderColor: vehicle.color,
                    color: vehicle.color,
                    backgroundColor: getActiveBackground(vehicle.color),
                    outlineColor: vehicle.color,
                  }
                : undefined
            }
          >
            <Icon size={18} strokeWidth={2} aria-hidden="true" />
            <span className="text-[12px] sm:text-[13px]">{displayLabel}</span>
          </button>
        );
      })}

      <button
        type="button"
        disabled={disabled || activeVehicleTypeId === null}
        onClick={() => onClear?.()}
        aria-label="Clear vehicle filters"
        title="Clear vehicle filters"
        className="
          inline-flex h-[40px] shrink-0 items-center justify-center gap-1.5
          rounded-full border border-gray-300 bg-white px-3 text-[11px]
          font-semibold text-gray-600 shadow-[0_2px_8px_rgba(0,0,0,0.12)]
          transition-colors hover:bg-gray-100
          disabled:cursor-not-allowed disabled:opacity-40
        "
      >
        <RotateCcw size={14} strokeWidth={2} aria-hidden="true" />
        <span>Clear filters</span>
      </button>
    </div>
  );
}
