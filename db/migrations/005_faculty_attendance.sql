-- Additive, idempotent faculty attendance records.
-- Does not alter legacy OD attendance, QR attendance, or student class attendance.
-- Leave balances and holiday/working-day policies are intentionally not modeled:
-- the current schema has no authoritative entitlement or calendar source.

CREATE TABLE IF NOT EXISTS faculty_attendance (
    id INT NOT NULL AUTO_INCREMENT,
    faculty_id INT NOT NULL,
    attendance_date DATE NOT NULL,
    status ENUM('Present','Absent','Late','On Leave') NOT NULL,
    check_in DATETIME NULL,
    check_out DATETIME NULL,
    notes VARCHAR(500) NULL,
    created_by INT NOT NULL,
    updated_by INT NOT NULL,
    corrected_at DATETIME NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_faculty_attendance_day (faculty_id, attendance_date),
    KEY idx_faculty_attendance_date (attendance_date),
    KEY idx_faculty_attendance_status (status),
    CONSTRAINT fk_faculty_attendance_faculty FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_faculty_attendance_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_faculty_attendance_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_faculty_attendance_times CHECK (check_out IS NULL OR check_in IS NULL OR check_out >= check_in)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;