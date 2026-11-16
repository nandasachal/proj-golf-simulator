// The bag: every club the golfer can pick, with the loft stamped on it, how it
// is built (lie, length) and how a tour player delivers it. The tour numbers
// are TrackMan's published PGA Tour averages where they exist (driver, 3 and
// 5 wood, hybrid, 3 iron to pitching wedge) and interpolated by loft for the
// clubs TrackMan does not list.
//
//   speed   club head speed, mph
//   attack  degrees the head is travelling up (+) or down (-) at impact,
//           rounded to the attack-angle control's whole-degree step
//   launch  launch angle, degrees
//   spin    backspin, rpm
//   smash   ball speed / club speed

export const CATEGORIES = {
  driver: "Driver",
  wood: "Fairway woods",
  hybrid: "Hybrids",
  iron: "Irons",
  wedge: "Wedges",
};

// How an off-centre strike behaves, by the kind of head. Woods have a curved
// face (bulge) and a centre of gravity far behind it, so a toe strike starts
// right and gears back hard; an iron's flat face and shallow centre of
// gravity do very little of either, but lose more speed.
//   start      degrees the ball starts toward the toe side, per inch
//   tilt       degrees of spin-axis tilt back the other way, per inch
//   smashLoss  smash factor lost per inch squared
const STRIKE = {
  driver: { start: 3.5, tilt: 14, smashLoss: 0.07 },
  wood: { start: 3, tilt: 11, smashLoss: 0.07 },
  hybrid: { start: 2, tilt: 7, smashLoss: 0.08 },
  iron: { start: 0.5, tilt: 2.5, smashLoss: 0.09 },
  wedge: { start: 0.3, tilt: 1.5, smashLoss: 0.09 },
};

// The ball starts mostly where the face points, nudged toward the path: less
// so the more loft there is.
const FACE_START_WEIGHT = {
  driver: 0.85,
  wood: 0.85,
  hybrid: 0.8,
  iron: 0.75,
  wedge: 0.75,
};

const club = (
  id,
  name,
  shortName,
  category,
  loftDegrees,
  lieDegrees,
  lengthInches,
  tour,
) => ({
  id,
  name,
  shortName,
  category,
  loftDegrees,
  lieDegrees,
  lengthInches,
  // Only the driver is played off a tee here; everything else off the turf.
  teed: category === "driver",
  tour,
  strike: STRIKE[category],
  faceStartWeight: FACE_START_WEIGHT[category],
});

const tour = (speed, attack, launch, spin, smash) => ({
  speed,
  attack,
  launch,
  spin,
  smash,
});

