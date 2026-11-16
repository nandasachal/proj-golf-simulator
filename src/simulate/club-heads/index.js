import { buildWoodHead } from "./wood";
import { buildIronHead } from "./iron";

// The 3D model of a club from clubs.js, built for a right-hander in
// centimetres: heel and shaft on +x, target down +z. The origin is the middle
// of the face, which leans back by the club's own loft. Every head carries
// `userData.solePoints`, points on its sole that the scene rests on the turf.
export function buildClubHead(club) {
  return club.category === "iron" || club.category === "wedge"
    ? buildIronHead(club)
    : buildWoodHead(club);
}
