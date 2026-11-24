import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.scss";

import ClubPads from "./components/simulator/club-pads";
import ButtonRow, { PhoneBar } from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import SettingsModal from "./components/simulator/settings-modal";
import GameCard, { GameRow } from "./components/simulator/game-card";
import OverheadTags from "./components/simulator/overhead-tags";
import LeaderboardModal from "./components/simulator/leaderboard-modal";
import EmpireScreen from "./components/simulator/empire-screen";
import { getLeaderboard } from "./players/api";
import { clearProfile, loadProfile } from "./players/profile";
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
import { ArrowCounterclockwise, Map as MapIcon } from "react-bootstrap-icons";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import { previewShot } from "./simulate/shot-preview";
import { GRASSES, TURF_LIMITS, TURF_PRESETS } from "./simulate/ground";
import {
  randomTarget,
  shapedTarget,
  shapedAirTarget,
  easyTarget,
  describeMiss,
  GOALS,
} from "./simulate/game";
import { coachMiss } from "./simulate/coach";
import {
  AUTO_CLUB_OFF,
  FIRST,
  STAR_WARS,
  hasDone,
  markDone,
  remember,
} from "./first-visit";
import { getClub, swingSpeedRange, DEFAULT_CLUB_ID } from "./simulate/clubs";
import { bagReach, pickClub } from "./simulate/auto-club";
import { standardAttackAngle } from "./simulate/launch-conditions";
import { carryLimits, speedForCarry } from "./simulate/club-distances";
import {
  keyAction,
  moveSelection,
  shouldIgnoreKey,
  stepState,
} from "./utils/shortcuts";
import { nudge } from "./utils/club-handles";
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
// How long the last shot's stats and line stay once the next target is up.
const SHOT_LINGER_MS = 10000;
// How long a finished game stays up before the next one starts by itself.
const NEXT_GAME_MS = 10000;

