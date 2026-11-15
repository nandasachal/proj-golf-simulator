import { toMPS, toMPH, toMeters, toYards, toRPM } from "./conversions-lib";

test("toMPS/toMPH round-trip", () => {
  expect(toMPH(toMPS(100))).toBeCloseTo(100, 2);
});

test("toMeters/toYards round-trip", () => {
  expect(toYards(toMeters(250))).toBeCloseTo(250, 2);
});

test("toMPS matches known conversion", () => {
  expect(toMPS(100)).toBeCloseTo(44.704, 3);
});

test("toRPM converts revolutions per second to revolutions per minute", () => {
  expect(toRPM(1)).toBeCloseTo(9.54929659, 5);
});
