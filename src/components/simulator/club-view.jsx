import React, { useEffect, useRef, useState } from "react";
import { ArrowsAngleContract, ArrowsAngleExpand } from "react-bootstrap-icons";
import { classNames } from "../../utils/functions";
import {
  amplifyAngles,
  clubSetup,
  describeClubSetup,
} from "../../simulate/club-setup";
import { createClubScene, VIEWS } from "../../simulate/club-scene";

const FACE = "#ffffff";
const PATH = "#a3e635";
const START = "#fb923c";

const Chip = ({ colour, name, value }) => (
  <span className="flex items-baseline gap-1.5 whitespace-nowrap">
    <span
      className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
      style={{ background: colour }}
    />
    <span className="text-white/60">{name}</span>
    <span className="font-semibold tabular-nums">{value}</span>
  </span>
);

// A live 3D close-up of the driver meeting the ball, posed by the shot
// controls: pick an angle, or drag to look around.
const ClubView = ({
  faceAngle,
  pathAngle,
  swingSpeed,
  aim,
  attackAngle,
  loftChange,
  strike,
  side,
}) => {
  const container = useRef(null);
  const scene = useRef(null);
  const [view, setView] = useState("behind");
  const [expanded, setExpanded] = useState(false);
  // Draw the small angles three times their size, for when 1° is hard to see.
  const [amplified, setAmplified] = useState(false);

  const setup = clubSetup({
    faceAngle,
    pathAngle,
    swingSpeed,
    aim,
    attackAngle,
    loftChange,
    strike,
    side,
  });
  const { labels } = setup;

  useEffect(() => {
    const created = createClubScene(container.current);
    scene.current = created;
    return () => created.dispose();
  }, []);

  useEffect(() => {
    scene.current.update(amplified ? amplifyAngles(setup, 3) : setup);
    // `setup` is rebuilt every render; these are the values it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    faceAngle,
    pathAngle,
    swingSpeed,
    aim,
    attackAngle,
    loftChange,
    strike,
    side,
    amplified,
  ]);

  const chooseView = (name) => {
    setView(name);
    scene.current.setView(name);
  };

  return (
    <section
      aria-label="Club at impact"
      className={classNames(
        "hud-panel p-2",
        expanded &&
          "md:fixed md:left-[372px] md:top-4 md:z-30 md:w-[min(760px,calc(100vw-392px))]",
      )}
    >
      <div className="flex items-center gap-2">
        <div
          className="grid flex-1 grid-cols-4 rounded-lg bg-white/10 p-1 text-xs"
          role="group"
          aria-label="Camera angle"
        >
          {Object.entries(VIEWS).map(([name, { label }]) => (
            <button
              key={name}
              type="button"
              aria-pressed={view === name}
              className={classNames(
                "rounded-md py-1 font-medium transition-colors",
                view === name
                  ? "bg-white text-slate-900"
                  : "text-white/70 hover:text-white",
              )}
              onClick={() => chooseView(name)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Draw angles at three times their size"
          aria-pressed={amplified}
          data-tooltip-id="main-tooltip"
          data-tooltip-content={
            amplified
              ? "Angles are drawn 3× their real size. Click for true size."
              : "Angles are drawn at true size. Click to draw them 3× bigger."
          }
          className={classNames(
            "h-7 shrink-0 rounded-lg px-2 text-xs font-semibold transition-colors",
            amplified
              ? "bg-lime-400 text-slate-900"
              : "bg-white/10 text-white/80 hover:bg-white/20 hover:text-white",
          )}
          onClick={() => setAmplified(!amplified)}
        >
          3×
        </button>
        <button
          type="button"
          aria-label={expanded ? "Shrink club view" : "Enlarge club view"}
          aria-pressed={expanded}
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white md:flex"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <ArrowsAngleContract size={13} />
          ) : (
            <ArrowsAngleExpand size={13} />
          )}
        </button>
      </div>

      <div
        ref={container}
        role="img"
        aria-label={`Driver at impact: ${describeClubSetup(setup)}`}
        className={classNames(
          "club-view mt-2 w-full cursor-grab overflow-hidden rounded-lg active:cursor-grabbing",
          expanded
            ? "h-[200px] md:h-[min(520px,calc(100dvh-170px))]"
            : "h-[200px] md:h-[clamp(130px,calc(100dvh-700px),260px)]",
        )}
      />

      <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 px-1 text-[11px]">
        <Chip colour={FACE} name="Face" value={labels.face} />
        <Chip colour={PATH} name="Path" value={labels.path} />
        <Chip colour={START} name="Start" value={labels.start} />
      </div>
      <p className="mt-1 px-1 text-[11px] text-white/60">
        Launch <b className="text-white">{labels.launch}</b> · {labels.spin} ·
        loft {labels.loft} · attack {labels.attack} · strike {labels.strike}
      </p>
    </section>
  );
};

export default ClubView;
