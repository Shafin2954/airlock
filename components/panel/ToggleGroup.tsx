"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string; icon?: React.ReactNode };

export default function ToggleGroup<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {label}
        </div>
      )}
      <div className="flex w-full rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition",
                active
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
