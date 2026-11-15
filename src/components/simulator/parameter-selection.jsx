import React from "react";
import { QuestionCircleFill } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import {
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
  SWING_SPEED_VALUES,
} from "../../utils/constant";
import { TURF_PRESETS } from "../../simulate/ground";

const describeAngle = (value, positive, negative) => {
  if (value === 0) return "square";
  return `${Math.abs(value)}° ${value > 0 ? positive : negative}`;
};

const Slider = ({ id, name, display, range, value, onChange, tooltip }) => (
  <div className="mt-4">
    <div className="flex items-baseline justify-between gap-2">
      <label htmlFor={id} className="text-sm font-medium text-white/80">
        {name}
        <span
          data-tooltip-id="main-tooltip"
          data-tooltip-content={tooltip}
          className="cursor-help"
        >
          <QuestionCircleFill
            size={12}
            className="ml-1.5 inline text-white/40"
          />
        </span>
      </label>
      <output htmlFor={id} className="text-sm font-semibold tabular-nums">
        {display}
      </output>
    </div>
    <input
      id={id}
      type="range"
      className="hud-range mt-2 w-full cursor-pointer"
      min={range.MIN}
      max={range.MAX}
      step={range.STEP}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  </div>
);

const TURF_HELP =
  "How the landing area plays. Normal is a ryegrass fairway cut at 0.6 in with average moisture. Soft is longer (0.75 in), wet turf that kills the bounce. Firm is short (0.45 in), dry turf that runs. Use the ⋯ menu to set grass, cut, firmness and wetness yourself.";

const MODES = [
  ["practice", "Practice"],
  ["game", "Game mode"],
];

const ParameterSelection = ({ values, handleValueChange }) => {
  const rightHanded = values.side === "Right";
  return (
    <>
      <div
        className="mb-2 grid grid-cols-2 rounded-lg bg-white/10 p-1 text-sm"
        role="group"
        aria-label="Mode"
      >
        {MODES.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={values.mode === key}
            className={classNames(
              "rounded-md py-1.5 font-medium transition-colors",
              values.mode === key
                ? "bg-lime-400 text-slate-900"
                : "text-white/70 hover:text-white",
            )}
            onClick={() => handleValueChange("mode", key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className="grid grid-cols-2 rounded-lg bg-white/10 p-1 text-sm"
        role="group"
        aria-label="Dominant side"
      >
        {["Left", "Right"].map((side) => (
          <button
            key={side}
            type="button"
            aria-pressed={values.side === side}
            className={classNames(
              "rounded-md py-1.5 font-medium transition-colors",
              values.side === side
                ? "bg-white text-slate-900"
                : "text-white/70 hover:text-white",
            )}
            onClick={() => handleValueChange("side", side)}
          >
            {side}-handed
          </button>
        ))}
      </div>

      <Slider
        id="club-face-angle"
        name="Club face"
        display={describeAngle(
          values.clubFaceAngleSliderValue,
          "open",
          "closed",
        )}
        range={CLUB_FACE_ANGLE_VALUES}
        value={values.clubFaceAngleSliderValue}
        onChange={(value) => handleValueChange("clubFaceAngle", value)}
        tooltip={`Where the club face points at impact. Open points ${
          rightHanded ? "right" : "left"
        } of the target, closed points ${
          rightHanded ? "left" : "right"
        }. The ball starts mostly where the face points.`}
      />

      <Slider
        id="club-path-angle"
        name="Club path"
        display={describeAngle(
          values.clubPathAngleSliderValue,
          "in-to-out",
          "out-to-in",
        )}
        range={CLUB_PATH_ANGLE_VALUES}
        value={values.clubPathAngleSliderValue}
        onChange={(value) => handleValueChange("clubPathAngle", value)}
        tooltip={`The direction the club head is travelling at impact. In-to-out swings ${
          rightHanded ? "right" : "left"
        } of the target, out-to-in swings ${
          rightHanded ? "left" : "right"
        }. The ball curves away from the path, toward where the face points.`}
      />

      <Slider
        id="swing-speed"
        name="Swing speed"
        display={`${values.swingSpeedSliderValue} mph`}
        range={SWING_SPEED_VALUES}
        value={values.swingSpeedSliderValue}
        onChange={(value) => handleValueChange("swingSpeed", value)}
        tooltip="Club head speed at impact with a driver. Faster swings carry farther."
      />

      <div className="mt-4">
        <p className="text-sm font-medium text-white/80">
          Turf
          <span
            data-tooltip-id="main-tooltip"
            data-tooltip-content={TURF_HELP}
            className="cursor-help"
          >
            <QuestionCircleFill
              size={12}
              className="ml-1.5 inline text-white/40"
            />
          </span>
        </p>
        <div
          className="mt-2 grid grid-cols-3 rounded-lg bg-white/10 p-1 text-sm"
          role="group"
          aria-label="Turf"
        >
          {Object.entries(TURF_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              type="button"
              aria-pressed={values.turf === key}
              className={classNames(
                "rounded-md py-1 font-medium transition-colors",
                values.turf === key
                  ? "bg-white text-slate-900"
                  : "text-white/70 hover:text-white",
              )}
              onClick={() => handleValueChange("turf", key)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};

export default ParameterSelection;
