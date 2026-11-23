-- Medium: a ground target that names its club and shot shape. The site shows
-- 'normal' as Easy and 'advanced' as Hard; the stored names stay as they were.
ALTER TABLE shots DROP CONSTRAINT shots_mode_check;
ALTER TABLE shots ADD CONSTRAINT shots_mode_check
    CHECK (mode IN ('normal', 'medium', 'advanced'));
