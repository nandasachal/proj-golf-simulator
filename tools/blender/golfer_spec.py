"""What the golfer is: body sliders, skin, and what he wears."""
# The build is held: tools/blender/golfer_measure.json records its girth and
# src/simulate/golfer-build.test.js fails if a change makes him heavier.

MACROS = {
    "gender": 1.0,
    "age": 0.5,
    "muscle": 0.62,
    "weight": 0.5,
    "proportions": 0.6,
    "height": 0.56,
    "cupsize": 0.5,
    "firmness": 0.5,
    "race": {"asian": 0.25, "caucasian": 0.6, "african": 0.15},
}

# Detail targets on top of the macros: name -> weight.
TARGETS = {
    # MakeHuman's default upper arm is short for the height; this brings the
    # arm to the length the swing was keyed for.
    "measure-upperarm-length-incr": 0.5,
    # The face: a broader jaw and nose, fuller mouth, lower brows.
    "head-square": 0.25,
    "chin-width-incr": 0.3,
    "chin-bones-incr": 0.3,
    "nose-scale-horiz-incr": 0.35,
    "nose-width2-incr": 0.3,
    "mouth-scale-horiz-incr": 0.3,
    "mouth-lowerlip-volume-incr": 0.3,
    "eyebrows-trans-down": 0.3,
}

SKIN = "young_caucasian_male"
# Part of the skin texture's file name, and the tone its skin is brought to
# (sRGB, 0-1): a warm brown.
SKIN_IMAGE = "young_lightskinned_male_diffuse"
SKIN_TONE = (0.66, 0.48, 0.37)
SKIN_ROUGHNESS = 0.66
# Short beard and cropped hair, painted as strokes: how solid each is (0 is
# none, 1 hides the skin), and their colour.
BEARD = 0.6
HAIR = 0.92
HAIR_COLOUR = (0.06, 0.05, 0.045)
EYE_ROUGHNESS = 0.06
IRIS = (0.5, 0.33, 0.22)

# The outfit follows Sachal's reference video (tools/blender/reference, not
# in git): cap (he wears a beanie in the video; Sachal asked for
# a golf cap instead), dark quarter-zip pullover with a lighter yoke, grey
# tapered trousers, dark knit trainers, white glove on the lead hand.
SUIT = "male_casualsuit02"
SHOES = "shoes06"
TOP = (0.16, 0.18, 0.25)
TOP_YOKE = (0.22, 0.24, 0.32)
TOP_LINING = (0.42, 0.44, 0.5)
# The yoke covers the shoulders: above this height, inside this half-width.
YOKE_HEIGHT = 1.385
YOKE_REACH = 0.27
ZIP = (0.2, 0.21, 0.24)
ZIP_LENGTH = 0.19
TROUSERS = (0.38, 0.375, 0.39)
SHOE = (0.15, 0.16, 0.2)
SOCK = (0.13, 0.13, 0.15)
GLOVE = (0.86, 0.87, 0.87)
CAP = (0.2, 0.24, 0.36)
CAP_UNDER = (0.1, 0.12, 0.18)
CAP_THICKNESS = 0.008
CAP_FRONT_RISE = 0.02
CAP_PEAK_LENGTH = 0.085
# Half the arc of the rim the peak is sewn to, degrees.
CAP_PEAK_SPREAD = 56
# Where the cap's rim sits (metres up): on the forehead, clear of the ears,
# a little lower at the back.
CAP_RIM_FRONT = 1.724
CAP_RIM_SIDE = 1.708
CAP_RIM_BACK = 1.688

# (asset folder, asset name, MPFB asset type). No hair asset: the hair is
# cropped short and painted on the scalp, which sits cleanly under a cap.
ASSETS = [
    ("clothes", SUIT, "Clothes"),
    ("clothes", SHOES, "Clothes"),
    ("eyes", "low-poly", "Eyes"),
    ("eyebrows", "eyebrow001", "Eyebrows"),
    ("eyelashes", "eyelashes01", "Eyelashes"),
    ("teeth", "teeth_base", "Teeth"),
]
