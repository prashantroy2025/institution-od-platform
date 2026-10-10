-- Additive, rerunnable examination management schema.
-- Registration intentionally has no payment state because no verified fee module exists.

CREATE TABLE IF NOT EXISTS examinations (
    id INT NOT NULL AUTO_INCREMENT,
    session_id INT NOT NULL, semester_id INT NOT NULL, subject_id INT NOT NULL, batch_id INT NOT NULL, section_id INT NOT NULL,
    created_by INT NOT NULL, title VARCHAR(180) NOT NULL, exam_type VARCHAR(60) NOT NULL,
    registration_open_at DATETIME NULL, registration_deadline DATETIME NULL,
    scheduled_start DATETIME NULL, scheduled_end DATETIME NULL, room_id INT NULL,
    maximum_marks DECIMAL(8,2) NOT NULL, pass_marks DECIMAL(8,2) NOT NULL,
    grading_rules JSON NOT NULL, status ENUM('Draft','Scheduled','Registration Open','Marks Pending','Published','Archived') NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), KEY idx_exams_target (session_id,semester_id,subject_id,batch_id,section_id,status), KEY idx_exams_schedule (scheduled_start,scheduled_end,room_id),
    CONSTRAINT fk_exam_session FOREIGN KEY (session_id) REFERENCES academic_sessions(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_semester FOREIGN KEY (semester_id) REFERENCES semesters(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_room FOREIGN KEY (room_id) REFERENCES classrooms(id) ON DELETE SET NULL,
    CONSTRAINT chk_exam_marks CHECK (maximum_marks > 0 AND pass_marks >= 0 AND pass_marks <= maximum_marks),
    CONSTRAINT chk_exam_dates CHECK (registration_deadline IS NULL OR registration_open_at IS NULL OR registration_deadline >= registration_open_at),
    CONSTRAINT chk_exam_schedule CHECK (scheduled_end IS NULL OR scheduled_start IS NULL OR scheduled_end > scheduled_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS examination_registrations (
    id INT NOT NULL AUTO_INCREMENT, exam_id INT NOT NULL, student_id INT NOT NULL, registered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status ENUM('Registered','Cancelled') NOT NULL DEFAULT 'Registered', PRIMARY KEY (id), UNIQUE KEY uq_exam_registration (exam_id,student_id),
    CONSTRAINT fk_exam_registration_exam FOREIGN KEY (exam_id) REFERENCES examinations(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_registration_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS examination_seats (
    id INT NOT NULL AUTO_INCREMENT, exam_id INT NOT NULL, registration_id INT NOT NULL, room_id INT NOT NULL, seat_label VARCHAR(40) NOT NULL,
    PRIMARY KEY (id), UNIQUE KEY uq_exam_seat_student (exam_id,registration_id), UNIQUE KEY uq_exam_seat_label (exam_id,room_id,seat_label),
    CONSTRAINT fk_exam_seat_exam FOREIGN KEY (exam_id) REFERENCES examinations(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_seat_registration FOREIGN KEY (registration_id) REFERENCES examination_registrations(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_seat_room FOREIGN KEY (room_id) REFERENCES classrooms(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS examination_marks (
    id INT NOT NULL AUTO_INCREMENT, exam_id INT NOT NULL, student_id INT NOT NULL, marks DECIMAL(8,2) NOT NULL,
    entered_by INT NOT NULL, published_at DATETIME NULL, published_by INT NULL, correction_reason VARCHAR(500) NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id), UNIQUE KEY uq_exam_marks (exam_id,student_id),
    CONSTRAINT fk_exam_marks_exam FOREIGN KEY (exam_id) REFERENCES examinations(id) ON DELETE CASCADE,
    CONSTRAINT fk_exam_marks_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_marks_enterer FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_exam_marks_publisher FOREIGN KEY (published_by) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_exam_marks_value CHECK (marks >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;