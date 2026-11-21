import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";

import ClubPads from "./components/simulator/club-pads";
import ButtonRow, { HitButton } from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import SettingsModal from "./components/simulator/settings-modal";
import GameCard from "./components/simulator/game-card";
import FlightMap from "./components/simulator/flight-map";
import LeaderboardModal from "./components/simulator/leaderboard-modal";
import { getLeaderboard } from "./players/api";
import { loadProfile } from "./players/profile";
import { flush, newGameId, recordShot } from "./players/queue";
import { identify, reportError, setContext, track } from "./analytics";
import {
  appReady,
  gameAbandoned,
  gameFinished,
  gameStarted,
  sceneErrorKind,
  shotLanded,
  targetAttempted,
} from "./analytics-events";
import { useQueryState, useSetQueries } from "./hooks/use-query";
import { ArrowCounterclockwise } from "react-bootstrap-icons";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import { previewShot } from "./simulate/shot-preview";
import { GRASSES, TURF_LIMITS, TURF_PRESETS } from "./simulate/ground";
import {
  randomTarget,
  randomAirTarget,
  easyTarget,
  describeMiss,
  GOALS,
} from "./simulate/game";
import { coachMiss } from "./simulate/coach";
import { FIRST, hasDone, markDone } from "./first-visit";
import { getClub, swingSpeedRange, DEFAULT_CLUB_ID } from "./simulate/clubs";
import { standardAttackAngle } from "./simulate/launch-conditions";
import { carryLimits, speedForCarry } from "./simulate/club-distances";
import {
  controlsFor,
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

// A scene that cannot be built (no WebGL) is reported, then still throws.
const guardScene = (create) => {
  try {
    return create();
  } catch (error) {
    reportError(sceneErrorKind(error), String(error.message).slice(0, 100));
    throw error;
  }
};
// The box the keyboard is on when the page opens and for each new shot: Aim
// where it is shown, else the club face.
const startControl = (controls) =>
  controls.includes("aim") ? "aim" : "clubFaceAngle";

// The query string is user-editable, so keep whatever it says on the sliders.
const clamp = (value, range) =>
  Number.isFinite(value)
    ? Math.min(range.MAX, Math.max(range.MIN, value))
    : range.DEFAULT;

// Shot controls and the query param each is saved under.
// Right edge of the shot panel on laptops: left-4 plus its 340px width.
const PANEL_RIGHT_PIXELS = 356;

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
  // The boxes this mode shows; the rest play at their defaults.
  const visible = controlsFor(mode);
  // Game, from practice, goes back to the difficulty last played.
  const lastGame = useRef("normal");
  if (mode !== "practice") lastGame.current = mode;
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
  const shot = Object.fromEntries(
    Object.entries({ ...saved, ...draft }).map(([control, value]) => [
      control,
      visible.includes(control) ? value : (ranges[control]?.DEFAULT ?? value),
    ]),
  );
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
    setContext({ viewport: isDesktop ? "laptop" : "phone" });
  }, [isDesktop]);
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
  // False once the bird's-eye card has gone back to the current shot: the
  // last shot's numbers and its line on the range are then put away.
  const [past, setPast] = useState(true);
  // True once the view has been dragged round, until it is reset.
  const [orbiting, setOrbiting] = useState(false);
  const [target, setTarget] = useState(null);
  // The shots of the game being played, one per target, oldest first.
  const [round, setRound] = useState([]);
  // Games finished and won since the mode or club was chosen.
  const [session, setSession] = useState(NO_SESSION);
  // The simulator's callbacks are created once, so they read these here.
  const game = useRef({ target: null, shots: [], goal: null, next: null });
  // The saved player, if this browser has one, and the leaderboard's answer
  // for them once a game is over.
  const [player, setPlayer] = useState(loadProfile);
  // First visit: Hit pulses with a prompt until the first shot.
  const [beckon, setBeckon] = useState(() => !hasDone(FIRST.shot));
  // What to change for the next target, after a miss.
  const [tip, setTip] = useState(null);
  const [board, setBoard] = useState(null);
  // Set when a shot has been scored, so the next target appears once the
  // camera is back.
  const targetDone = useRef(false);

  useEffect(() => {
    const sim = guardScene(() =>
      createSimulator(stage.current, {
        side,
        fleet: empire != null,
        // The golfer is on the tee: fade out the loading screen in index.html
        // once a frame with him in it has been drawn.
        onReady: ({ model } = {}) => {
          if (model === "figure_fallback") reportError("model_load_failed");
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              track(
                "app_ready",
                appReady({ loadMs: performance.now(), model }),
              );
              const loading = document.getElementById("loading");
              if (!loading) return;
              loading.addEventListener("transitionend", () => loading.remove());
              loading.classList.add("done");
            }),
          );
        },
        onOrbit: setOrbiting,
        onProgress: setLive,
        onResult: (shotResult) => {
          setResult(shotResult);
          setLive(null);
          // A shot only counts against the target it was hit at: changing club
          // mid-flight puts up a new one.
          const { target: aimedAt, goal } = game.current;
          track(
            "shot_landed",
            shotLanded({
              mode: game.current.mode,
              club: game.current.club,
              gameId: game.current.id,
              result: shotResult,
              controls: game.current.controls,
            }),
          );
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
            const played = {
              gameId: game.current.id,
              mode: game.current.mode,
              club: game.current.club,
            };
            if (shots.length === 1) track("game_started", gameStarted(played));
            markDone(FIRST.target);
            if (hit) setTip(null);
            else {
              const advice = coachMiss(
                shotResult.target,
                game.current.controls,
                game.current.side,
              );
              setTip(advice.text);
              track("coach_shown", {
                game_id: game.current.id,
                mode: game.current.mode,
                tip: advice.tip,
              });
            }
            track(
              "target_attempted",
              targetAttempted({
                ...played,
                target: aimedAt,
                outcome: shotResult.target,
                shotNumber: shots.length,
              }),
            );
            recordShot({
              gameId: game.current.id,
              mode: game.current.mode,
              club: game.current.club,
              targetYards: aimedAt.distanceYards,
              hit,
              shotId: newGameId(),
              playedAt: new Date().toISOString(),
            });
            if (shots.length === goal.targets) {
              const hits = shots.filter((shot) => shot.hit).length;
              const won = hits >= goal.toWin;
              track("game_finished", gameFinished({ ...played, hits, won }));
              if (won) {
                simulator.current?.celebrate?.(
                  hits === goal.targets ? "perfect" : "win",
                );
              }
              setSession((previous) => ({
                played: previous.played + 1,
                won: previous.won + (won ? 1 : 0),
              }));
            }
          }
        },
        onState: (state) => {
          // Every new shot starts with the keyboard on Aim.
          if (state === "address") setSelected(game.current.startControl);
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
      }),
    );
    simulator.current = sim;

    return () => {
      sim.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    simulator.current.setSide(side);
  }, [side]);

  // On laptops the shot panel lies over the left of the picture: tell the
  // scene how much, so it can keep the golfer clear of it.
  useEffect(() => {
    simulator.current.setViewInset(isDesktop ? PANEL_RIGHT_PIXELS : 0);
  }, [isDesktop]);

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
  // A game left part-played, by starting another or by closing the page.
  // `began` is what the game in hand was, since mode and club are already the
  // new ones when a new game starts.
  const reportAbandoned = () => {
    const { began, shots, id } = game.current;
    if (!began?.targets || !shots.length || shots.length >= began.targets)
      return;
    if (game.current.reported === id) return;
    game.current.reported = id;
    track(
      "game_abandoned",
      gameAbandoned({
        gameId: id,
        mode: began.mode,
        club: began.club,
        shotsTaken: shots.length,
      }),
    );
  };
  const startGame = () => {
    reportAbandoned();
    game.current.began = {
      mode: game.current.mode,
      club: game.current.club,
      targets: goal?.targets ?? 0,
    };
    targetDone.current = false;
    // A ball already in the air was not hit at the new game's first target.
    staleShot.current = true;
    game.current.shots = [];
    game.current.id = newGameId();
    setRound([]);
    setTip(null);
    // Someone who has never had a go at a target starts with one the stock
    // straight shot reaches.
    const easy =
      mode === "normal" && !hasDone(FIRST.target)
        ? easyTarget({ clubId: club.id, speed: speedRange.DEFAULT, turf })
        : null;
    setTarget((previous) => (goal ? easy || nextTarget(previous) : null));
  };
  game.current.goal = goal;
  game.current.next = nextTarget;
  game.current.target = target;
  game.current.mode = mode;
  game.current.club = club.id;
  game.current.controls = shot;
  game.current.side = side;
  game.current.startControl = startControl(visible);
  useEffect(() => {
    setSession(NO_SESSION);
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextTarget]);

  useEffect(() => {
    simulator.current.setTarget(target);
  }, [target]);

  useEffect(() => {
    simulator.current.showShot?.(past);
  }, [past]);

  useEffect(() => {
    window.addEventListener("pagehide", reportAbandoned);
    return () => window.removeEventListener("pagehide", reportAbandoned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const savePlayer = (saved) => {
    setPlayer(saved);
    identify(saved);
    // Anything held from the game being played goes under the new name.
    flush();
  };

  // Shots that could not be sent earlier go once the API can be reached.
  useEffect(() => {
    identify(loadProfile());
    flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, []);

  // After a game, or a name saved at the end of one: send its shots, then
  // ask where the player now stands.
  const gameOver = goal != null && round.length >= goal.targets;
  useEffect(() => {
    setBoard(null);
    if (!gameOver || !player) return undefined;
    let stale = false;
    flush()
      .then(() => getLeaderboard({ mode, period: "all", player: player.id }))
      .then((answer) => {
        if (!stale) setBoard(answer);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [gameOver, player, mode]);

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
    if (id !== club.id) {
      staleShot.current = true;
      track("setting_changed", { setting: "club", from: club.id, to: id });
    }
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
    else if (type === "mode") {
      // "game" is the bar's Game button: the difficulty last played.
      const next = newValue === "game" ? lastGame.current : newValue;
      if (next !== mode)
        track("setting_changed", { setting: "mode", from: mode, to: next });
      setQueries({ mode: next === "normal" ? null : next });
    }
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
    if (beckon) {
      markDone(FIRST.shot);
      setBeckon(false);
    }
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
  const [selected, setSelected] = useState(() => startControl(visible));
  // A mode that hides the box the keyboard was on moves it to the first one.
  useEffect(() => {
    setSelected((previous) =>
      visible.includes(previous) ? previous : startControl(visible),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

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
      setSelected((previous) => moveSelection(previous, pressed.key, visible));
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
    <div className="flex min-h-[100dvh] flex-col bg-slate-950 pb-[72px] text-white md:block md:pb-0">
      <div className="relative h-[50dvh] md:h-[100dvh]">
        <div id="display-container" ref={stage} className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3 md:p-4">
          {/* Above the shot readout: on a phone the finished card, with its
              name form, reaches down to it and must keep Play again in reach. */}
          <div className="pointer-events-auto relative z-30 ml-auto flex flex-col items-end gap-2">
            {goal && (
              <GameCard
                mode={mode}
                goal={goal}
                target={target}
                round={round}
                session={session}
                onRestart={startGame}
                player={player}
                board={board}
                onPlayer={savePlayer}
                onDifficulty={(value) => handleValueChange("mode", value)}
                tip={tip}
              />
            )}
            {/* Folded away to start with on phones, where the picture is
                small. */}
            <FlightMap
              result={result}
              target={target}
              startOpen={isDesktop}
              onPast={setPast}
            />
          </div>
        </div>
        {/* Along the bottom: the result bar with Hit to its right, the pair
            centred on the screen. On phones the bar takes the full width, above
            the corner buttons, and Hit is in the bar at the bottom of the
            screen. */}
        <div className="pointer-events-none absolute bottom-[60px] left-3 right-3 z-20 flex justify-center md:bottom-4 md:left-20 md:right-20">
          <div className="pointer-events-auto relative flex max-w-full items-stretch gap-2">
            <ShotReadout live={live} result={past ? result : null} />
            {isDesktop && (
              <HitButton
                onClick={handleHit}
                beckon={beckon}
                className="min-h-[52px] px-7"
              />
            )}
            {isDesktop && beckon && (
              <p
                data-first-shot
                className="absolute bottom-full right-0 mb-3 whitespace-nowrap rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-lg"
              >
                Press Hit or Space to take your first shot
              </p>
            )}
          </div>
        </div>
        {/* Back to the usual view, bottom right, once it has been dragged. */}
        {orbiting && (
          <div className="absolute bottom-3 right-3 z-20 md:bottom-4 md:right-4">
            <button
              type="button"
              aria-label="Reset view"
              className="hud-panel flex h-10 w-10 items-center justify-center !rounded-full text-white/90 transition-colors hover:text-white"
              onClick={() => simulator.current.resetView()}
            >
              <ArrowCounterclockwise size={18} />
            </button>
          </div>
        )}
        {/* Settings and the leaderboard, bottom left. */}
        <div className="absolute bottom-3 left-3 z-20 flex gap-2 md:bottom-4 md:left-4">
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
          <LeaderboardModal
            player={player}
            startMode={mode === "advanced" ? "advanced" : "normal"}
            onPlayer={savePlayer}
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
            views={isDesktop}
            controls={visible}
            preview={preview}
            onChange={handleValueChange}
            onClub={handleClub}
            onReset={handleReset}
          />
          {isDesktop && (
            <ButtonRow
              mode={mode}
              onMode={(value) => handleValueChange("mode", value)}
            />
          )}
        </div>
      </div>
      {/* Phones: mode and Hit stay at the bottom of the screen. Outside the
          panel, whose blur would otherwise pin the bar to itself. */}
      {!isDesktop && beckon && (
        <p
          data-first-shot
          className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-3 z-30 rounded-lg bg-lime-400 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-lg"
        >
          Tap Hit to take your first shot
        </p>
      )}
      {!isDesktop && (
        <ButtonRow
          bar
          beckon={beckon}
          mode={mode}
          onMode={(value) => handleValueChange("mode", value)}
          simulate={handleHit}
        />
      )}
    </div>
  );
}

export default App;