export const CLUBS = [
  // The driver's delivery is modelled separately (launch-conditions.js); the
  // tour row here is only its reference speed.
  club(
    "driver",
    "Driver",
    "Dr",
    "driver",
    10.5,
    58,
    45.5,
    tour(113, 0, 11.4, 2650, 1.48),
  ),
  club(
    "3w",
    "3 wood",
    "3W",
    "wood",
    15,
    58,
    43,
    tour(107, -3, 9.2, 3655, 1.48),
  ),
  club(
    "5w",
    "5 wood",
    "5W",
    "wood",
    18,
    58.5,
    42,
    tour(103, -3, 9.4, 4350, 1.47),
  ),
  club(
    "7w",
    "7 wood",
    "7W",
    "wood",
    21,
    59,
    41.5,
    tour(100, -3, 10.8, 4700, 1.46),
  ),
  club(
    "9w",
    "9 wood",
    "9W",
    "wood",
    24,
    59.5,
    41,
    tour(97, -3, 12.4, 5100, 1.44),
  ),
  club(
    "2h",
    "2 hybrid",
    "2H",
    "hybrid",
    17,
    59,
    40.5,
    tour(102, -3, 9.6, 4100, 1.47),
  ),
  club(
    "3h",
    "3 hybrid",
    "3H",
    "hybrid",
    19,
    59.5,
    40,
    tour(100, -3, 10.2, 4437, 1.46),
  ),
  club(
    "4h",
    "4 hybrid",
    "4H",
    "hybrid",
    22,
    60,
    39.5,
    tour(98, -4, 11.4, 4800, 1.45),
  ),
  club(
    "5h",
    "5 hybrid",
    "5H",
    "hybrid",
    25,
    60.5,
    39,
    tour(96, -4, 12.6, 5200, 1.43),
  ),
  club(
    "6h",
    "6 hybrid",
    "6H",
    "hybrid",
    28,
    61,
    38.5,
    tour(94, -4, 13.8, 5700, 1.41),
  ),
  club(
    "2i",
    "2 iron",
    "2i",
    "iron",
    18,
    59.5,
    39.5,
    tour(100, -3, 9.6, 4300, 1.46),
  ),
  club(
    "3i",
    "3 iron",
    "3i",
    "iron",
    21,
    60,
    39,
    tour(98, -3, 10.4, 4630, 1.45),
  ),
  club(
    "4i",
    "4 iron",
    "4i",
    "iron",
    24,
    60.5,
    38.5,
    tour(96, -3, 11, 4836, 1.43),
  ),
  club(
    "5i",
    "5 iron",
    "5i",
    "iron",
    27,
    61,
    38,
    tour(94, -4, 12.1, 5361, 1.41),
  ),
  club(
    "6i",
    "6 iron",
    "6i",
    "iron",
    30,
    61.5,
    37.5,
    tour(92, -4, 14.1, 6231, 1.38),
  ),
  club(
    "7i",
    "7 iron",
    "7i",
    "iron",
    34,
    62,
    37,
    tour(90, -4, 16.3, 7097, 1.33),
  ),
  club(
    "8i",
    "8 iron",
    "8i",
    "iron",
    38,
    62.5,
    36.5,
    tour(87, -5, 18.1, 7998, 1.32),
  ),
  club(
    "9i",
    "9 iron",
    "9i",
    "iron",
    42,
    63,
    36,
    tour(85, -5, 20.4, 8647, 1.28),
  ),
  club(
    "pw",
    "Pitching wedge",
    "PW",
    "wedge",
    46,
    64,
    35.75,
    tour(83, -5, 24.2, 9304, 1.23),
  ),
  club(
    "gw",
    "Gap wedge",
    "GW",
    "wedge",
    50,
    64,
    35.5,
    tour(82, -5, 26.5, 9800, 1.19),
  ),
  club(
    "sw",
    "Sand wedge",
    "SW",
    "wedge",
    54,
    64,
    35.25,
    tour(81, -5, 29, 10200, 1.14),
  ),
  club(
    "lw",
    "Lob wedge",
    "LW",
    "wedge",
    60,
    64,
    35,
    tour(79, -5, 32, 10500, 1.07),
  ),
];

export const DEFAULT_CLUB_ID = "driver";
const BY_ID = Object.fromEntries(CLUBS.map((entry) => [entry.id, entry]));

// The club for an id from the URL, or the driver if it names nothing.
export const getClub = (id) => BY_ID[id] || BY_ID[DEFAULT_CLUB_ID];

// The swing-speed control is built around a driver swung at 80 to 140 mph
// (95 by default). A golfer swings each shorter club slower in about the
// proportion the tour does, so every club gets the same golfer's range.
const DRIVER_SPEED = { MIN: 80, MAX: 140, DEFAULT: 95 };

export function swingSpeedRange(clubSpec) {
  const ratio = clubSpec.tour.speed / BY_ID.driver.tour.speed;
  return {
    MIN: Math.round(DRIVER_SPEED.MIN * ratio),
    MAX: Math.round(DRIVER_SPEED.MAX * ratio),
    DEFAULT: Math.round(DRIVER_SPEED.DEFAULT * ratio),
    STEP: 1,
  };
}
