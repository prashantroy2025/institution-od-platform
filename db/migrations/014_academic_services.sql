CREATE TABLE IF NOT EXISTS syllabus_units (
    id INT NOT NULL AUTO_INCREMENT,
    subject_id INT NOT NULL,
    unit_number SMALLINT UNSIGNED NOT NULL,
    title VARCHAR(180) NOT NULL,
    topics TEXT NULL,
    learning_outcomes TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_syllabus_subject_unit (subject_id, unit_number),
    CONSTRAINT fk_syllabus_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
    CONSTRAINT fk_syllabus_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS academic_calendar_events (
    id INT NOT NULL AUTO_INCREMENT,
    session_id INT NULL,
    semester_id INT NULL,
    title VARCHAR(180) NOT NULL,
    event_type ENUM('Academic Event','Holiday','Examination','Registration Deadline') NOT NULL,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    description TEXT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    created_by INT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_academic_calendar_dates (is_published, starts_on, ends_on),
    CONSTRAINT fk_academic_calendar_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE SET NULL,
    CONSTRAINT fk_academic_calendar_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE SET NULL,
    CONSTRAINT fk_academic_calendar_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_academic_calendar_dates CHECK (ends_on >= starts_on)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS academic_course_registrations (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    session_id INT NOT NULL,
    semester_id INT NOT NULL,
    subject_id INT NOT NULL,
    status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_academic_course_registration (student_id, session_id, semester_id, subject_id),
    KEY idx_academic_course_registration_review (status, created_at),
    CONSTRAINT fk_academic_registration_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_academic_registration_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_academic_registration_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT,
    CONSTRAINT fk_academic_registration_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    CONSTRAINT fk_academic_registration_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS academic_requests (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    request_type ENUM('Certificate','Subject Change','Academic Record Correction','Advisor Appointment') NOT NULL,
    subject_id INT NULL,
    details VARCHAR(4000) NOT NULL,
    document_storage_key VARCHAR(255) NULL,
    document_original_name VARCHAR(255) NULL,
    document_mime VARCHAR(120) NULL,
    document_size INT UNSIGNED NULL,
    status ENUM('Submitted','Under Review','Approved','Rejected') NOT NULL DEFAULT 'Submitted',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_academic_requests_student (student_id, created_at),
    KEY idx_academic_requests_status (status, created_at),
    CONSTRAINT fk_academic_request_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_academic_request_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
    CONSTRAINT fk_academic_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
