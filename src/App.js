import React, { useEffect, useRef, useState } from "react";
import "./App.scss";
import { useNavigate, useLocation } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Tooltip } from "react-tooltip";

import Navbar from "./components/navbar";
import FloatingFeedbackButton from "./components/common/floating-feedback-button";
import ParameterSelection from "./components/simulator/parameter-selection";
import ButtonRow from "./components/simulator/button-row";
import ShotReadout from "./components/simulator/shot-readout";
import { useQueryState } from "./hooks/use-query";
import { createSimulator } from "./simulate/main";
import { launchConditions } from "./simulate/launch-conditions";
import {
  CLUB_FACE_ANGLE_VALUES,
  CLUB_PATH_ANGLE_VALUES,
  SWING_SPEED_VALUES,
} from "./utils/constant";

const DESKTOP_QUERY = "(min-width: 768px)";

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [side, setSide] = useQueryState("side", "Right", false);
  const [faceAngle, setFaceAngle] = useQueryState(
    "face",
    CLUB_FACE_ANGLE_VALUES.DEFAULT,
    true,
  );
  const [pathAngle, setPathAngle] = useQueryState(
    "path",
    CLUB_PATH_ANGLE_VALUES.DEFAULT,
    true,
  );
  const [swingSpeed, setSwingSpeed] = useQueryState(
    "speed",
    SWING_SPEED_VALUES.DEFAULT,
    true,
  );

  const simulator = useRef(null);
  const stage = useRef(null);
  const panel = useRef(null);
  const [live, setLive] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    const sim = createSimulator(stage.current, {
      side,
      onProgress: setLive,
      onResult: (shotResult) => {
        setResult(shotResult);
        setLive(null);
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

  const handleValueChange = (type, newValue) => {
    if (type === "side") setSide(newValue);
    else if (type === "clubFaceAngle") setFaceAngle(newValue);
    else if (type === "clubPathAngle") setPathAngle(newValue);
    else if (type === "swingSpeed") setSwingSpeed(newValue);
  };

  const handleReset = () => {
    navigate(location.pathname);
  };

  const handleHit = () => {
    setResult(null);
    setLive(null);
    simulator.current.hit(
      launchConditions({
        faceAngle,
        pathAngle,
        swingSpeedMPH: swingSpeed,
        side,
      }),
      side,
    );
  };

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
          <div className="pointer-events-auto ml-auto">
            <ShotReadout live={live} result={result} />
          </div>
        </div>
        <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4">
          <FloatingFeedbackButton />
        </div>
      </div>

      <div
        ref={panel}
        className="hud-panel z-10 m-3 p-4 md:absolute md:left-4 md:top-4 md:m-0 md:w-[300px]"
      >
        <div className="mb-4 hidden md:block">
          <Navbar />
        </div>
        <ParameterSelection
          values={{
            clubFaceAngleSliderValue: faceAngle,
            clubPathAngleSliderValue: pathAngle,
            swingSpeedSliderValue: swingSpeed,
            side,
          }}
          handleValueChange={handleValueChange}
        />
        <ButtonRow handleReset={handleReset} simulate={handleHit} />
      </div>
    </div>
  );
}

export default App;
