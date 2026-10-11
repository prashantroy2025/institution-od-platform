-- Additive, rerunnable migration: link campus feed posts to campus events so the
-- "Events" feed filter can surface genuine event announcements.
-- Non-destructive: no DROP, DELETE or TRUNCATE.

DELIMITER $$

CREATE PROCEDURE ensure_feed_event_tag_schema()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'erp_feed_posts' AND column_name = 'event_id'
    ) THEN
        ALTER TABLE erp_feed_posts ADD COLUMN event_id INT NULL AFTER author_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND table_name = 'erp_feed_posts'
          AND constraint_name = 'fk_erp_feed_post_event'
    ) THEN
        ALTER TABLE erp_feed_posts
            ADD CONSTRAINT fk_erp_feed_post_event
            FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = 'erp_feed_posts'
          AND index_name = 'idx_erp_feed_posts_event'
    ) THEN
        ALTER TABLE erp_feed_posts ADD KEY idx_erp_feed_posts_event (event_id);
    END IF;
END$$

CALL ensure_feed_event_tag_schema()$$
DROP PROCEDURE ensure_feed_event_tag_schema$$

DELIMITER ;
