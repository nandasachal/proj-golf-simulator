import React from "react";
import { Question } from "react-bootstrap-icons";

const FloatingFeedbackButton = () => {
  return (
    <a
      className="hud-panel flex h-10 w-10 items-center justify-center !rounded-full"
      href="https://docs.google.com/forms/d/e/1FAIpQLSfR6vP8GLaPvjIRF9qY8NDl5em_JxNO10pJcJrR03tU-B0YIw/viewform"
      target="_blank"
      rel="noreferrer"
      aria-label="Send feedback"
    >
      <Question size={24} />
    </a>
  );
};

export default FloatingFeedbackButton;
