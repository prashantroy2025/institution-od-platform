-- Additive, idempotent ERP academic foundation.
-- Reuses users, departments and audit_logs. No existing table is altered or deleted.

CREATE TABLE IF NOT EXISTS academic_sessions (
    id INT NOT NULL AUTO_INCREMENT,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_academic_sessions_code (code),
    KEY idx_academic_sessions_active (is_active),
    CONSTRAINT fk_academic_sessions_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_academic_sessions_dates CHECK (end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS semesters (
    id INT NOT NULL AUTO_INCREMENT,
    session_id INT NOT NULL,
    number TINYINT UNSIGNED NOT NULL,
    name VARCHAR(60) NOT NULL,
    start_date DATE NULL,
    end_date DATE NULL,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_semesters_session_number (session_id, number),
    CONSTRAINT fk_semesters_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_semesters_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_semesters_number CHECK (number BETWEEN 1 AND 20),
    CONSTRAINT chk_semesters_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS courses (
    id INT NOT NULL AUTO_INCREMENT,
    department_id INT NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    duration_semesters TINYINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_courses_department_code (department_id, code),
    KEY idx_courses_department_active (department_id, is_active),
    CONSTRAINT fk_courses_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    CONSTRAINT fk_courses_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_courses_duration CHECK (duration_semesters IS NULL OR duration_semesters BETWEEN 1 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
    id INT NOT NULL AUTO_INCREMENT,
    course_id INT NOT NULL,
    semester_id INT NOT NULL,
    code VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    credits DECIMAL(4,1) NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_subjects_course_semester_code (course_id, semester_id, code),
    KEY idx_subjects_course_semester (course_id, semester_id),
    CONSTRAINT fk_subjects_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_subjects_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT,
    CONSTRAINT fk_subjects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_subjects_credits CHECK (credits IS NULL OR credits >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS batches (
    id INT NOT NULL AUTO_INCREMENT,
    course_id INT NOT NULL,
    session_id INT NOT NULL,
    name VARCHAR(80) NOT NULL,
    start_year SMALLINT UNSIGNED NULL,
    end_year SMALLINT UNSIGNED NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_batches_course_session_name (course_id, session_id, name),
    KEY idx_batches_course_session (course_id, session_id),
    CONSTRAINT fk_batches_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE RESTRICT,
    CONSTRAINT fk_batches_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_batches_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_batches_years CHECK (end_year IS NULL OR start_year IS NULL OR end_year >= start_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS faculty_profiles (
    user_id INT NOT NULL,
    designation VARCHAR(100) NULL,
    phone VARCHAR(30) NULL,
    employee_code VARCHAR(50) NULL,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_faculty_profiles_employee_code (employee_code),
    CONSTRAINT fk_faculty_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_profiles (
    user_id INT NOT NULL,
    enrollment_no VARCHAR(50) NULL,
    phone VARCHAR(30) NULL,
    batch_id INT NULL,
    section_id INT NULL,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_student_profiles_enrollment (enrollment_no),
    KEY idx_student_profiles_batch_section (batch_id, section_id),
    CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_profiles_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sections (
    id INT NOT NULL AUTO_INCREMENT,
    batch_id INT NOT NULL,
    name VARCHAR(40) NOT NULL,
    advisor_id INT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sections_batch_name (batch_id, name),
    KEY idx_sections_batch_active (batch_id, is_active),
    CONSTRAINT fk_sections_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_sections_advisor FOREIGN KEY (advisor_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_sections_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELIMITER $$
DROP PROCEDURE IF EXISTS ensure_academic_section_fk$$
CREATE PROCEDURE ensure_academic_section_fk()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
          AND table_name = 'student_profiles'
          AND constraint_name = 'fk_student_profiles_section'
    ) THEN
        ALTER TABLE student_profiles
            ADD CONSTRAINT fk_student_profiles_section
            FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL;
    END IF;
END$$
CALL ensure_academic_section_fk()$$
DROP PROCEDURE ensure_academic_section_fk$$
DELIMITER ;