CREATE TABLE IF NOT EXISTS library_settings (
    id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    max_renewals TINYINT UNSIGNED NOT NULL,
    renewal_days TINYINT UNSIGNED NOT NULL,
    updated_by INT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_library_settings_id CHECK (id = 1),
    CONSTRAINT chk_library_settings_days CHECK (renewal_days BETWEEN 1 AND 90),
    CONSTRAINT chk_library_settings_renewals CHECK (max_renewals <= 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS library_loan_renewals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    loan_id INT NOT NULL,
    student_id INT NOT NULL,
    previous_due_at DATETIME NOT NULL,
    new_due_at DATETIME NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_renewal_loan FOREIGN KEY (loan_id) REFERENCES library_loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_library_renewal_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    KEY idx_library_renewal_loan (loan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS library_digital_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    book_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_digital_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_library_digital_book FOREIGN KEY (book_id) REFERENCES library_books(id) ON DELETE CASCADE,
    KEY idx_library_digital_student (student_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS library_policies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    updated_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_policy_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE RESTRICT,
    KEY idx_library_policy_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS library_facilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    description VARCHAR(1000) NULL,
    location VARCHAR(160) NULL,
    capacity INT UNSIGNED NOT NULL,
    opens_at TIME NULL,
    closes_at TIME NULL,
    booking_enabled TINYINT(1) NOT NULL DEFAULT 1,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_by INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_facility_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_library_facility_capacity CHECK (capacity > 0),
    KEY idx_library_facility_active (is_active, booking_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS library_space_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT NOT NULL,
    student_id INT NOT NULL,
    booking_date DATE NOT NULL,
    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,
    status ENUM('Booked','Cancelled','Completed') NOT NULL DEFAULT 'Booked',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_library_booking_facility FOREIGN KEY (facility_id) REFERENCES library_facilities(id) ON DELETE RESTRICT,
    CONSTRAINT fk_library_booking_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT chk_library_booking_hours CHECK (ends_at > starts_at),
    KEY idx_library_booking_slot (facility_id, booking_date, status, starts_at, ends_at),
    KEY idx_library_booking_student (student_id, booking_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
