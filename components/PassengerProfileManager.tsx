"use client";

import React, { useState, useEffect } from "react";

export interface PassengerProfile {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F" | "O";
  berthPreference: string;
}

interface PassengerProfileManagerProps {
  // If provided, enables selection mode
  selectedIds?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;
  // Label or header styling options
  compact?: boolean;
}

const GENDER_OPTIONS = [
  { value: "M", label: "Male" },
  { value: "F", label: "Female" },
  { value: "O", label: "Other" },
];

const BERTH_OPTIONS = [
  { value: "none", label: "No Preference" },
  { value: "LB", label: "Lower (LB)" },
  { value: "MB", label: "Middle (MB)" },
  { value: "UB", label: "Upper (UB)" },
  { value: "SL", label: "Side Lower (SL)" },
  { value: "SU", label: "Side Upper (SU)" },
  { value: "SM", label: "Side Middle (SM)" },
];

const STORAGE_KEY = "lastberth_passenger_profiles";

export function PassengerProfileManager({
  selectedIds = [],
  onSelectionChange,
  compact = false,
}: PassengerProfileManagerProps) {
  const [profiles, setProfiles] = useState<PassengerProfile[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"M" | "F" | "O">("M");
  const [berthPreference, setBerthPreference] = useState("none");
  const [error, setError] = useState<string | null>(null);

  // Load profiles from localStorage on mount
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setProfiles(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load passenger profiles", e);
    }
  }, []);

  // Save profiles to localStorage helper
  const saveProfiles = (updated: PassengerProfile[]) => {
    setProfiles(updated);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save passenger profiles", e);
    }
  };

  const handleOpenAdd = () => {
    setName("");
    setAge("");
    setGender("M");
    setBerthPreference("none");
    setError(null);
    setEditingId(null);
    setIsAdding(true);
  };

  const handleOpenEdit = (profile: PassengerProfile) => {
    setName(profile.name);
    setAge(profile.age.toString());
    setGender(profile.gender);
    setBerthPreference(profile.berthPreference);
    setError(null);
    setEditingId(profile.id);
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    const parsedAge = parseInt(age);
    if (isNaN(parsedAge) || parsedAge <= 0 || parsedAge > 120) {
      setError("Please enter a valid age (1-120)");
      return;
    }

    if (editingId) {
      // Edit
      const updated = profiles.map((p) =>
        p.id === editingId
          ? { ...p, name: name.trim(), age: parsedAge, gender, berthPreference }
          : p
      );
      saveProfiles(updated);
    } else {
      // Add new
      const newProfile: PassengerProfile = {
        id: Math.random().toString(36).substring(2, 9),
        name: name.trim(),
        age: parsedAge,
        gender,
        berthPreference,
      };
      const updated = [...profiles, newProfile];
      saveProfiles(updated);

      // Auto-select newly created profile if in selection mode
      if (onSelectionChange) {
        onSelectionChange([...selectedIds, newProfile.id]);
      }
    }

    setIsAdding(false);
    setEditingId(null);
    setError(null);
  };

  const handleDelete = (id: string) => {
    const updated = profiles.filter((p) => p.id !== id);
    saveProfiles(updated);
    if (onSelectionChange && selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    }
  };

  const toggleSelectProfile = (id: string) => {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div className={`w-full rounded-2xl border border-slate-200/80 bg-white/70 shadow-sm backdrop-blur-md transition-all ${compact ? "p-3 mt-2" : "p-6"}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h4 className="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
            <span>👤</span> Passenger Sync Profiles
          </h4>
          {!compact && (
            <p className="text-xs text-slate-500 mt-0.5">
              Manage profiles for instant one-click form filling on IRCTC.
            </p>
          )}
        </div>
        {!isAdding && (
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-600 border border-blue-100 hover:bg-blue-100 hover:text-blue-700 transition-all"
          >
            <span>+</span> Add Passenger
          </button>
        )}
      </div>

      {isAdding ? (
        <form onSubmit={handleSubmit} className="border border-slate-100 bg-slate-50/50 rounded-xl p-4 space-y-3.5 mb-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
              {editingId ? "✏️ Edit Passenger Profile" : "✨ New Passenger Profile"}
            </span>
            <button
              type="button"
              onClick={handleCancel}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                placeholder="As per ID proof"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Age
              </label>
              <input
                type="number"
                placeholder="Years"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none font-medium"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Gender
              </label>
              <div className="grid grid-cols-3 gap-1">
                {GENDER_OPTIONS.map((opt) => {
                  const selected = gender === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(opt.value as any)}
                      className={`rounded-lg py-2 text-xs font-semibold text-center border transition-all ${
                        selected
                          ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-55"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Berth Preference
              </label>
              <select
                value={berthPreference}
                onChange={(e) => setBerthPreference(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none"
              >
                {BERTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition-all"
            >
              {editingId ? "Save Profile" : "Create Profile"}
            </button>
          </div>
        </form>
      ) : null}

      {profiles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
          <span className="text-2xl mb-1.5 block">📭</span>
          <p className="text-xs font-semibold text-slate-500">No passenger profiles saved yet.</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Click &quot;Add Passenger&quot; to create your first sync profile.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {profiles.map((profile) => {
            const isSelected = selectedIds.includes(profile.id);
            const isSelectionEnabled = !!onSelectionChange;

            return (
              <div
                key={profile.id}
                onClick={() => isSelectionEnabled && toggleSelectProfile(profile.id)}
                className={`flex items-center justify-between rounded-xl border p-3 transition-all ${
                  isSelectionEnabled ? "cursor-pointer" : ""
                } ${
                  isSelected
                    ? "border-blue-400 bg-blue-50/50 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isSelectionEnabled && (
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="h-2.5 w-2.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="3.5"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  )}

                  <div className="min-w-0 leading-tight">
                    <p className="text-xs font-extrabold text-slate-800 truncate">
                      {profile.name}
                    </p>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium mt-0.5 flex-wrap">
                      <span>{profile.age} Yrs</span>
                      <span>•</span>
                      <span>{GENDER_OPTIONS.find((g) => g.value === profile.gender)?.label}</span>
                      <span>•</span>
                      <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-600">
                        Pref: {BERTH_OPTIONS.find((b) => b.value === profile.berthPreference)?.label.split(" (")[0]}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(profile)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded"
                    title="Edit profile"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(profile.id)}
                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded"
                    title="Delete profile"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
