import React from "react";
import { QuestionCircleFill } from "react-bootstrap-icons";
import {
  AIM_VALUES,
  ATTACK_ANGLE_VALUES,
  LOFT_CHANGE_VALUES,
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
  SWING_SPEED_VALUES,
} from "../../utils/constant";
import { SHORTCUTS, keyLabel } from "../../utils/shortcuts";
import { driverLaunch } from "../../simulate/launch-conditions";

const describeAngle = (value, positive, negative, zero = "square") => {
  if (value === 0) return zero;
  return `${Math.abs(value)}° ${value > 0 ? positive : negative}`;
};

const Slider = ({
  id,
  name,
  display,
  range,
  value,
  onChange,
  tooltip,
  keys,
  keyHint,
}) => (
  <div className="mt-4 first:mt-0">
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
      aria-keyshortcuts={`${keyLabel(keys.down)} ${keyLabel(keys.up)}`}
      data-tooltip-id="main-tooltip"
      data-tooltip-content={`Keys: ${keyLabel(keys.down)} ${keyHint.down} · ${keyLabel(
        keys.up,
      )} ${keyHint.up}`}
      data-tooltip-place="right"
    />
  </div>
);

// The controls that shape the shot. Everything else lives in Settings.
const ParameterSelection = ({ values, handleValueChange }) => {
  const rightHanded = values.side === "Right";
  const launch = driverLaunch(values.swingSpeed, {
    attackAngle: values.attackAngle,
    loftChange: values.loftChange,
  });
  const loftSign = values.loftChange > 0 ? "+" : "";
  return (
    <>
      <Slider
        id="club-face-angle"
        name="Club face"
        display={describeAngle(values.clubFaceAngle, "open", "closed")}
        range={CLUB_FACE_ANGLE_VALUES}
        value={values.clubFaceAngle}
        onChange={(value) => handleValueChange("clubFaceAngle", value)}
        keys={SHORTCUTS.clubFaceAngle}
        keyHint={{ down: "closes", up: "opens" }}
        tooltip={`Where the club face points at impact. Open points ${
          rightHanded ? "right" : "left"
        } of the target, closed points ${
          rightHanded ? "left" : "right"
        }. The ball starts mostly where the face points.`}
      />

      <Slider
        id="club-path-angle"
        name="Club path"
        display={describeAngle(values.clubPathAngle, "in-to-out", "out-to-in")}
        range={CLUB_PATH_ANGLE_VALUES}
        value={values.clubPathAngle}
        onChange={(value) => handleValueChange("clubPathAngle", value)}
        keys={SHORTCUTS.clubPathAngle}
        keyHint={{ down: "out-to-in", up: "in-to-out" }}
        tooltip={`The direction the club head is travelling at impact. In-to-out swings ${
          rightHanded ? "right" : "left"
        } of the target, out-to-in swings ${
          rightHanded ? "left" : "right"
        }. The ball curves away from the path, toward where the face points.`}
      />

      <Slider
        id="swing-speed"
        name="Swing speed"
        display={`${values.swingSpeed} mph`}
        range={SWING_SPEED_VALUES}
        value={values.swingSpeed}
        onChange={(value) => handleValueChange("swingSpeed", value)}
        keys={SHORTCUTS.swingSpeed}
        keyHint={{ down: "slower", up: "faster" }}
        tooltip="Club head speed at impact with a driver. Faster swings carry farther."
      />

      <Slider
        id="attack-angle"
        name="Attack angle"
        display={describeAngle(values.attackAngle, "up", "down", "level")}
        range={ATTACK_ANGLE_VALUES}
        value={values.attackAngle}
        onChange={(value) => handleValueChange("attackAngle", value)}
        keys={SHORTCUTS.attackAngle}
        keyHint={{ down: "more down", up: "more up" }}
        tooltip="Whether the club head is travelling up or down when it meets the ball. Hitting up with the same loft launches higher with less backspin and a more solid strike; hitting down adds spin and costs distance."
      />

      <Slider
        id="loft"
        name="Loft at impact"
        display={`${launch.dynamicLoftDegrees.toFixed(1)}°${
          values.loftChange === 0 ? "" : ` (${loftSign}${values.loftChange})`
        }`}
        range={LOFT_CHANGE_VALUES}
        value={values.loftChange}
        onChange={(value) => handleValueChange("loftChange", value)}
        keys={SHORTCUTS.loftChange}
        keyHint={{ down: "less loft", up: "more loft" }}
        tooltip="The loft the face presents to the ball (dynamic loft). The standard amount depends on swing speed; add or take off up to 4°. More loft launches higher with more backspin and less ball speed, and curves less for the same face-to-path."
      />

      <Slider
        id="aim"
        name="Aim"
        display={describeAngle(values.aim, "right", "left", "straight")}
        range={AIM_VALUES}
        value={values.aim}
        onChange={(value) => handleValueChange("aim", value)}
        keys={SHORTCUTS.aim}
        keyHint={{ down: "left", up: "right" }}
        tooltip="Where you set up to hit, relative to the centre of the range. Face and path are measured from this line, so aiming turns the whole shot."
      />
    </>
  );
};

export default ParameterSelection;
