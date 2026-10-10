-- Additive, rerunnable feed sharing/moderation foundation.
-- Sharing is persisted as an explicit relationship to the original post; content is never duplicated.
-- Moderation decisions are recorded as an append-only action trail instead of overwriting reports.
-- No destructive statements: safe to re-run on an existing database.

CREATE TABLE IF NOT EXISTS erp_feed_shares (
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    note VARCHAR(280) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT fk_erp_feed_share_post FOREIGN KEY (post_id) REFERENCES erp_feed_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_feed_share_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_erp_feed_shares_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_social_report_actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    report_id INT NOT NULL,
    actor_id INT NOT NULL,
    action ENUM('reviewed','closed','content_removed','report_dismissed') NOT NULL,
    note VARCHAR(500) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_social_report_action_report FOREIGN KEY (report_id) REFERENCES erp_social_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_social_report_action_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
    KEY idx_erp_social_report_actions_report (report_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Messages were created without a soft-delete flag; moderation of reported messages needs one.
-- The INFORMATION_SCHEMA guard makes this rerunnable and never destructive.
SET @table_exists := (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='erp_messages');
SET @column_exists := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='erp_messages' AND column_name='is_deleted');
SET @statement := IF(@table_exists=1 AND @column_exists=0, 'ALTER TABLE erp_messages ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE add_message_soft_delete FROM @statement;
EXECUTE add_message_soft_delete;
DEALLOCATE PREPARE add_message_soft_delete;


