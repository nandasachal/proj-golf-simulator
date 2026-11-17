import React, { useMemo, useState } from "react";
import { Dialog } from "@headlessui/react";
import { ChatDots, GearFill, X } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import {
  GRASSES,
  TURF_LIMITS,
  TURF_PRESETS,
  stimpFeet,
} from "../../simulate/ground";
import { CATEGORIES, CLUBS, swingSpeedRange } from "../../simulate/clubs";
import {
  STOCK_CONDITIONS,
  carryLimits,
  stockCarryYards,
} from "../../simulate/club-distances";

const FEEDBACK_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSfR6vP8GLaPvjIRF9qY8NDl5em_JxNO10pJcJrR03tU-B0YIw/viewform";

const firmnessWord = (value) =>
  value < 0.35 ? "soft" : value > 0.65 ? "firm" : "medium";
const wetnessWord = (value) =>
  value < 0.2 ? "dry" : value > 0.7 ? "wet" : "damp";

export const Segmented = ({ label, options, value, onChange, accent }) => (
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

// One club: pick it by its name, see its loft, and type over its carry.
const ClubRow = ({ club, selected, carry, custom, onSelect, onCarry }) => {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    const typed = Number.parseFloat(draft);
    if (Number.isFinite(typed) && Math.round(typed) !== carry) {
      const { min, max } = carryLimits(club.id);
      onCarry(club.id, Math.min(max, Math.max(min, Math.round(typed))));
    }
    setDraft(null);
  };
  return (
    <li
      className={classNames(
        "flex items-center gap-2 rounded-md pr-1.5",
        selected ? "bg-white/15" : "hover:bg-white/[0.07]",
      )}
      data-club-row={club.id}
    >
      <button
        type="button"
        aria-pressed={selected}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 pl-2 text-left text-sm"
        onClick={() => onSelect(club.id)}
      >
        <span
          aria-hidden="true"
          className={classNames(
            "h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-inset",
            selected ? "bg-lime-400 ring-lime-400" : "ring-white/40",
          )}
        />
        <span
          className={classNames(
            "truncate",
            selected ? "font-semibold text-white" : "text-white/85",
          )}
        >
          {club.name}
        </span>
        <span className="ml-auto shrink-0 text-xs tabular-nums text-white/55">
          {club.loftDegrees}°
        </span>
      </button>
      <label className="flex shrink-0 items-center gap-1 text-xs text-white/55">
        <input
          type="number"
          aria-label={`${club.name} carry in yards`}
          inputMode="numeric"
          className={classNames(
            "w-14 rounded bg-white/10 px-1.5 py-1 text-right text-sm font-semibold tabular-nums outline-none focus:bg-white focus:text-slate-900",
            custom ? "text-lime-300" : "text-white",
          )}
          value={draft ?? carry}
          onFocus={(event) => event.target.select()}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.target.blur();
            if (event.key === "Escape" && draft !== null) {
              // Put the number back without closing Settings.
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
            }
          }}
        />
        yd
      </label>
    </li>
  );
};

// The bag, grouped by kind of club. `speeds` are this session's swing speeds
// for clubs whose distance has been changed.
const ClubPicker = ({ club, speeds, onClub, onCarry, onReset }) => {
  const carries = useMemo(
    () =>
      Object.fromEntries(
        CLUBS.map((entry) => [
          entry.id,
          Math.round(
            stockCarryYards(
              entry.id,
              speeds[entry.id] ?? swingSpeedRange(entry).DEFAULT,
            ),
          ),
        ]),
      ),
    [speeds],
  );
  const changed = Object.keys(speeds).length > 0;
  return (
    <>
      <div className="flex items-baseline justify-between text-[11px] uppercase tracking-wider text-white/45">
        <span>Club · loft</span>
        <span>Carry</span>
      </div>
      {Object.entries(CATEGORIES).map(([category, label]) => (
        <div key={category} className="mt-2" role="group" aria-label={label}>
          {category !== "driver" && (
            <p className="mb-0.5 text-xs font-semibold text-white/60">
              {label}
            </p>
          )}
          <ul className="flex flex-col gap-0.5">
            {CLUBS.filter((entry) => entry.category === category).map(
              (entry) => (
                <ClubRow
                  key={entry.id}
                  club={entry}
                  selected={entry.id === club.id}
                  carry={carries[entry.id]}
                  custom={speeds[entry.id] != null}
                  onSelect={onClub}
                  onCarry={onCarry}
                />
              ),
            )}
          </ul>
        </div>
      ))}
      <p className="mt-3 text-xs text-white/60">
        Carry with a solid, straight strike at {STOCK_CONDITIONS}. Type over a
        distance to set your own: it changes that club's swing speed for this
        session only.
        {changed && (
          <>
            {" "}
            <button
              type="button"
              className="font-semibold text-lime-300 underline-offset-2 hover:underline"
              onClick={onReset}
            >
              Reset distances
            </button>
          </>
        )}
      </p>
    </>
  );
};

// Everything about the session rather than the swing: the bag and its
// distances, which side the golfer plays from, and the turf the ball lands on.
const SettingsModal = ({
  side,
  turf,
  turfPreset,
  onSide,
  onTurfPreset,
  onTurfField,
  club,
  clubSpeeds,
  onClub,
  onClubCarry,
  onResetCarries,
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
        data-tooltip-content="Settings: clubs and distances, handedness, turf, feedback"
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
                title="Club"
                hint="Every shot is hit with this club. The driver is teed up; the rest are played off the turf."
              >
                <ClubPicker
                  club={club}
                  speeds={clubSpeeds}
                  onClub={onClub}
                  onCarry={onClubCarry}
                  onReset={onResetCarries}
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
