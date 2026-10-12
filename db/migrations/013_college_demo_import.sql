-- Additive support for the isolated College ERP demo CSV importer.
-- Existing academic/examination rows are never created or rewritten by this migration.

CREATE TABLE IF NOT EXISTS erp_college_demo_registry (
    entity_type VARCHAR(24) NOT NULL,
    demo_id VARCHAR(40) NOT NULL,
    related_id INT NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, demo_id),
    KEY idx_erp_college_demo_registry_related (entity_type, related_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_demo_mark_details (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    examination_mark_id INT NOT NULL,
    demo_mark_id VARCHAR(40) NOT NULL,
    academic_session VARCHAR(40) NOT NULL,
    source_semester TINYINT UNSIGNED NOT NULL,
    internal_marks DECIMAL(8,2) NOT NULL,
    internal_max DECIMAL(8,2) NOT NULL,
    final_marks DECIMAL(8,2) NOT NULL,
    final_max DECIMAL(8,2) NOT NULL,
    total_marks DECIMAL(8,2) NOT NULL,
    total_max DECIMAL(8,2) NOT NULL,
    grade VARCHAR(20) NOT NULL,
    result_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_erp_demo_mark_details_mark (examination_mark_id),
    UNIQUE KEY uq_erp_demo_mark_details_source (demo_mark_id),
    CONSTRAINT fk_erp_demo_mark_details_mark FOREIGN KEY (examination_mark_id) REFERENCES examination_marks(id) ON DELETE RESTRICT,
    CONSTRAINT chk_erp_demo_mark_details_bounds CHECK (
        internal_marks >= 0 AND internal_max > 0 AND internal_marks <= internal_max AND
        final_marks >= 0 AND final_max > 0 AND final_marks <= final_max AND
        total_marks >= 0 AND total_max > 0 AND total_marks <= total_max AND
        total_marks = internal_marks + final_marks AND
        total_max = internal_max + final_max
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
