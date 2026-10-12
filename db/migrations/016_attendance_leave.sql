-- Additive, rerunnable leave-request model for the student Attendance dashboard.
-- Approved leave is recorded for reference only; it does not alter class attendance records.
CREATE TABLE IF NOT EXISTS attendance_leave_requests (
    id INT NOT NULL AUTO_INCREMENT,
    student_id INT NOT NULL,
    department_id INT NULL,
    hod_id INT NULL,
    from_date DATE NOT NULL,
    to_date DATE NOT NULL,
    reason VARCHAR(500) NOT NULL,
    document_key VARCHAR(120) NULL,
    document_original_name VARCHAR(255) NULL,
    document_mime VARCHAR(120) NULL,
    status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    decision_note VARCHAR(300) NULL,
    decided_by INT NULL,
    decided_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_attendance_leave_student (student_id, status),
    KEY idx_attendance_leave_hod (hod_id, status),
    CONSTRAINT chk_attendance_leave_dates CHECK (to_date >= from_date),
    CONSTRAINT fk_attendance_leave_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_leave_hod FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_attendance_leave_decider FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
