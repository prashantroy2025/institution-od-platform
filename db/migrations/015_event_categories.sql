-- Additive, rerunnable migration: optional category for events so the student
-- Events dashboard can filter by category. Existing rows keep NULL.
-- Non-destructive: no DROP, DELETE or TRUNCATE.

DELIMITER $$

CREATE PROCEDURE ensure_event_category_schema()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'category'
    ) THEN
        ALTER TABLE events ADD COLUMN category VARCHAR(40) NULL AFTER title;
    END IF;
END$$

CALL ensure_event_category_schema()$$
DROP PROCEDURE ensure_event_category_schema$$

DELIMITER ;
