-- Idempotent, non-destructive compatibility migration for the OD/HOD workflow.
-- The current db.sql dump already contains these changes; this migration is
-- safe for both pre-migration and current databases.

DELIMITER $$

CREATE PROCEDURE ensure_od_workflow_schema()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'target_hod_id'
    ) THEN
        ALTER TABLE events ADD COLUMN target_hod_id INT NULL AFTER department_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND table_name = 'events'
          AND constraint_name = 'fk_events_target_hod'
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT fk_events_target_hod
            FOREIGN KEY (target_hod_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'od_applications' AND column_name = 'hod_id'
    ) THEN
        ALTER TABLE od_applications ADD COLUMN hod_id INT NULL AFTER event_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND table_name = 'od_applications'
          AND constraint_name = 'fk_od_hod'
    ) THEN
        ALTER TABLE od_applications
            ADD CONSTRAINT fk_od_hod
            FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    ALTER TABLE od_applications
        MODIFY COLUMN status ENUM('Auto Approved', 'Pending', 'HOD Approved', 'Rejected')
        DEFAULT 'Auto Approved';
END$$

CALL ensure_od_workflow_schema()$$
DROP PROCEDURE ensure_od_workflow_schema$$

DELIMITER ;