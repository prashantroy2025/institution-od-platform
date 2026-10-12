-- Additive, rerunnable student profile extensions: self-reported skills and interests,
-- self-reported achievements, and a reference to the stored profile photo.
-- Non-destructive: no DROP, DELETE or TRUNCATE.

CREATE TABLE IF NOT EXISTS erp_student_skills (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    kind ENUM('skill','interest') NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_student_skill (user_id, kind, name),
    CONSTRAINT fk_student_skill_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_student_achievements (
    id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(160) NOT NULL,
    category ENUM('Award','Certification','Competition','Leadership','Other') NOT NULL,
    organization VARCHAR(160) NULL,
    achieved_on DATE NULL,
    description VARCHAR(1000) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_student_achievements_user (user_id, achieved_on),
    CONSTRAINT fk_student_achievement_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$

CREATE PROCEDURE ensure_profile_photo_schema()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'erp_profile_details' AND column_name = 'photo_storage_key'
    ) THEN
        ALTER TABLE erp_profile_details
            ADD COLUMN photo_storage_key VARCHAR(80) NULL,
            ADD COLUMN photo_mime VARCHAR(40) NULL;
    END IF;
END$$

CALL ensure_profile_photo_schema()$$
DROP PROCEDURE ensure_profile_photo_schema$$

DELIMITER ;
