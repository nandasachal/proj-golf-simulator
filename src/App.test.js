import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

// jsdom has no WebGL, so the 3D scene can't start under Jest.
jest.mock("./simulate/main", () => ({
  createSimulator: () => ({
    hit: jest.fn(),
    setSide: jest.fn(),
    dispose: jest.fn(),
  }),
}));

test("renders the navbar title", () => {
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  expect(screen.getByText(/golf simulator/i)).toBeInTheDocument();
});
