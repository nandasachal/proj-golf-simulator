import React, { useEffect, useRef, useState } from "react";
import "./App.scss";
import { Toaster } from "react-hot-toast";
import { Tooltip } from "react-tooltip";

import Navbar from "./components/navbar";
import FloatingFeedbackButton from "./components/common/floating-feedback-button";
import ParameterSelection from "./components/simulator/parameter-selection";
import ButtonRow from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import SettingsModal from "./components/simulator/settings-modal";
import ClubViews from "./components/simulator/club-views";
import GameCard from "./components/simulator/game-card";
import { useQueryState, useSetQueries } from "./hooks/use-query";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import { GRASSES, TURF_LIMITS, TURF_PRESETS } from "./simulate/ground";
import { randomTarget } from "./simulate/game";
import { shortcutFor, shouldIgnoreKey } from "./utils/shortcuts";
import {
  AIM_VALUES,
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
  SWING_SPEED_VALUES,
} from "./utils/constant";

const DESKTOP_QUERY = "(min-width: 768px)";

// The query string is user-editable, so keep whatever it says on the sliders.
const clamp = (value, range) =>
  Number.isFinite(value)
    ? Math.min(range.MAX, Math.max(range.MIN, value))
    : range.DEFAULT;

// Turf fields and the query params that carry a custom value for each.
const TURF_PARAMS = {
  mowHeightInches: "cut",
  firmness: "firm",
  leafWetness: "wet",
  grass: "grass",
};
const CLEAR_TURF_OVERRIDES = { cut: null, firm: null, wet: null, grass: null };
const TURF_FIELDS = ["mowHeightInches", "firmness", "leafWetness"];
const NO_SCORE = { hits: 0, attempts: 0, streak: 0 };

// A preset with any custom values from the URL laid over it.
function turfConditions(presetKey, query) {
  const conditions = { ...TURF_PRESETS[presetKey] };
  for (const field of TURF_FIELDS) {
    const value = Number.parseFloat(query[TURF_PARAMS[field]]);
    const { min, max } = TURF_LIMITS[field];
    if (Number.isFinite(value)) {
      conditions[field] = Math.min(max, Math.max(min, value));
    }
  }
  if (GRASSES[query.grass]) conditions.grass = query.grass;
  return conditions;
}

const matchingPreset = (conditions) =>
  Object.keys(TURF_PRESETS).find((key) =>
    [...TURF_FIELDS, "grass"].every(
      (field) => TURF_PRESETS[key][field] === conditions[field],
    ),
  ) || null;