// The box the keyboard is on when the page opens and for each new shot.
const START_CONTROL = "aim";

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
  // Typed values can carry two decimals, so these are read as decimals.
  const [rawFace] = useQueryState(
    "face",
    CLUB_FACE_ANGLE_VALUES.DEFAULT,
    false,
  );
  const [rawPath] = useQueryState(
    "path",
    CLUB_PATH_ANGLE_VALUES.DEFAULT,
    false,
  );
  const [rawClub] = useQueryState("club", DEFAULT_CLUB_ID, false);
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

  const [rawAim] = useQueryState("aim", AIM_VALUES.DEFAULT, false);
  const [rawAttack] = useQueryState("attack", null, false);
  const [rawLoft] = useQueryState("loft", LOFT_CHANGE_VALUES.DEFAULT, false);

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
  // An easy game ("normal") unless the URL says practice, medium or hard
  // ("advanced", the name it is stored under).
  const mode =
    {
      practice: "practice",
      medium: "medium",
      advanced: "advanced",
      hard: "advanced",
    }[rawMode] || "normal";
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
    clubFaceAngle: clamp(Number.parseFloat(rawFace), CLUB_FACE_ANGLE_VALUES),
    clubPathAngle: clamp(Number.parseFloat(rawPath), CLUB_PATH_ANGLE_VALUES),
    swingSpeed: clamp(Number.parseFloat(rawSpeed), speedRange),
    aim: clamp(Number.parseFloat(rawAim), AIM_VALUES),
    attackAngle: clamp(Number.parseFloat(rawAttack), attackRange),
    loftChange: clamp(Number.parseFloat(rawLoft), LOFT_CHANGE_VALUES),
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

  // Set when a new game starts, until the next hit: a ball already in the
  // air was not aimed at the new game's first target.
  const staleShot = useRef(false);
  const simulator = useRef(null);
  const stage = useRef(null);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);
  // Bird's-eye: the camera straight down over the range, and where the
  // scene says the tagged points fall on screen once it has settled.
  const [overhead, setOverhead] = useState(false);
  const [overheadMarks, setOverheadMarks] = useState(null);
  // The last shot, kept for the bird's-eye view after its stats have been
  // put away, until the next one is hit; and which the bird's-eye view is
  // showing the numbers of, that shot or the target.
  const [lastShot, setLastShot] = useState(null);
  const [overheadShows, setOverheadShows] = useState("target");
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
  // First visit: Hit pulses until the first shot.
  const [beckon, setBeckon] = useState(() => !hasDone(FIRST.shot));
  // Star Wars Mode: a fleet in the sky, switched in Settings and remembered
  // in this browser.
  const [starWars, setStarWars] = useState(() => hasDone(STAR_WARS));
  // Auto club: each new target puts the club that suits it in hand. On
  // unless it has been switched off in Settings; remembered in this browser.
  const [autoClub, setAutoClub] = useState(() => !hasDone(AUTO_CLUB_OFF));
  // A link that names a club or its swing (speed, attack, loft) is a setup
  // someone chose: until the first shot, targets are for that club and auto
  // club leaves it in hand.
  const linkedSetup = useRef(
    rawClub !== DEFAULT_CLUB_ID ||
      rawSpeed != null ||
      rawAttack != null ||
      Number.parseFloat(rawLoft) !== LOFT_CHANGE_VALUES.DEFAULT,
  );
  // What to change for the next target, after a miss.
  const [tip, setTip] = useState(null);
  const [board, setBoard] = useState(null);
  // Set when a shot has been scored, so the next target appears once the
  // camera is back.
  const targetDone = useRef(false);
  // The scene's callbacks are made once; this is always the latest startGame.
  const restart = useRef(() => {});
  const [struck, setStruck] = useState(false);

  useEffect(() => {
    const sim = guardScene(() =>
      createSimulator(stage.current, {
        side,
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
        // Star Wars Mode: the battle station has blown up the range. The game
        // starts again behind the Empire's screen.
        onStrike: () => {
          restart.current();
          setStruck(true);
        },
        onOverhead: setOverheadMarks,
        onProgress: setLive,
        onResult: (shotResult) => {
          setResult(shotResult);
          setLastShot(shotResult);
          setOverheadShows("shot");
          setLive(null);
          // A shot only counts against the target it was hit at: starting a
          // new game mid-flight puts up a new one.
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
          if (state === "address") setBehind(true);
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

  useEffect(() => {
    simulator.current.setFleet?.(starWars);
  }, [starWars]);
  const handleStarWars = (on) => {
    setStarWars(on);
    remember(STAR_WARS, on);
    track("setting_changed", {
      setting: "star_wars",
      from: on ? "off" : "on",
      to: on ? "on" : "off",
    });
  };

  useEffect(() => {
    simulator.current.setAim(aim);
  }, [aim]);

  useEffect(() => {
    simulator.current.setClub(club);
  }, [club]);

  // Entering game mode puts up a first target; leaving it clears the range.
  // Changing club keeps the game and the target in front of you (picking the
  // club for the target is the point); each new target is one the club in
  // hand can reach.
  const reach = useMemo(() => targetReach(club.id), [club]);
  const goal = GOALS[mode] || null;
  const gameOver = Boolean(goal) && round.length >= goal.targets;
  // Phones show a game in progress as a row, not the card.
  const phoneRow = !isDesktop && Boolean(goal) && !gameOver;
  // The row's extra line for the club and shape a target names, in pixels.
  const needLine = phoneRow && target?.need ? 20 : 0;
  // On laptops the shot panel lies over the left of the picture; on phones
  // the result card and the game row lie along the bottom. Tell the scene,
  // so it can keep the golfer and ball clear of them.
  useEffect(() => {
    simulator.current.setViewInset(
      isDesktop ? PANEL_RIGHT_PIXELS : 0,
      isDesktop ? 0 : 96 + (phoneRow ? 60 : 0) + needLine,
    );
  }, [isDesktop, phoneRow, needLine]);
  // Easy targets are on the ground, for any club. With auto club on they
  // come from the whole bag, not just the club in hand: anywhere from the
  // shortest club's stock shot to the driver's farthest. Medium and hard
  // targets name their own club and shape: on the ground in medium, in the
  // air in hard.
  const nextTarget = (previous) => {
    if (mode === "medium")
      return shapedTarget(Math.random, previous, { side, turf });
    if (mode === "advanced")
      return shapedAirTarget(Math.random, previous, { side });
    const whole = autoClub && !linkedSetup.current;
    const next = randomTarget(
      Math.random,
      previous,
      whole ? bagReach({ speeds: clubSpeeds, turf }) : reach,
    );
    return linkedSetup.current ? { ...next, keepClub: true } : next;
  };
  // The club a target puts in hand: the one it names, or the one auto club
  // picks for it.
  const clubFor = (aimedAt) => {
    if (aimedAt?.need) return aimedAt.need.clubId;
    return autoClub && aimedAt && !aimedAt.keepClub
      ? pickClub(aimedAt, { speeds: clubSpeeds, turf })
      : club.id;
  };
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
    // An easy game opens on a target the stock straight shot reaches with
    // the club in hand, so Hit alone scores the first one.
    const easy =
      mode === "normal"
        ? easyTarget({ clubId: club.id, speed: speedRange.DEFAULT, turf })
        : null;
    setTarget((previous) => (goal ? easy || nextTarget(previous) : null));
  };
  game.current.goal = goal;
  restart.current = startGame;
  game.current.next = nextTarget;
  game.current.target = target;
  game.current.mode = mode;
  game.current.club = club.id;
  game.current.controls = shot;
  game.current.side = side;
  game.current.startControl = START_CONTROL;
  useEffect(() => {
    setSession(NO_SESSION);
    startGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // The last shot's stats and line can be put away once the view is back
  // behind the golfer, from the bar's own x; with a next target up they also
  // go by themselves a few seconds later.
  const [behind, setBehind] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const clearShot = () => {
    setLeaving(false);
    setResult(null);
    simulator.current?.showShot(false);
  };
  useEffect(() => {
    if (behind && target && result) setLeaving(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behind, target]);
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(clearShot, SHOT_LINGER_MS);
    return () => clearTimeout(timer);
  }, [leaving]);
  useEffect(() => {
    simulator.current.setTarget(target);
    setOverheadShows("target");
  }, [target]);
  // Once the stats are put away the shot's line goes too, but the bird's-eye
  // view brings it back while it is showing that shot.
  useEffect(() => {
    if (result || !lastShot) return;
    simulator.current.showShot(overhead && overheadShows === "shot");
  }, [overhead, overheadShows, result, lastShot]);

  // Auto club: a new target, or switching it on, puts the club for the
  // target in hand. A club picked by hand stays until the next target.
  useEffect(() => {
    const picked = clubFor(target);
    if (picked !== club.id) handleClub(picked, { auto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, autoClub]);
  const handleAutoClub = (on) => {
    setAutoClub(on);
    remember(AUTO_CLUB_OFF, !on);
    track("setting_changed", {
      setting: "auto_club",
      from: on ? "off" : "on",
      to: on ? "on" : "off",
    });
  };

  // Overhead, framed again whenever there is a new target or shot to show,
  // in the band the HUD leaves clear: the result bar along the bottom, and on
  // phones the corner buttons at the top and the game row under the result.
  useEffect(() => {
    const bottom =
      (result ? 96 : 16) + (phoneRow ? (tip ? 96 : 60) : 0) + needLine;
    simulator.current.setOverhead?.(overhead, {
      top: isDesktop ? 16 : 64,
      bottom,
    });
  }, [overhead, target, result, isDesktop, phoneRow, tip, needLine]);

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

  // The account stays; this browser goes back to having no name.
  const logOut = () => {
    clearProfile();
    setPlayer(null);
    setContext({ player_saved: false });
    track("player_logged_out");
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

  // Medium and hard targets name their club, so it cannot be changed while
  // one is up; this is what the club pickers say when they are tried.
  const clubLock = target?.need
    ? `${mode === "medium" ? "Medium" : "Hard"} sets the club for every target. This one has to be hit with the ${getClub(
        target.need.clubId,
      ).name.toLowerCase()}.`
    : null;

  // Swing speed, attack angle and loft belong to the club, so a new club
  // starts from its own.
  const handleClub = (id, { auto = false } = {}) => {
    // A target that names its club keeps it in hand.
    if (!auto && clubLock) return;
    // Only a club picked by hand is a setting the player changed.
    if (id !== club.id && !auto) {
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
    // A shot is watched from behind the golfer.
    setOverhead(false);
    if (beckon) {
      markDone(FIRST.shot);
      setBeckon(false);
    }
    setResult(null);
    setLastShot(null);
    setLeaving(false);
    setBehind(false);
    setLive(null);
    staleShot.current = false;
    linkedSetup.current = false;
    // Hitting again before the camera is back still moves on to the next
    // target: every target gets one shot.
    if (targetDone.current) {
      targetDone.current = false;
      const { shots, next } = game.current;
      const upNext = shots.length >= goal.targets ? null : next(target);
      game.current.target = upNext;
      simulator.current.setTarget(upNext);
      setTarget(upNext);
      // Auto club has not had a render to change club for this target, so
      // this shot is hit with its club here, at that club's stock settings.
      const picked = getClub(clubFor(upNext));
      if (picked.id !== club.id) {
        handleClub(picked.id, { auto: true });
        game.current.club = picked.id;
        simulator.current.setClub(picked);
        simulator.current.hit(
          launchConditions({
            faceAngle,
            pathAngle,
            swingSpeedMPH:
              clubSpeeds[picked.id] ?? swingSpeedRange(picked).DEFAULT,
            side,
            attackAngle: standardAttackAngle(picked),
            strikeInches: strike,
            club: picked.id,
          }),
          side,
          turf,
          aim,
        );
        return;
      }
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

  // The band along the bottom that holds the shot strip on laptops, and its
  // height, which the picture and the panel leave room for.
  const [strip, setStrip] = useState(null);
  const [stripHeight, setStripHeight] = useState(0);
  useEffect(() => {
    if (!strip) {
      setStripHeight(0);
      return undefined;
    }
    const observer = new ResizeObserver(() =>
      setStripHeight(strip.offsetHeight),
    );
    observer.observe(strip);
    setStripHeight(strip.offsetHeight);
    return () => observer.disconnect();
  }, [strip]);

  // The value box the keyboard is on: arrows move it, Command-arrows change
  // its value.
  const [selected, setSelected] = useState(START_CONTROL);

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
    if (pressed.action === "hit") {
      // Space is the main action: whatever has focus (the club menu's
      // button, say) does not also get it.
      event.stopPropagation();
      document.activeElement?.blur?.();
      handleHit();
    } else if (pressed.action === "move") {
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
              ? nudge(value, pressed.direction, range)
              : stepState(selected, value, pressed.direction, range),
        };
      });
    }
  };
  useEffect(() => {
    const listener = (event) => onShortcut.current(event);
    // Capture, so the app sees a key before the focused control does.
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-white md:block md:h-auto md:min-h-[100dvh] md:overflow-visible"
      style={{ "--strip": `${stripHeight}px` }}
    >
      {/* On laptops the picture ends above the shot strip, so the strip never
          covers the golfer or the ball. */}
      <div className="relative min-h-0 flex-1 md:h-[calc(100dvh-var(--strip,0px))] md:flex-none">
        <div id="display-container" ref={stage} className="absolute inset-0" />
        <OverheadTags
          marks={overheadMarks}
          result={lastShot}
          target={target}
          chosen={overheadShows}
          onChoose={setOverheadShows}
        />

        <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-3 p-3 md:p-4">
          {/* Above the shot readout: on a phone the finished card, with its
              name form, reaches down to it and must keep Play again in reach. */}
          <div className="pointer-events-auto relative z-30 ml-auto flex flex-col items-end gap-2">
            {goal && (isDesktop || gameOver) && (
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
                restartIn={gameOver && behind ? NEXT_GAME_MS : null}
              />
            )}
          </div>
        </div>
        {/* Along the bottom: the result bar with Hit to its right, the pair
            centred on the screen. On phones the bar takes the full width, above
            the corner buttons, and Hit is in the bar at the bottom of the
            screen. */}
        <div
          className={`pointer-events-none absolute left-3 right-3 z-20 flex justify-center md:bottom-4 md:left-20 md:right-20 ${
            phoneRow && tip
              ? needLine
                ? "bottom-[120px]"
                : "bottom-[100px]"
              : needLine
                ? "bottom-[80px]"
                : "bottom-[60px]"
          }`}
        >
          <div className="pointer-events-auto relative flex max-w-full items-stretch gap-2">
            <ShotReadout
              live={live}
              result={result}
              leaving={leaving ? SHOT_LINGER_MS : null}
              onClose={behind ? clearShot : null}
            />
          </div>
        </div>
        {/* Back to the usual view once it has been dragged: bottom right on
            laptops, top right on phones. */}
        {orbiting && (
          <div className="absolute right-3 top-3 z-30 md:bottom-4 md:right-4 md:top-auto">
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
        {/* Phones, in a game: the target, pips and Restart in one row along
            the foot of the picture. */}
        {phoneRow && (
          <div className="absolute bottom-3 left-3 right-3 z-20">
            <GameRow
              goal={goal}
              target={target}
              round={round}
              onRestart={startGame}
              tip={tip}
              mode={mode}
              onDifficulty={(value) => handleValueChange("mode", value)}
            />
          </div>
        )}
        {/* Settings, the leaderboard and the bird's-eye button: bottom left on
            laptops, top left on phones (the foot of the picture is the game
            row there). */}
        <div className="absolute left-3 top-3 z-20 flex gap-2 md:bottom-4 md:left-4 md:top-auto">
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
            clubLock={clubLock}
            onClubCarry={handleClubCarry}
            onResetCarries={handleResetCarries}
            starWars={starWars}
            onStarWars={handleStarWars}
            autoClub={autoClub}
            onAutoClub={handleAutoClub}
          />
          <LeaderboardModal
            player={player}
            startMode={mode === "practice" ? "normal" : mode}
            onPlayer={savePlayer}
            onLogOut={logOut}
          />
          <EmpireScreen open={struck} onExit={() => setStruck(false)} />
          {/* Bird's-eye: the camera straight down, and back. */}
          <button
            type="button"
            aria-label="Bird's-eye view"
            aria-pressed={overhead}
            title={overhead ? "Back behind the golfer" : "Bird's-eye view"}
            className={`hud-panel flex h-10 w-10 items-center justify-center !rounded-full transition-colors ${
              overhead ? "!bg-lime-400 text-slate-900" : "text-white/90"
            }`}
            onClick={() => {
              track("setting_changed", {
                setting: "birds_eye",
                from: overhead ? "on" : "off",
                to: overhead ? "off" : "on",
              });
              setOverhead(!overhead);
            }}
          >
            <MapIcon size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Left column: the shot controls, then the club-at-impact views. */}
      <div className="z-10 mx-2 my-2 flex shrink-0 flex-col gap-2 md:absolute md:left-4 md:top-4 md:m-0 md:max-h-[calc(100dvh-var(--strip,0px)-5.5rem)] md:w-[340px] md:overflow-y-auto">
        <div className="hud-panel p-3 md:p-4">
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
            preview={preview}
            onChange={handleValueChange}
            onClub={handleClub}
            clubLock={clubLock}
            onReset={handleReset}
            onHit={handleHit}
            beckon={beckon}
            strip={strip}
            modeSwitch={
              <ButtonRow
                mode={mode}
                onMode={(value) => handleValueChange("mode", value)}
              />
            }
          />
        </div>
      </div>
      {/* Laptops: the shot strip, along the bottom under the picture. The
          shot controls draw themselves into it. */}
      {isDesktop && (
        <div
          ref={setStrip}
          className="fixed inset-x-0 bottom-0 z-20 bg-slate-950 px-4 pb-3 pt-3"
        />
      )}
      {/* Phones: Hit stays at the bottom of the screen, full width. Outside the panel, whose blur would otherwise pin the bar
          to itself. */}
      {!isDesktop && <PhoneBar beckon={beckon} simulate={handleHit} />}
    </div>
  );
}

export default App;
