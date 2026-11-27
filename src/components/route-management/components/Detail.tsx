// ============================================================
// DETAIL COMPONENT
// ============================================================

export function Detail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 text-sm">
      <span className="text-slate-500">
        {label}
      </span>

      <span className="max-w-[65%] text-right font-medium text-slate-800">
        {value}
      </span>
    </div>
  );
}