function App() {
  const [rawSide, setSide] = useQueryState("side", "Right", false);
  const [rawFace, setFaceAngle] = useQueryState(
    "face",
    CLUB_FACE_ANGLE_VALUES.DEFAULT,
    true,
  );
  const [rawPath, setPathAngle] = useQueryState(
    "path",
    CLUB_PATH_ANGLE_VALUES.DEFAULT,
    true,
  );
  const [rawSpeed, setSwingSpeed] = useQueryState(
    "speed",
    SWING_SPEED_VALUES.DEFAULT,
    true,
  );

  const [rawAim, setAim] = useQueryState("aim", AIM_VALUES.DEFAULT, true);

  const [rawTurf] = useQueryState("turf", "normal", false);
  const [cut] = useQueryState("cut", null, false);
  const [firm] = useQueryState("firm", null, false);
  const [wet] = useQueryState("wet", null, false);
  const [grass] = useQueryState("grass", null, false);
  const [rawMode] = useQueryState("mode", "practice", false);
  const setQueries = useSetQueries();

  const turf = turfConditions(TURF_PRESETS[rawTurf] ? rawTurf : "normal", {
    cut,
    firm,
    wet,
    grass,
  });
  const turfPreset = matchingPreset(turf);
  const mode = rawMode === "game" ? "game" : "practice";
  const side = rawSide === "Left" ? "Left" : "Right";
  const faceAngle = clamp(rawFace, CLUB_FACE_ANGLE_VALUES);
  const pathAngle = clamp(rawPath, CLUB_PATH_ANGLE_VALUES);
  const swingSpeed = clamp(rawSpeed, SWING_SPEED_VALUES);
  const aim = clamp(rawAim, AIM_VALUES);

  const simulator = useRef(null);
  const stage = useRef(null);
  const panel = useRef(null);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);
  const [target, setTarget] = useState(null);
  const [score, setScore] = useState(NO_SCORE);
  // How the last shot did against the target that is still up.
  const [outcome, setOutcome] = useState(null);
  // Set when a target is hit, so the next one appears once the camera is back.
  const targetHit = useRef(false);

  useEffect(() => {
    const sim = createSimulator(stage.current, {
      side,
      onProgress: setLive,
      onResult: (shotResult) => {
        setResult(shotResult);
        setLive(null);
        if (shotResult.target) {
          const { hit } = shotResult.target;
          setOutcome(shotResult.target);
          targetHit.current = hit;
          setScore((previous) => ({
            hits: previous.hits + (hit ? 1 : 0),
            attempts: previous.attempts + 1,
            streak: hit ? previous.streak + 1 : 0,
          }));
        }
      },
      onState: (state) => {
        if (state === "address" && targetHit.current) {
          targetHit.current = false;
          setOutcome(null);
          setTarget((previous) => randomTarget(Math.random, previous));
        }
      },
    });
    simulator.current = sim;

    // On desktop the controls float over the left of the scene, so centre
    // the view in what's left rather than behind the panel.
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const updateInset = () =>
      sim.setViewInset(
        desktop.matches ? panel.current.getBoundingClientRect().right : 0,
      );
    updateInset();
    window.addEventListener("resize", updateInset);

    return () => {
      window.removeEventListener("resize", updateInset);
      sim.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    simulator.current.setSide(side);
  }, [side]);

  useEffect(() => {
    simulator.current.setAim(aim);
  }, [aim]);

  // Entering game mode puts up a first target; leaving it clears the range.
  useEffect(() => {
    targetHit.current = false;
    setScore(NO_SCORE);
    setOutcome(null);
    setTarget(mode === "game" ? randomTarget() : null);
  }, [mode]);

  useEffect(() => {
    simulator.current.setTarget(target);
  }, [target]);

  const handleNewTarget = () => {
    targetHit.current = false;
    setOutcome(null);
    setTarget((previous) => randomTarget(Math.random, previous));
  };

  const handleTurfPreset = (key) =>
    setQueries({ turf: key, ...CLEAR_TURF_OVERRIDES });

  // Changing one field keeps the others as they are now, even if they came
  // from a preset.
  const handleTurfField = (field, value) =>
    setQueries({
      [TURF_PARAMS.mowHeightInches]: turf.mowHeightInches,
      [TURF_PARAMS.firmness]: turf.firmness,
      [TURF_PARAMS.leafWetness]: turf.leafWetness,
      [TURF_PARAMS.grass]: turf.grass,
      [TURF_PARAMS[field]]: value,
    });

  const handleValueChange = (type, newValue) => {
    if (type === "side") setSide(newValue);
    else if (type === "clubFaceAngle") setFaceAngle(newValue);
    else if (type === "clubPathAngle") setPathAngle(newValue);
    else if (type === "swingSpeed") setSwingSpeed(newValue);
    else if (type === "aim") setAim(newValue);
    else if (type === "turf") handleTurfPreset(newValue);
    else if (type === "mode")
      setQueries({ mode: newValue === "game" ? "game" : null });
  };

  // Back to the default shot. Settings (mode, side, turf) stay as they are.
  const handleReset = () =>
    setQueries({ face: null, path: null, speed: null, aim: null });

  const handleHit = () => {
    setResult(null);
    setLive(null);
    setOutcome(null);
    simulator.current.hit(
      launchConditions({
        faceAngle,
        pathAngle,
        swingSpeedMPH: swingSpeed,
        side,
      }),
      side,
      turf,
      aim,
    );
  };

  // Keyboard shortcuts for the shot controls. The handler is replaced every
  // render so it always sees the current values.
  const onShortcut = useRef(null);
  onShortcut.current = (event) => {
    if (shouldIgnoreKey(event)) return;
    // Leave the keyboard alone while the settings dialog is open.
    if (document.querySelector('[role="dialog"]')) return;
    const shortcut = shortcutFor(event.key);
    if (!shortcut) return;
    event.preventDefault();
    if (shortcut.action === "hit") handleHit();
    else if (shortcut.action === "reset") handleReset();
    else {
      const [value, range] = {
        clubFaceAngle: [faceAngle, CLUB_FACE_ANGLE_VALUES],
        clubPathAngle: [pathAngle, CLUB_PATH_ANGLE_VALUES],
        swingSpeed: [swingSpeed, SWING_SPEED_VALUES],
        aim: [aim, AIM_VALUES],
      }[shortcut.control];
      const next = clamp(value + shortcut.direction * range.STEP, range);
      if (next !== value) handleValueChange(shortcut.control, next);
    }
  };
  useEffect(() => {
    const listener = (event) => onShortcut.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-white md:block">
      <Toaster />
      <Tooltip id="main-tooltip" style={{ maxWidth: "280px", zIndex: 50 }} />

      <div className="relative h-[50dvh] md:h-[100dvh]">
        <div id="display-container" ref={stage} className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3 md:p-4">
          <div className="pointer-events-auto md:hidden">
            <Navbar />
          </div>
          <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
            {target && (
              <GameCard
                target={target}
                score={score}
                outcome={outcome}
                onNewTarget={handleNewTarget}
              />
            )}
          </div>
        </div>
        {/* Result bar along the bottom, centred on the screen. On phones it
            takes the full width and the feedback button sits above it. */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex justify-center md:bottom-4 md:left-20 md:right-20">
          <div className="pointer-events-auto max-w-full">
            <ShotReadout live={live} result={result} />
          </div>
        </div>
        <div className="absolute bottom-[84px] right-3 md:bottom-4 md:right-4">
          <FloatingFeedbackButton />
        </div>
      </div>

      {/* Left column: the shot controls, then the club-at-impact views. */}
      <div className="z-10 m-3 flex flex-col gap-2 md:absolute md:left-4 md:top-4 md:m-0 md:max-h-[calc(100dvh-2rem)] md:w-[340px] md:overflow-y-auto">
        <div ref={panel} className="hud-panel p-4">
          <div className="mb-4 flex items-center justify-between">
            <div className="hidden md:block">
              <Navbar />
            </div>
            <p className="text-sm font-bold md:hidden">Shot setup</p>
            <SettingsModal
              mode={mode}
              side={side}
              turf={turf}
              turfPreset={turfPreset}
              onMode={(value) => handleValueChange("mode", value)}
              onSide={(value) => handleValueChange("side", value)}
              onTurfPreset={handleTurfPreset}
              onTurfField={handleTurfField}
            />
          </div>
          <ParameterSelection
            values={{
              clubFaceAngle: faceAngle,
              clubPathAngle: pathAngle,
              swingSpeed,
              aim,
              side,
            }}
            handleValueChange={handleValueChange}
          />
          <ButtonRow handleReset={handleReset} simulate={handleHit} />
        </div>
        <ClubViews
          faceAngle={faceAngle}
          pathAngle={pathAngle}
          swingSpeed={swingSpeed}
          aim={aim}
          side={side}
        />
      </div>
    </div>
  );
}

export default App;
