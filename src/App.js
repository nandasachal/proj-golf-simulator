import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";
import { Tooltip } from "react-tooltip";

import ClubPads from "./components/simulator/club-pads";
import ButtonRow, { HitButton } from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import SettingsModal from "./components/simulator/settings-modal";
import GameCard from "./components/simulator/game-card";
import { useQueryState, useSetQueries } from "./hooks/use-query";
import { ArrowCounterclockwise } from "react-bootstrap-icons";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import { previewShot } from "./simulate/shot-preview";
import { GRASSES, TURF_LIMITS, TURF_PRESETS } from "./simulate/ground";
import {
  randomTarget,
  randomAirTarget,
  describeMiss,
  GOALS,
} from "./simulate/game";
import { getClub, swingSpeedRange, DEFAULT_CLUB_ID } from "./simulate/clubs";
import { standardAttackAngle } from "./simulate/launch-conditions";
import { carryLimits, speedForCarry } from "./simulate/club-distances";
import {
  FIRST_CONTROL,
  keyAction,
  moveSelection,
  shouldIgnoreKey,
  stepState,
} from "./utils/shortcuts";
import { snap } from "./utils/club-handles";
import {
  AIM_VALUES,
  ATTACK_ANGLE_VALUES,
  LOFT_CHANGE_VALUES,
  STRIKE_VALUES,
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
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
  aim: AIM_VALUES,
  loftChange: LOFT_CHANGE_VALUES,
  strike: STRIKE_VALUES,
};
// Game targets a club can reach: from a soft swing's carry to a full one's.
const targetReach = (clubId) => {
  if (clubId === DEFAULT_CLUB_ID) return undefined;
  const { min, max } = carryLimits(clubId);
  return { nearest: min, farthest: max };
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
const NO_SESSION = { played: 0, won: 0 };

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
  const [rawClub] = useQueryState("club", DEFAULT_CLUB_ID, false);
  // Hidden: ?empire puts a fleet in the sky. Read once, when the scene is built.
  const [empire] = useQueryState("empire", null, false);
  const club = getClub(rawClub);
  // Swing speeds set for this session by editing a club's distance in
  // Settings. Not saved anywhere: a reload goes back to the stock distances.
  const [clubSpeeds, setClubSpeeds] = useState({});
  // Swing speed and attack angle depend on the club in hand: a 7 iron is
  // swung slower than a driver and hit down on.
  const speedRange = useMemo(() => {
    const range = swingSpeedRange(club);
    return { ...range, DEFAULT: clubSpeeds[club.id] ?? range.DEFAULT };
  }, [club, clubSpeeds]);
  const attackRange = useMemo(
    () => ({ ...ATTACK_ANGLE_VALUES, DEFAULT: standardAttackAngle(club) }),
    [club],
  );
  const ranges = useMemo(
    () => ({
      ...SHOT_RANGES,
      swingSpeed: speedRange,
      attackAngle: attackRange,
    }),
    [speedRange, attackRange],
  );
  const [rawSpeed] = useQueryState("speed", null, false);

  const [rawAim] = useQueryState("aim", AIM_VALUES.DEFAULT, true);
  const [rawAttack] = useQueryState("attack", null, false);
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
  // A normal game unless the URL says practice or advanced.
  const mode = ["practice", "advanced"].includes(rawMode) ? rawMode : "normal";
  const side = rawSide === "Left" ? "Left" : "Right";
  // Shot controls change many times a second while a handle is dragged or a
  // key is held. Those changes live here first and are written to the URL
  // once they settle: browsers cap how often the URL may be rewritten
  // (Safari: 100 times in 30 seconds) and throw past that.
  const [draft, setDraft] = useState({});
  const saved = {
    clubFaceAngle: clamp(rawFace, CLUB_FACE_ANGLE_VALUES),
    clubPathAngle: clamp(rawPath, CLUB_PATH_ANGLE_VALUES),
    swingSpeed: clamp(Number.parseFloat(rawSpeed), speedRange),
    aim: clamp(rawAim, AIM_VALUES),
    attackAngle: clamp(Number.parseFloat(rawAttack), attackRange),
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
        club: club.id,
      }),
    [
      club,
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

  // Set when the club (and so the target) changes, until the next hit: a
  // ball already in the air was not aimed at the new target.
  const staleShot = useRef(false);
  const simulator = useRef(null);
  const stage = useRef(null);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);
  // True once the view has been dragged round, until it is reset.
  const [orbiting, setOrbiting] = useState(false);
  const [target, setTarget] = useState(null);
  // The shots of the game being played, one per target, oldest first.
  const [round, setRound] = useState([]);
  // Games finished and won since the mode or club was chosen.
  const [session, setSession] = useState(NO_SESSION);
  // The simulator's callbacks are created once, so they read these here.
  const game = useRef({ target: null, shots: [], goal: null, next: null });
  // Set when a shot has been scored, so the next target appears once the
  // camera is back.
  const targetDone = useRef(false);

  useEffect(() => {
    const sim = createSimulator(stage.current, {
      side,
      fleet: empire != null,
      onOrbit: setOrbiting,
      onProgress: setLive,
      onResult: (shotResult) => {
        setResult(shotResult);
        setLive(null);
        // A shot only counts against the target it was hit at: changing club
        // mid-flight puts up a new one.
        const { target: aimedAt, goal } = game.current;
        if (
          shotResult.target &&
          !staleShot.current &&
          aimedAt &&
          !targetDone.current
        ) {
          const { hit } = shotResult.target;
          const shots = [
            ...game.current.shots,
            {
              hit,
              distanceYards: aimedAt.distanceYards,
              heightYards: aimedAt.heightYards,
              miss: hit ? null : describeMiss(shotResult.target),
            },
          ];
          game.current.shots = shots;
          setRound(shots);
          targetDone.current = true;
          if (shots.length === goal.targets) {
            const won = shots.filter((shot) => shot.hit).length >= goal.toWin;
            setSession((previous) => ({
              played: previous.played + 1,
              won: previous.won + (won ? 1 : 0),
            }));
          }
        }
      },
      onState: (state) => {
        if (state === "address" && targetDone.current) {
          targetDone.current = false;
          const { shots, goal, next } = game.current;
          // The game is over after the last target: the range is cleared
          // until a new game is started.
          setTarget((previous) =>
            shots.length >= goal.targets ? null : next(previous),
          );
        }
      },
    });
    simulator.current = sim;

    return () => {
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

  useEffect(() => {
    simulator.current.setClub(club);
  }, [club]);

  // Entering game mode puts up a first target; leaving it clears the range.
  // A change of club starts again too, with targets that club can reach.
  const reach = useMemo(() => targetReach(club.id), [club]);
  const goal = GOALS[mode] || null;
  // Normal targets are on the ground, advanced ones in the air.
  const nextTarget = useMemo(
    () =>
      mode === "advanced"
        ? (previous) => randomAirTarget(Math.random, previous, club.id)
        : (previous) => randomTarget(Math.random, previous, reach),
    [mode, club, reach],
  );
  const startGame = () => {
    targetDone.current = false;
    // A ball already in the air was not hit at the new game's first target.
    staleShot.current = true;
    game.current.shots = [];
    setRound([]);
    setTarget((previous) => (goal ? nextTarget(previous) : null));
  };
  game.current.goal = goal;
  game.current.next = nextTarget;
  game.current.target = target;
  useEffect(() => {
    setSession(NO_SESSION);
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTarget]);

  useEffect(() => {
    simulator.current.setTarget(target);
  }, [target]);

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

  // Swing speed, attack angle and loft belong to the club, so a new club
  // starts from its own.
  const handleClub = (id) => {
    if (id !== club.id) staleShot.current = true;
    setDraft(
      ({
        swingSpeed: _speed,
        attackAngle: _attack,
        loftChange: _loft,
        ...rest
      }) => rest,
    );
    setQueries({
      club: id === DEFAULT_CLUB_ID ? null : id,
      speed: null,
      attack: null,
      loft: null,
    });
  };

  // A club's stock carry, set for this session: it becomes the swing speed
  // that carries that far, and the club's default from then on.
  const handleClubCarry = (id, yards) => {
    setClubSpeeds((previous) => ({
      ...previous,
      [id]: speedForCarry(id, yards),
    }));
    if (id === club.id) {
      setDraft(({ swingSpeed: _speed, ...rest }) => rest);
      setQueries({ speed: null });
    }
  };
  const handleResetCarries = () => {
    setClubSpeeds({});
  };

  const handleValueChange = (type, newValue) => {
    if (type === "side") setSide(newValue);
    else if (SHOT_PARAMS[type])
      setDraft((previous) => ({ ...previous, [type]: newValue }));
    else if (type === "turf") handleTurfPreset(newValue);
    else if (type === "mode")
      setQueries({ mode: newValue === "normal" ? null : newValue });
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

  const handleHit = () => {
    setResult(null);
    setLive(null);
    staleShot.current = false;
    // Hitting again before the camera is back still moves on to the next
    // target: every target gets one shot.
    if (targetDone.current) {
      targetDone.current = false;
      const { shots, next } = game.current;
      const upNext = shots.length >= goal.targets ? null : next(target);
      game.current.target = upNext;
      simulator.current.setTarget(upNext);
      setTarget(upNext);
    }
    simulator.current.hit(
      launchConditions({
        faceAngle,
        pathAngle,
        swingSpeedMPH: swingSpeed,
        side,
        attackAngle,
        loftChange,
        strikeInches: strike,
        club: club.id,
      }),
      side,
      turf,
      aim,
    );
  };

  // The value box the keyboard is on: arrows move it, Command-arrows change
  // its value.
  const [selected, setSelected] = useState(FIRST_CONTROL);

  // Keyboard control of the shot. The handler is replaced every render so it
  // always sees the current values.
  const onShortcut = useRef(null);
  onShortcut.current = (event) => {
    if (shouldIgnoreKey(event)) return;
    // Leave the keyboard alone while the settings dialog or the club list is
    // open.
    if (document.querySelector('[role="dialog"], [role="listbox"]')) return;
    const pressed = keyAction(event);
    if (!pressed) return;
    event.preventDefault();
    if (pressed.action === "hit") handleHit();
    else if (pressed.action === "move") {
      // A focused handle or value would otherwise look selected too.
      document.activeElement?.blur?.();
      setSelected((previous) => moveSelection(previous, pressed.key));
    } else {
      // Step from the latest value, not the one this render saw: key
      // repeats can arrive faster than the screen redraws.
      const range = ranges[selected];
      setDraft((previous) => {
        const value = previous[selected] ?? saved[selected];
        return {
          ...previous,
          [selected]:
            pressed.action === "adjust"
              ? snap(value + pressed.direction * range.STEP, range)
              : stepState(selected, value, pressed.direction, range),
        };
      });
    }
  };
  useEffect(() => {
    const listener = (event) => onShortcut.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 text-white md:block">
      <Tooltip id="main-tooltip" style={{ maxWidth: "280px", zIndex: 50 }} />

      <div className="relative h-[50dvh] md:h-[100dvh]">
        <div id="display-container" ref={stage} className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3 md:p-4">
          <div className="pointer-events-auto ml-auto flex flex-col items-end gap-2">
            {goal && (
              <GameCard
                mode={mode}
                goal={goal}
                target={target}
                round={round}
                session={session}
                onRestart={startGame}
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
        {/* Back to the usual view, bottom right, once it has been dragged. */}
        {orbiting && (
          <div className="absolute bottom-[84px] right-3 z-20 md:bottom-4 md:right-4">
            <button
              type="button"
              aria-label="Reset view"
              className="hud-panel flex h-10 w-10 items-center justify-center !rounded-full text-white/90 transition-colors hover:text-white"
              onClick={() => simulator.current.resetView()}
              data-tooltip-id="main-tooltip"
              data-tooltip-content="Reset view"
            >
              <ArrowCounterclockwise size={18} />
            </button>
          </div>
        )}
        {/* Settings, bottom left (above the result bar on phones). */}
        <div className="absolute bottom-[84px] left-3 z-20 md:bottom-4 md:left-4">
          <SettingsModal
            side={side}
            turf={turf}
            turfPreset={turfPreset}
            onSide={(value) => handleValueChange("side", value)}
            onTurfPreset={handleTurfPreset}
            onTurfField={handleTurfField}
            club={club}
            clubSpeeds={clubSpeeds}
            onClub={handleClub}
            onClubCarry={handleClubCarry}
            onResetCarries={handleResetCarries}
          />
        </div>
      </div>

      {/* Left column: the shot controls, then the club-at-impact views. */}
      <div className="z-10 m-3 flex flex-col gap-2 md:absolute md:left-4 md:top-4 md:m-0 md:max-h-[calc(100dvh-5.5rem)] md:w-[340px] md:overflow-y-auto">
        <div className="hud-panel p-4">
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
            club={club}
            ranges={ranges}
            selected={selected}
            onSelect={setSelected}
            preview={preview}
            onChange={handleValueChange}
            onClub={handleClub}
            onReset={handleReset}
          />
          <ButtonRow
            mode={mode}
            onMode={(value) => handleValueChange("mode", value)}
            simulate={handleHit}
            showHit={!isDesktop}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
