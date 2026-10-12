-- Additive, rerunnable per-member conversation preferences.
-- Each flag applies only to the member who sets it; no destructive statements.

SET @column_exists := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='erp_message_conversation_members' AND column_name='is_muted');
SET @statement := IF(@column_exists=0, 'ALTER TABLE erp_message_conversation_members ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE add_member_muted FROM @statement;
EXECUTE add_member_muted;
DEALLOCATE PREPARE add_member_muted;

SET @column_exists := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='erp_message_conversation_members' AND column_name='is_pinned');
SET @statement := IF(@column_exists=0, 'ALTER TABLE erp_message_conversation_members ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE add_member_pinned FROM @statement;
EXECUTE add_member_pinned;
DEALLOCATE PREPARE add_member_pinned;

SET @column_exists := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='erp_message_conversation_members' AND column_name='is_archived');
SET @statement := IF(@column_exists=0, 'ALTER TABLE erp_message_conversation_members ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0', 'DO 0');
PREPARE add_member_archived FROM @statement;
EXECUTE add_member_archived;
DEALLOCATE PREPARE add_member_archived;
