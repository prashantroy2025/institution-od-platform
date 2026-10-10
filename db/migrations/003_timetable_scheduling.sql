-- Additive, idempotent timetable and classroom scheduling foundation.
-- Reuses existing academic entities, users, departments and audit_logs.

CREATE TABLE IF NOT EXISTS classrooms (
    id INT NOT NULL AUTO_INCREMENT,
    department_id INT NOT NULL,
    code VARCHAR(40) NOT NULL,
    name VARCHAR(100) NOT NULL,
    capacity SMALLINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_classrooms_department_code (department_id, code),
    KEY idx_classrooms_department_active (department_id, is_active),
    CONSTRAINT fk_classrooms_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_classrooms_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_classrooms_capacity CHECK (capacity IS NULL OR capacity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timetable_entries (
    id INT NOT NULL AUTO_INCREMENT,
    session_id INT NOT NULL,
    semester_id INT NOT NULL,
    subject_id INT NOT NULL,
    batch_id INT NOT NULL,
    section_id INT NOT NULL,
    faculty_id INT NOT NULL,
    classroom_id INT NOT NULL,
    weekday TINYINT UNSIGNED NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_timetable_week (session_id, semester_id, weekday, start_time),
    KEY idx_timetable_section (section_id, weekday, start_time),
    KEY idx_timetable_faculty (faculty_id, weekday, start_time),
    KEY idx_timetable_classroom (classroom_id, weekday, start_time),
    CONSTRAINT fk_timetable_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_faculty FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_classroom FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE RESTRICT,
    CONSTRAINT fk_timetable_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_timetable_weekday CHECK (weekday BETWEEN 1 AND 7),
    CONSTRAINT chk_timetable_times CHECK (end_time > start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;