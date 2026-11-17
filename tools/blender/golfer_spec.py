"""What the golfer is: body sliders, skin, and what he wears."""

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
# (linear-ish sRGB, 0-1): a warm brown.
SKIN_IMAGE = "young_lightskinned_male_diffuse"
SKIN_TONE = (0.66, 0.48, 0.37)

# Clothes, painted over the casual suit: white polo, navy trim and trousers.
POLO = (0.93, 0.93, 0.91)
TRIM = (0.07, 0.10, 0.2)
TROUSERS = (0.15, 0.19, 0.31)

# (asset folder, asset name, MPFB asset type)
ASSETS = [
    ("clothes", "male_casualsuit04", "Clothes"),
    ("clothes", "shoes05", "Clothes"),
    ("hair", "short01", "Hair"),
    ("eyes", "low-poly", "Eyes"),
    ("eyebrows", "eyebrow001", "Eyebrows"),
    ("eyelashes", "eyelashes01", "Eyelashes"),
    ("teeth", "teeth_base", "Teeth"),
]
