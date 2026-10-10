-- Additive, rerunnable class-attendance model.
-- Separate from legacy attendance and event_participants QR attendance.
-- Faculty authorization uses timetable_entries.faculty_id because no separate
-- faculty-assignment table exists in the current academic foundation.

CREATE TABLE IF NOT EXISTS attendance_settings (
    id TINYINT UNSIGNED NOT NULL,
    shortage_threshold DECIMAL(5,2) NOT NULL DEFAULT 75.00,
    updated_by INT NULL,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    CONSTRAINT chk_attendance_threshold CHECK (shortage_threshold BETWEEN 0 AND 100),
    CONSTRAINT fk_attendance_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO attendance_settings (id, shortage_threshold) VALUES (1, 75.00);

CREATE TABLE IF NOT EXISTS class_attendance_sessions (
    id INT NOT NULL AUTO_INCREMENT,
    timetable_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_class_attendance_timetable_date (timetable_id, attendance_date),
    KEY idx_class_attendance_date (attendance_date),
    CONSTRAINT fk_class_attendance_timetable FOREIGN KEY (timetable_id) REFERENCES timetable_entries(id) ON DELETE RESTRICT,
    CONSTRAINT fk_class_attendance_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_attendance_records (
    id INT NOT NULL AUTO_INCREMENT,
    attendance_session_id INT NOT NULL,
    student_id INT NOT NULL,
    status ENUM('Present','Absent','Late','Excused') NOT NULL,
    marked_by INT NOT NULL,
    marked_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_class_attendance_student (attendance_session_id, student_id),
    KEY idx_class_attendance_student (student_id, status),
    CONSTRAINT fk_class_attendance_record_session FOREIGN KEY (attendance_session_id) REFERENCES class_attendance_sessions(id) ON DELETE CASCADE,
    CONSTRAINT fk_class_attendance_record_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_class_attendance_record_marker FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;