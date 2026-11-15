import React from "react";
import { Popover } from "@headlessui/react";
import { ThreeDots } from "react-bootstrap-icons";
import {
  GRASSES,
  TURF_LIMITS,
  TURF_PRESETS,
  stimpFeet,
} from "../../simulate/ground";

const firmnessWord = (value) =>
  value < 0.35 ? "soft" : value > 0.65 ? "firm" : "medium";
const wetnessWord = (value) =>
  value < 0.2 ? "dry" : value > 0.7 ? "wet" : "damp";

const Field = ({ id, label, display, limits, value, onChange }) => (
  <div className="mt-3">
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-sm text-white/80">
        {label}
      </label>
      <output htmlFor={id} className="text-sm font-semibold tabular-nums">
        {display}
      </output>
    </div>
    <input
      id={id}
      type="range"
      className="hud-range mt-2 w-full cursor-pointer"
      min={limits.min}
      max={limits.max}
      step={limits.step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </div>
);

// The overflow menu: every turf assumption behind bounce and roll, editable.
const TurfMenu = ({ conditions, presetKey, onChange, onPreset }) => (
  <Popover className="relative">
    <Popover.Button
      aria-label="Turf settings"
      className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
    >
      <ThreeDots size={18} />
    </Popover.Button>
    <Popover.Panel className="hud-panel hud-panel-solid absolute right-0 z-30 mt-2 w-[268px] p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-bold">Turf conditions</p>
        <p className="text-xs text-white/50">
          {presetKey ? TURF_PRESETS[presetKey].label : "Custom"}
        </p>
      </div>
      <p className="mt-1 text-xs text-white/50">
        What the ball lands on. These drive bounce and roll, not carry.
      </p>

      <div className="mt-3 flex items-baseline justify-between gap-2">
        <label htmlFor="turf-grass" className="text-sm text-white/80">
          Grass
        </label>
        <select
          id="turf-grass"
          className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold text-white"
          value={conditions.grass}
          onChange={(event) => onChange("grass", event.target.value)}
        >
          {Object.entries(GRASSES).map(([key, grass]) => (
            <option key={key} value={key} className="text-slate-900">
              {grass.label}
            </option>
          ))}
        </select>
      </div>

      <Field
        id="turf-cut"
        label="Height of cut"
        display={`${conditions.mowHeightInches.toFixed(2)} in`}
        limits={TURF_LIMITS.mowHeightInches}
        value={conditions.mowHeightInches}
        onChange={(value) => onChange("mowHeightInches", value)}
      />
      <Field
        id="turf-firmness"
        label="Ground firmness"
        display={`${Math.round(conditions.firmness * 100)}% · ${firmnessWord(
          conditions.firmness,
        )}`}
        limits={TURF_LIMITS.firmness}
        value={conditions.firmness}
        onChange={(value) => onChange("firmness", value)}
      />
      <Field
        id="turf-wetness"
        label="Leaf wetness"
        display={`${Math.round(conditions.leafWetness * 100)}% · ${wetnessWord(
          conditions.leafWetness,
        )}`}
        limits={TURF_LIMITS.leafWetness}
        value={conditions.leafWetness}
        onChange={(value) => onChange("leafWetness", value)}
      />

      <p className="mt-3 border-t border-white/10 pt-2.5 text-xs text-white/60">
        Rolls like a {stimpFeet(conditions).toFixed(1)} ft Stimpmeter reading.
      </p>
      {!presetKey && (
        <button
          type="button"
          className="mt-2 text-xs font-semibold text-lime-300 hover:text-lime-200"
          onClick={() => onPreset("normal")}
        >
          Reset to Normal
        </button>
      )}
    </Popover.Panel>
  </Popover>
);

export default TurfMenu;
