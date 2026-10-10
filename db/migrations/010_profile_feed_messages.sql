-- Additive, rerunnable profile/community/messaging foundation.
-- No passwords, tokens, Aadhaar or other sensitive identity documents are stored here.

CREATE TABLE IF NOT EXISTS erp_profile_details (
    user_id INT NOT NULL PRIMARY KEY,
    emergency_name VARCHAR(160) NULL,
    emergency_phone VARCHAR(40) NULL,
    emergency_relation VARCHAR(80) NULL,
    address VARCHAR(500) NULL,
    allow_profile_discovery TINYINT(1) NOT NULL DEFAULT 1,
    allow_direct_messages TINYINT(1) NOT NULL DEFAULT 1,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_profile_details_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_profile_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    label VARCHAR(120) NOT NULL,
    storage_key VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_profile_document_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    KEY idx_erp_profile_documents_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_feed_posts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    author_id INT NOT NULL,
    body TEXT NOT NULL,
    media_storage_key VARCHAR(255) NULL,
    media_original_name VARCHAR(255) NULL,
    media_mime_type VARCHAR(120) NULL,
    is_official TINYINT(1) NOT NULL DEFAULT 0,
    visibility ENUM('college','following','classmates') NOT NULL DEFAULT 'college',
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_feed_post_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    KEY idx_erp_feed_posts_created (created_at),
    KEY idx_erp_feed_posts_author (author_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_feed_follows (
    follower_id INT NOT NULL,
    followed_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (follower_id, followed_id),
    CONSTRAINT fk_erp_feed_follow_follower FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_feed_follow_followed FOREIGN KEY (followed_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_feed_likes (
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT fk_erp_feed_like_post FOREIGN KEY (post_id) REFERENCES erp_feed_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_feed_like_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_feed_saves (
    post_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id),
    CONSTRAINT fk_erp_feed_save_post FOREIGN KEY (post_id) REFERENCES erp_feed_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_feed_save_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_feed_comments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    author_id INT NOT NULL,
    parent_id INT NULL,
    body VARCHAR(2000) NOT NULL,
    is_deleted TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_feed_comment_post FOREIGN KEY (post_id) REFERENCES erp_feed_posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_feed_comment_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_erp_feed_comment_parent FOREIGN KEY (parent_id) REFERENCES erp_feed_comments(id) ON DELETE SET NULL,
    KEY idx_erp_feed_comments_post (post_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_social_blocks (
    blocker_id INT NOT NULL,
    blocked_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    CONSTRAINT fk_erp_social_block_blocker FOREIGN KEY (blocker_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_social_block_blocked FOREIGN KEY (blocked_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_social_reports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    reporter_id INT NOT NULL,
    target_type ENUM('post','comment','message','user') NOT NULL,
    target_id INT NOT NULL,
    reason VARCHAR(500) NOT NULL,
    status ENUM('Open','Reviewed','Closed') NOT NULL DEFAULT 'Open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_social_reporter FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE RESTRICT,
    KEY idx_erp_social_reports_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    group_type ENUM('academic','official','community') NOT NULL DEFAULT 'community',
    department_id INT NULL,
    batch_id INT NULL,
    section_id INT NULL,
    created_by INT NOT NULL,
    is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_message_group_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_erp_message_group_batch FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_erp_message_group_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
    CONSTRAINT fk_erp_message_group_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_group_members (
    group_id INT NOT NULL,
    user_id INT NOT NULL,
    member_role ENUM('owner','moderator','member') NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    CONSTRAINT fk_erp_message_group_member_group FOREIGN KEY (group_id) REFERENCES erp_message_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_message_group_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_type ENUM('direct','group','official') NOT NULL,
    group_id INT NULL,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_message_conversation_group FOREIGN KEY (group_id) REFERENCES erp_message_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_message_conversation_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_conversation_members (
    conversation_id INT NOT NULL,
    user_id INT NOT NULL,
    last_read_message_id INT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    CONSTRAINT fk_erp_message_conversation_member_conversation FOREIGN KEY (conversation_id) REFERENCES erp_message_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_message_conversation_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    body VARCHAR(4000) NOT NULL,
    attachment_storage_key VARCHAR(255) NULL,
    attachment_original_name VARCHAR(255) NULL,
    attachment_mime_type VARCHAR(120) NULL,
    reply_to_id INT NULL,
    is_pinned TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_message_conversation FOREIGN KEY (conversation_id) REFERENCES erp_message_conversations(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_message_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_erp_message_reply FOREIGN KEY (reply_to_id) REFERENCES erp_messages(id) ON DELETE SET NULL,
    KEY idx_erp_messages_conversation (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_message_reactions (
    message_id INT NOT NULL,
    user_id INT NOT NULL,
    reaction VARCHAR(32) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    CONSTRAINT fk_erp_message_reaction_message FOREIGN KEY (message_id) REFERENCES erp_messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_message_reaction_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS erp_demo_registry (
    demo_id VARCHAR(40) PRIMARY KEY,
    user_id INT NULL,
    entity_type VARCHAR(40) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_erp_demo_registry_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;