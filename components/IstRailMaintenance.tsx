"use client";

import {
  comebackInMinutesSentence,
  IST_NIGHTLY_MAINTENANCE_WINDOW_LABEL,
} from "@/lib/istRailMaintenance";

type BannerProps = { show: boolean };

export function IstRailMaintenanceBanner({ show }: BannerProps) {
  if (!show) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="border-b border-red-400/90 bg-red-50 px-3 py-2.5 sm:px-4"
    >
      <p className="mx-auto max-w-lg text-center text-xs sm:text-sm font-medium leading-snug text-red-900">
        Indian Railways systems are under scheduled maintenance between{" "}
        <span className="whitespace-nowrap font-semibold text-red-950">
          {IST_NIGHTLY_MAINTENANCE_WINDOW_LABEL}
        </span>
        . Availability checks are unavailable during this window — please come
        back later.
      </p>
    </div>
  );
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  minutesDisplay: number;
};

export function IstRailMaintenanceModal({
  open,
  onClose,
  minutesDisplay,
}: ModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[101] flex items-center justify-center bg-black/50 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="ist-maintenance-modal-title"
      aria-describedby="ist-maintenance-modal-desc"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-red-300 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="ist-maintenance-modal-title"
          className="text-lg font-bold text-red-950"
        >
          Search unavailable
        </h2>
        <p
          id="ist-maintenance-modal-desc"
          className="mt-3 text-sm text-slate-700 leading-relaxed"
        >
          Indian Railways runs scheduled maintenance between{" "}
          <span className="font-semibold whitespace-nowrap">
            {IST_NIGHTLY_MAINTENANCE_WINDOW_LABEL}
          </span>
          . We cannot check seat availability during this time.
        </p>
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-center text-base font-semibold text-red-950">
          {comebackInMinutesSentence(minutesDisplay)}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 min-h-[48px] font-semibold text-white active:bg-blue-700 transition"
        >
          OK
        </button>
      </div>
    </div>
  );
}
