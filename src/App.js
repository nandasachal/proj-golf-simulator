import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";
import { Toaster } from "react-hot-toast";
import { Tooltip } from "react-tooltip";

import ClubPads from "./components/simulator/club-pads";
import ButtonRow, { HitButton } from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import SettingsModal from "./components/simulator/settings-modal";
import ClubView from "./components/simulator/club-view";
import GameCard from "./components/simulator/game-card";
import { useQueryState, useSetQueries } from "./hooks/use-query";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import { previewShot } from "./simulate/shot-preview";
import { GRASSES, TURF_LIMITS, TURF_PRESETS } from "./simulate/ground";
import { randomTarget } from "./simulate/game";
import { shortcutFor, shouldIgnoreKey } from "./utils/shortcuts";
import {
  AIM_VALUES,
  ATTACK_ANGLE_VALUES,
  LOFT_CHANGE_VALUES,
  STRIKE_VALUES,
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

// Shot controls and the query param each is saved under.
const SHOT_PARAMS = {
  clubFaceAngle: "face",
  clubPathAngle: "path",
  swingSpeed: "speed",
  aim: "aim",
  attackAngle: "attack",
  loftChange: "loft",
  strike: "strike",
};
const SHOT_RANGES = {
  clubFaceAngle: CLUB_FACE_ANGLE_VALUES,
  clubPathAngle: CLUB_PATH_ANGLE_VALUES,
  swingSpeed: SWING_SPEED_VALUES,
  aim: AIM_VALUES,
  attackAngle: ATTACK_ANGLE_VALUES,
  loftChange: LOFT_CHANGE_VALUES,
  strike: STRIKE_VALUES,
};
// How long the shot controls must be still before the URL is updated.
const URL_SETTLE_MS = 250;

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
  const [rawFace] = useQueryState("face", CLUB_FACE_ANGLE_VALUES.DEFAULT, true);
  const [rawPath] = useQueryState("path", CLUB_PATH_ANGLE_VALUES.DEFAULT, true);
  const [rawSpeed] = useQueryState("speed", SWING_SPEED_VALUES.DEFAULT, true);

  const [rawAim] = useQueryState("aim", AIM_VALUES.DEFAULT, true);
  const [rawAttack] = useQueryState(
    "attack",
    ATTACK_ANGLE_VALUES.DEFAULT,
    true,
  );
  const [rawLoft] = useQueryState("loft", LOFT_CHANGE_VALUES.DEFAULT, true);

  const [rawTurf] = useQueryState("turf", "normal", false);
  const [cut] = useQueryState("cut", null, false);
  const [firm] = useQueryState("firm", null, false);
  const [wet] = useQueryState("wet", null, false);
  const [grass] = useQueryState("grass", null, false);
  const [rawStrike] = useQueryState("strike", STRIKE_VALUES.DEFAULT, false);
  const [rawMode] = useQueryState("mode", "game", false);
  const setQueries = useSetQueries();

  const turf = turfConditions(TURF_PRESETS[rawTurf] ? rawTurf : "normal", {
    cut,
    firm,
    wet,
    grass,
  });
  const turfPreset = matchingPreset(turf);
  // Game mode unless the URL says practice.
  const mode = rawMode === "practice" ? "practice" : "game";
  const side = rawSide === "Left" ? "Left" : "Right";
  // Shot controls change many times a second while a handle is dragged or a
  // key is held. Those changes live here first and are written to the URL
  // once they settle: browsers cap how often the URL may be rewritten
  // (Safari: 100 times in 30 seconds) and throw past that.
  const [draft, setDraft] = useState({});
  const saved = {
    clubFaceAngle: clamp(rawFace, CLUB_FACE_ANGLE_VALUES),
    clubPathAngle: clamp(rawPath, CLUB_PATH_ANGLE_VALUES),
    swingSpeed: clamp(rawSpeed, SWING_SPEED_VALUES),
    aim: clamp(rawAim, AIM_VALUES),
    attackAngle: clamp(rawAttack, ATTACK_ANGLE_VALUES),
    loftChange: clamp(rawLoft, LOFT_CHANGE_VALUES),
    strike: clamp(Number.parseFloat(rawStrike), STRIKE_VALUES),
  };
  const shot = { ...saved, ...draft };
  const {
    clubFaceAngle: faceAngle,
    clubPathAngle: pathAngle,
    swingSpeed,
    aim,
    attackAngle,
    loftChange,
    strike,
  } = shot;

  useEffect(() => {
    if (Object.keys(draft).length === 0) return undefined;
    const timer = setTimeout(() => {
      setQueries(
        Object.fromEntries(
          Object.entries(draft).map(([control, value]) => [
            SHOT_PARAMS[control],
            value,
          ]),
        ),
      );
      setDraft({});
    }, URL_SETTLE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  // Laptop and up: Hit sits beside the result bar. Phones: with the controls.
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );
  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(desktop.matches);
    desktop.addEventListener("change", update);
    return () => desktop.removeEventListener("change", update);
  }, []);

  const [showCloseUp, setShowCloseUp] = useState(false);
  // On a short screen the close-up opens below the fold of the left column:
  // bring it into view instead of leaving only its tab strip showing.
  const closeUpToggle = useRef(null);
  useEffect(() => {
    if (showCloseUp) {
      closeUpToggle.current.nextElementSibling?.scrollIntoView?.({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [showCloseUp]);

  // What this setup will do, shown while it is being adjusted.
  const preview = useMemo(
    () =>
      previewShot({
        faceAngle,
        pathAngle,
        swingSpeedMPH: swingSpeed,
        attackAngle,
        loftChange,
        strikeInches: strike,
        aim,
        side,
      }),
    [
      faceAngle,
      pathAngle,
      swingSpeed,
      attackAngle,
      loftChange,
      strike,
      aim,
      side,
    ],
  );

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
    else if (SHOT_PARAMS[type])
      setDraft((previous) => ({ ...previous, [type]: newValue }));
    else if (type === "turf") handleTurfPreset(newValue);
    else if (type === "mode")
      setQueries({ mode: newValue === "practice" ? "practice" : null });
  };

  // Back to the default shot. Settings (mode, side, turf) stay as they are.
  const handleReset = () => {
    setDraft({});
    setQueries({
      face: null,
      path: null,
      speed: null,
      aim: null,
      attack: null,
      loft: null,
      strike: null,
    });
  };

  // The link for Share: the address bar plus anything not yet written to it.
  const shareUrl = () => {
    const url = new URL(window.location.href);
    for (const [control, value] of Object.entries(draft)) {
      url.searchParams.set(SHOT_PARAMS[control], value);
    }
    return url.toString();
  };

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
        attackAngle,
        loftChange,
        strikeInches: strike,
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
      // Step from the latest value, not the one this render saw: key
      // repeats can arrive faster than the screen redraws.
      const { control, direction } = shortcut;
      const range = SHOT_RANGES[control];
      setDraft((previous) => ({
        ...previous,
        [control]: clamp(
          (previous[control] ?? saved[control]) + direction * range.STEP,
          range,
        ),
      }));
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
        {/* Along the bottom: the result bar with Hit to its right, the pair
            centred on the screen. On phones the bar takes the full width and
            Hit stays with the controls below. */}
        <div className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 flex justify-center md:bottom-4 md:left-20 md:right-20">
          <div className="pointer-events-auto flex max-w-full items-stretch gap-2">
            <ShotReadout live={live} result={result} />
            {isDesktop && (
              <HitButton onClick={handleHit} className="min-h-[52px] px-7" />
            )}
          </div>
        </div>
        {/* Settings, bottom left (above the result bar on phones). */}
        <div className="absolute bottom-[84px] left-3 z-20 md:bottom-4 md:left-4">
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
      </div>

      {/* Left column: the shot controls, then the club-at-impact views. */}
      <div className="z-10 m-3 flex flex-col gap-2 md:absolute md:left-4 md:top-4 md:m-0 md:max-h-[calc(100dvh-5.5rem)] md:w-[340px] md:overflow-y-auto">
        <div ref={panel} className="hud-panel p-4 md:p-3">
          <ClubPads
            values={{
              clubFaceAngle: faceAngle,
              clubPathAngle: pathAngle,
              swingSpeed,
              aim,
              attackAngle,
              loftChange,
              strike,
            }}
            side={side}
            preview={preview}
            onChange={handleValueChange}
          />
          <ButtonRow
            getShareUrl={shareUrl}
            handleReset={handleReset}
            simulate={handleHit}
            showHit={!isDesktop}
          />
        </div>
        <button
          type="button"
          className="hud-panel flex h-9 items-center justify-between px-3 text-xs font-semibold text-white/80 hover:text-white"
          ref={closeUpToggle}
          aria-expanded={showCloseUp}
          onClick={() => setShowCloseUp((shown) => !shown)}
        >
          3D close-up
          <span aria-hidden="true">{showCloseUp ? "Hide" : "Show"}</span>
        </button>
        {showCloseUp && (
          <ClubView
            faceAngle={faceAngle}
            pathAngle={pathAngle}
            swingSpeed={swingSpeed}
            aim={aim}
            attackAngle={attackAngle}
            loftChange={loftChange}
            strike={strike}
            side={side}
          />
        )}
      </div>
    </div>
  );
}

export default App;
