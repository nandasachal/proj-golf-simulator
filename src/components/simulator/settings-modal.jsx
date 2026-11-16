import React, { useState } from "react";
import { Dialog } from "@headlessui/react";
import { ChatDots, GearFill, X } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import {
  GRASSES,
  TURF_LIMITS,
  TURF_PRESETS,
  stimpFeet,
} from "../../simulate/ground";

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfR6vP8GLaPvjIRF9qY8NDl5em_JxNO10pJcJrR03tU-B0YIw/viewform";

const firmnessWord = (value) =>
  value < 0.35 ? "soft" : value > 0.65 ? "firm" : "medium";
const wetnessWord = (value) =>
  value < 0.2 ? "dry" : value > 0.7 ? "wet" : "damp";

const Segmented = ({ label, options, value, onChange, accent }) => (
  <div
    className="grid rounded-lg bg-white/10 p-1 text-sm"
    style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    role="group"
    aria-label={label}
  >
    {options.map(([key, text]) => (
      <button
        key={key}
        type="button"
        aria-pressed={value === key}
        className={classNames(
          "rounded-md py-1.5 font-medium transition-colors",
          value === key
            ? accent
              ? "bg-lime-400 text-slate-900"
              : "bg-white text-slate-900"
            : "text-white/70 hover:text-white",
        )}
        onClick={() => onChange(key)}
      >
        {text}
      </button>
    ))}
  </div>
);

const Section = ({ title, hint, children }) => (
  <section className="mt-5 first:mt-0">
    <h3 className="text-sm font-bold">{title}</h3>
    {hint && <p className="mt-0.5 text-xs text-white/50">{hint}</p>}
    <div className="mt-2">{children}</div>
  </section>
);

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

// Everything about the session rather than the swing: game mode, which side
// the golfer plays from, and the turf the ball lands on.
const SettingsModal = ({
  mode,
  side,
  turf,
  turfPreset,
  onMode,
  onSide,
  onTurfPreset,
  onTurfField,
}) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Settings"
        aria-haspopup="dialog"
        className="hud-panel flex h-10 w-10 items-center justify-center !rounded-full text-white/90 transition-colors hover:text-white"
        onClick={() => setOpen(true)}
        data-tooltip-id="main-tooltip"
        data-tooltip-content="Settings: game mode, handedness, turf, feedback"
      >
        <GearFill size={18} />
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        className="relative z-50"
      >
        <div className="fixed inset-0 bg-black/50" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
          <Dialog.Panel className="hud-panel hud-panel-solid max-h-full w-full max-w-sm overflow-y-auto p-5 text-white">
            <div className="flex items-center justify-between">
              <Dialog.Title className="text-base font-bold">
                Settings
              </Dialog.Title>
              <button
                type="button"
                aria-label="Close settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                <X size={22} />
              </button>
            </div>

            <div className="mt-4">
              <Section
                title="Mode"
                hint="Game mode puts a target on the range and keeps score."
              >
                <Segmented
                  label="Mode"
                  accent
                  options={[
                    ["practice", "Practice"],
                    ["game", "Game mode"],
                  ]}
                  value={mode}
                  onChange={onMode}
                />
              </Section>

              <Section title="Dominant side">
                <Segmented
                  label="Dominant side"
                  options={[
                    ["Left", "Left-handed"],
                    ["Right", "Right-handed"],
                  ]}
                  value={side}
                  onChange={onSide}
                />
              </Section>

              <Section
                title="Turf"
                hint="What the ball lands on. These drive bounce and roll, not carry."
              >
                <Segmented
                  label="Turf"
                  options={Object.entries(TURF_PRESETS).map(([key, preset]) => [
                    key,
                    preset.label,
                  ])}
                  value={turfPreset}
                  onChange={onTurfPreset}
                />
                {!turfPreset && (
                  <p className="mt-2 text-xs text-white/50">
                    Custom conditions. Pick a preset above to reset.
                  </p>
                )}

                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <label htmlFor="turf-grass" className="text-sm text-white/80">
                    Grass
                  </label>
                  <select
                    id="turf-grass"
                    className="rounded-md bg-white/10 px-2 py-1 text-sm font-semibold text-white"
                    value={turf.grass}
                    onChange={(event) =>
                      onTurfField("grass", event.target.value)
                    }
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
                  display={`${turf.mowHeightInches.toFixed(2)} in`}
                  limits={TURF_LIMITS.mowHeightInches}
                  value={turf.mowHeightInches}
                  onChange={(value) => onTurfField("mowHeightInches", value)}
                />
                <Field
                  id="turf-firmness"
                  label="Ground firmness"
                  display={`${Math.round(turf.firmness * 100)}% · ${firmnessWord(
                    turf.firmness,
                  )}`}
                  limits={TURF_LIMITS.firmness}
                  value={turf.firmness}
                  onChange={(value) => onTurfField("firmness", value)}
                />
                <Field
                  id="turf-wetness"
                  label="Leaf wetness"
                  display={`${Math.round(turf.leafWetness * 100)}% · ${wetnessWord(
                    turf.leafWetness,
                  )}`}
                  limits={TURF_LIMITS.leafWetness}
                  value={turf.leafWetness}
                  onChange={(value) => onTurfField("leafWetness", value)}
                />
                <p className="mt-3 text-xs text-white/60">
                  Rolls like a {stimpFeet(turf).toFixed(1)} ft Stimpmeter
                  reading.
                </p>
              </Section>
            </div>
            <a
              className="mt-5 flex items-center justify-center rounded-lg bg-white/10 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              href={FEEDBACK_URL}
              target="_blank"
              rel="noreferrer"
            >
              <ChatDots size={14} className="mr-1.5" />
              Feedback
            </a>
          </Dialog.Panel>
        </div>
      </Dialog>
    </>
  );
};

export default SettingsModal;
