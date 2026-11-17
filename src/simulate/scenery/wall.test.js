import { MOTTOS, MOTTO_SECONDS, mottoAt } from "./wall";

describe("the wall's mottos", () => {
  test("there are three, each of two lines", () => {
    expect(MOTTOS).toHaveLength(3);
    for (const lines of MOTTOS) expect(lines).toHaveLength(2);
  });

  test("each holds, then hands over to the next, and the last to the first", () => {
    expect(mottoAt(0)).toEqual({ index: 0, next: 1, mix: 0 });
    expect(mottoAt(MOTTO_SECONDS - 2).mix).toBe(0);
    const handing = mottoAt(MOTTO_SECONDS - 0.45);
    expect(handing.index).toBe(0);
    expect(handing.mix).toBeCloseTo(0.5);
    expect(mottoAt(MOTTO_SECONDS)).toEqual({ index: 1, next: 2, mix: 0 });
    expect(mottoAt(MOTTO_SECONDS * 3 - 0.01)).toMatchObject({ index: 2, next: 0 });
    expect(mottoAt(MOTTO_SECONDS * 3).index).toBe(0);
  });

  test("the handover never jumps", () => {
    let last = mottoAt(0);
    for (let seconds = 0.02; seconds < 40; seconds += 0.02) {
      const now = mottoAt(seconds);
      const before = now.index === last.index ? last.mix : last.mix - 1;
      expect(Math.abs(now.mix - before)).toBeLessThan(0.08);
      last = now;
    }
  });
});
