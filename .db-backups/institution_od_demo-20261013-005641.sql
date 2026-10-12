-- MySQL dump 10.13  Distrib 26.7.0, for macos27.0 (arm64)
--
-- Host: localhost    Database: institution_od_demo
-- ------------------------------------------------------
-- Server version	26.7.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '56c9e0b6-c409-11f1-b5a5-8dfd4c84b1eb:1-28886,
a2eabe40-0b0c-11f1-b279-08cef04ba457:1-223';

--
-- Current Database: `institution_od_demo`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `institution_od_demo` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `institution_od_demo`;

--
-- Table structure for table `academic_sessions`
--

DROP TABLE IF EXISTS `academic_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_academic_sessions_code` (`code`),
  KEY `idx_academic_sessions_active` (`is_active`),
  KEY `fk_academic_sessions_creator` (`created_by`),
  CONSTRAINT `fk_academic_sessions_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_academic_sessions_dates` CHECK ((`end_date` >= `start_date`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_sessions`
--

LOCK TABLES `academic_sessions` WRITE;
/*!40000 ALTER TABLE `academic_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `period_number` int NOT NULL,
  `status` enum('Present','Absent','OD') DEFAULT 'Absent',
  PRIMARY KEY (`id`),
  UNIQUE KEY `student_id` (`student_id`,`attendance_date`,`period_number`),
  UNIQUE KEY `student_id_2` (`student_id`,`attendance_date`,`period_number`),
  KEY `idx_attendance_status` (`status`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_chk_1` CHECK ((`period_number` between 1 and 7))
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_settings`
--

DROP TABLE IF EXISTS `attendance_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_settings` (
  `id` tinyint unsigned NOT NULL,
  `shortage_threshold` decimal(5,2) NOT NULL DEFAULT '75.00',
  `updated_by` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_attendance_settings_user` (`updated_by`),
  CONSTRAINT `fk_attendance_settings_user` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_attendance_threshold` CHECK ((`shortage_threshold` between 0 and 100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_settings`
--

LOCK TABLES `attendance_settings` WRITE;
/*!40000 ALTER TABLE `attendance_settings` DISABLE KEYS */;
INSERT INTO `attendance_settings` VALUES (1,75.00,NULL,'2026-10-12 08:16:19');
/*!40000 ALTER TABLE `attendance_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_sync_logs`
--

DROP TABLE IF EXISTS `attendance_sync_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_sync_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int DEFAULT NULL,
  `period` int DEFAULT NULL,
  `date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT NULL,
  `synced_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_sync_logs`
--

LOCK TABLES `attendance_sync_logs` WRITE;
/*!40000 ALTER TABLE `attendance_sync_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_sync_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` text NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `entity` varchar(50) DEFAULT NULL,
  `entity_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,1,'TEST_ACTION','2026-03-08 10:04:56',NULL,NULL),(2,NULL,'DELETE_EVENT','2026-03-13 10:07:24','events',7),(3,8,'CREATE_EVENT','2026-03-13 10:19:27','events',8),(4,8,'CREATE_EVENT','2026-03-13 10:19:28','events',9),(5,8,'DELETE_EVENT','2026-03-13 10:19:39','events',9),(6,8,'RECOVER_EVENT','2026-03-14 12:12:16','events',9),(7,8,'RECOVER_EVENT','2026-03-14 12:12:52','events',9);
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `batches`
--

DROP TABLE IF EXISTS `batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `batches` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_id` int NOT NULL,
  `session_id` int NOT NULL,
  `name` varchar(80) NOT NULL,
  `start_year` smallint unsigned DEFAULT NULL,
  `end_year` smallint unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_batches_course_session_name` (`course_id`,`session_id`,`name`),
  KEY `idx_batches_course_session` (`course_id`,`session_id`),
  KEY `fk_batches_session` (`session_id`),
  KEY `fk_batches_creator` (`created_by`),
  CONSTRAINT `fk_batches_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_batches_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_batches_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_batches_years` CHECK (((`end_year` is null) or (`start_year` is null) or (`end_year` >= `start_year`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `batches`
--

LOCK TABLES `batches` WRITE;
/*!40000 ALTER TABLE `batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `batches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_attendance_records`
--

DROP TABLE IF EXISTS `class_attendance_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_attendance_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `attendance_session_id` int NOT NULL,
  `student_id` int NOT NULL,
  `status` enum('Present','Absent','Late','Excused') NOT NULL,
  `marked_by` int NOT NULL,
  `marked_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_attendance_student` (`attendance_session_id`,`student_id`),
  KEY `idx_class_attendance_student` (`student_id`,`status`),
  KEY `fk_class_attendance_record_marker` (`marked_by`),
  CONSTRAINT `fk_class_attendance_record_marker` FOREIGN KEY (`marked_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_class_attendance_record_session` FOREIGN KEY (`attendance_session_id`) REFERENCES `class_attendance_sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_class_attendance_record_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_attendance_records`
--

LOCK TABLES `class_attendance_records` WRITE;
/*!40000 ALTER TABLE `class_attendance_records` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_attendance_records` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_attendance_sessions`
--

DROP TABLE IF EXISTS `class_attendance_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_attendance_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timetable_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_class_attendance_timetable_date` (`timetable_id`,`attendance_date`),
  KEY `idx_class_attendance_date` (`attendance_date`),
  KEY `fk_class_attendance_creator` (`created_by`),
  CONSTRAINT `fk_class_attendance_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_class_attendance_timetable` FOREIGN KEY (`timetable_id`) REFERENCES `timetable_entries` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_attendance_sessions`
--

LOCK TABLES `class_attendance_sessions` WRITE;
/*!40000 ALTER TABLE `class_attendance_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_attendance_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classrooms`
--

DROP TABLE IF EXISTS `classrooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classrooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_id` int NOT NULL,
  `code` varchar(40) NOT NULL,
  `name` varchar(100) NOT NULL,
  `capacity` smallint unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_classrooms_department_code` (`department_id`,`code`),
  KEY `idx_classrooms_department_active` (`department_id`,`is_active`),
  KEY `fk_classrooms_creator` (`created_by`),
  CONSTRAINT `fk_classrooms_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_classrooms_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_classrooms_capacity` CHECK (((`capacity` is null) or (`capacity` > 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classrooms`
--

LOCK TABLES `classrooms` WRITE;
/*!40000 ALTER TABLE `classrooms` DISABLE KEYS */;
/*!40000 ALTER TABLE `classrooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `clubs`
--

DROP TABLE IF EXISTS `clubs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clubs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `club_name` varchar(100) NOT NULL,
  `organizer_id` int DEFAULT NULL,
  `department_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `club_name` (`club_name`),
  KEY `organizer_id` (`organizer_id`),
  KEY `fk_clubs_department` (`department_id`),
  CONSTRAINT `clubs_ibfk_1` FOREIGN KEY (`organizer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_clubs_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `clubs`
--

LOCK TABLES `clubs` WRITE;
/*!40000 ALTER TABLE `clubs` DISABLE KEYS */;
INSERT INTO `clubs` VALUES (1,'Tech Club',NULL,3);
/*!40000 ALTER TABLE `clubs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_id` int NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(120) NOT NULL,
  `duration_semesters` tinyint unsigned DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_courses_department_code` (`department_id`,`code`),
  KEY `idx_courses_department_active` (`department_id`,`is_active`),
  KEY `fk_courses_creator` (`created_by`),
  CONSTRAINT `fk_courses_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_courses_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_courses_duration` CHECK (((`duration_semesters` is null) or (`duration_semesters` between 1 and 20)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `hod_id` int DEFAULT NULL,
  `deleted` tinyint DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
INSERT INTO `departments` VALUES (1,'CSE','2026-03-02 12:52:21',NULL,0),(2,'IT','2026-03-02 12:52:21',NULL,0),(3,'Mechanical','2026-03-02 12:52:21',NULL,0),(4,'MBA','2026-03-02 12:52:21',NULL,0),(5,'BBA','2026-03-02 12:52:21',NULL,0),(6,'IoT','2026-03-02 12:52:21',NULL,0),(7,'AIDS','2026-03-02 12:52:21',NULL,0),(8,'AIML','2026-03-02 12:52:21',NULL,0),(9,'ECE','2026-03-02 12:52:21',NULL,0),(10,'ENC','2026-03-02 12:52:21',NULL,0),(11,'CSE-DS','2026-03-02 12:52:21',NULL,0),(12,'CSE-IT','2026-03-08 08:46:22',NULL,0);
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_demo_registry`
--

DROP TABLE IF EXISTS `erp_demo_registry`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_demo_registry` (
  `demo_id` varchar(40) NOT NULL,
  `user_id` int DEFAULT NULL,
  `entity_type` varchar(40) NOT NULL DEFAULT 'user',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`demo_id`),
  KEY `fk_erp_demo_registry_user` (`user_id`),
  CONSTRAINT `fk_erp_demo_registry_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_demo_registry`
--

LOCK TABLES `erp_demo_registry` WRITE;
/*!40000 ALTER TABLE `erp_demo_registry` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_demo_registry` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_comments`
--

DROP TABLE IF EXISTS `erp_feed_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_comments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NOT NULL,
  `author_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `body` varchar(2000) NOT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_erp_feed_comment_author` (`author_id`),
  KEY `fk_erp_feed_comment_parent` (`parent_id`),
  KEY `idx_erp_feed_comments_post` (`post_id`,`created_at`),
  CONSTRAINT `fk_erp_feed_comment_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_erp_feed_comment_parent` FOREIGN KEY (`parent_id`) REFERENCES `erp_feed_comments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_erp_feed_comment_post` FOREIGN KEY (`post_id`) REFERENCES `erp_feed_posts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_comments`
--

LOCK TABLES `erp_feed_comments` WRITE;
/*!40000 ALTER TABLE `erp_feed_comments` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_comments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_follows`
--

DROP TABLE IF EXISTS `erp_feed_follows`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_follows` (
  `follower_id` int NOT NULL,
  `followed_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`follower_id`,`followed_id`),
  KEY `fk_erp_feed_follow_followed` (`followed_id`),
  CONSTRAINT `fk_erp_feed_follow_followed` FOREIGN KEY (`followed_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_feed_follow_follower` FOREIGN KEY (`follower_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_follows`
--

LOCK TABLES `erp_feed_follows` WRITE;
/*!40000 ALTER TABLE `erp_feed_follows` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_follows` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_likes`
--

DROP TABLE IF EXISTS `erp_feed_likes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_likes` (
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`user_id`),
  KEY `fk_erp_feed_like_user` (`user_id`),
  CONSTRAINT `fk_erp_feed_like_post` FOREIGN KEY (`post_id`) REFERENCES `erp_feed_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_feed_like_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_likes`
--

LOCK TABLES `erp_feed_likes` WRITE;
/*!40000 ALTER TABLE `erp_feed_likes` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_likes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_posts`
--

DROP TABLE IF EXISTS `erp_feed_posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `author_id` int NOT NULL,
  `event_id` int DEFAULT NULL,
  `body` text NOT NULL,
  `media_storage_key` varchar(255) DEFAULT NULL,
  `media_original_name` varchar(255) DEFAULT NULL,
  `media_mime_type` varchar(120) DEFAULT NULL,
  `is_official` tinyint(1) NOT NULL DEFAULT '0',
  `visibility` enum('college','following','classmates') NOT NULL DEFAULT 'college',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_erp_feed_posts_created` (`created_at`),
  KEY `idx_erp_feed_posts_author` (`author_id`),
  KEY `idx_erp_feed_posts_event` (`event_id`),
  CONSTRAINT `fk_erp_feed_post_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_erp_feed_post_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_posts`
--

LOCK TABLES `erp_feed_posts` WRITE;
/*!40000 ALTER TABLE `erp_feed_posts` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_posts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_saves`
--

DROP TABLE IF EXISTS `erp_feed_saves`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_saves` (
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`user_id`),
  KEY `fk_erp_feed_save_user` (`user_id`),
  CONSTRAINT `fk_erp_feed_save_post` FOREIGN KEY (`post_id`) REFERENCES `erp_feed_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_feed_save_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_saves`
--

LOCK TABLES `erp_feed_saves` WRITE;
/*!40000 ALTER TABLE `erp_feed_saves` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_saves` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_feed_shares`
--

DROP TABLE IF EXISTS `erp_feed_shares`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_feed_shares` (
  `post_id` int NOT NULL,
  `user_id` int NOT NULL,
  `note` varchar(280) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`,`user_id`),
  KEY `idx_erp_feed_shares_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_erp_feed_share_post` FOREIGN KEY (`post_id`) REFERENCES `erp_feed_posts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_feed_share_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_feed_shares`
--

LOCK TABLES `erp_feed_shares` WRITE;
/*!40000 ALTER TABLE `erp_feed_shares` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_feed_shares` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_message_conversation_members`
--

DROP TABLE IF EXISTS `erp_message_conversation_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_message_conversation_members` (
  `conversation_id` int NOT NULL,
  `user_id` int NOT NULL,
  `last_read_message_id` int DEFAULT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `fk_erp_message_conversation_member_user` (`user_id`),
  CONSTRAINT `fk_erp_message_conversation_member_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `erp_message_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_message_conversation_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_message_conversation_members`
--

LOCK TABLES `erp_message_conversation_members` WRITE;
/*!40000 ALTER TABLE `erp_message_conversation_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_message_conversation_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_message_conversations`
--

DROP TABLE IF EXISTS `erp_message_conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_message_conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_type` enum('direct','group','official') NOT NULL,
  `group_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_erp_message_conversation_group` (`group_id`),
  KEY `fk_erp_message_conversation_creator` (`created_by`),
  CONSTRAINT `fk_erp_message_conversation_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_erp_message_conversation_group` FOREIGN KEY (`group_id`) REFERENCES `erp_message_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_message_conversations`
--

LOCK TABLES `erp_message_conversations` WRITE;
/*!40000 ALTER TABLE `erp_message_conversations` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_message_conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_message_group_members`
--

DROP TABLE IF EXISTS `erp_message_group_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_message_group_members` (
  `group_id` int NOT NULL,
  `user_id` int NOT NULL,
  `member_role` enum('owner','moderator','member') NOT NULL DEFAULT 'member',
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`group_id`,`user_id`),
  KEY `fk_erp_message_group_member_user` (`user_id`),
  CONSTRAINT `fk_erp_message_group_member_group` FOREIGN KEY (`group_id`) REFERENCES `erp_message_groups` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_message_group_member_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_message_group_members`
--

LOCK TABLES `erp_message_group_members` WRITE;
/*!40000 ALTER TABLE `erp_message_group_members` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_message_group_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_message_groups`
--

DROP TABLE IF EXISTS `erp_message_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_message_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(180) NOT NULL,
  `group_type` enum('academic','official','community') NOT NULL DEFAULT 'community',
  `department_id` int DEFAULT NULL,
  `batch_id` int DEFAULT NULL,
  `section_id` int DEFAULT NULL,
  `created_by` int NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_erp_message_group_department` (`department_id`),
  KEY `fk_erp_message_group_batch` (`batch_id`),
  KEY `fk_erp_message_group_section` (`section_id`),
  KEY `fk_erp_message_group_creator` (`created_by`),
  CONSTRAINT `fk_erp_message_group_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_erp_message_group_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_erp_message_group_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_erp_message_group_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_message_groups`
--

LOCK TABLES `erp_message_groups` WRITE;
/*!40000 ALTER TABLE `erp_message_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_message_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_message_reactions`
--

DROP TABLE IF EXISTS `erp_message_reactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_message_reactions` (
  `message_id` int NOT NULL,
  `user_id` int NOT NULL,
  `reaction` varchar(32) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`message_id`,`user_id`),
  KEY `fk_erp_message_reaction_user` (`user_id`),
  CONSTRAINT `fk_erp_message_reaction_message` FOREIGN KEY (`message_id`) REFERENCES `erp_messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_message_reaction_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_message_reactions`
--

LOCK TABLES `erp_message_reactions` WRITE;
/*!40000 ALTER TABLE `erp_message_reactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_message_reactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_messages`
--

DROP TABLE IF EXISTS `erp_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversation_id` int NOT NULL,
  `sender_id` int NOT NULL,
  `body` varchar(4000) NOT NULL,
  `attachment_storage_key` varchar(255) DEFAULT NULL,
  `attachment_original_name` varchar(255) DEFAULT NULL,
  `attachment_mime_type` varchar(120) DEFAULT NULL,
  `reply_to_id` int DEFAULT NULL,
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `fk_erp_message_sender` (`sender_id`),
  KEY `fk_erp_message_reply` (`reply_to_id`),
  KEY `idx_erp_messages_conversation` (`conversation_id`,`created_at`),
  CONSTRAINT `fk_erp_message_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `erp_message_conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_message_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `erp_messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_erp_message_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_messages`
--

LOCK TABLES `erp_messages` WRITE;
/*!40000 ALTER TABLE `erp_messages` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_profile_details`
--

DROP TABLE IF EXISTS `erp_profile_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_profile_details` (
  `user_id` int NOT NULL,
  `emergency_name` varchar(160) DEFAULT NULL,
  `emergency_phone` varchar(40) DEFAULT NULL,
  `emergency_relation` varchar(80) DEFAULT NULL,
  `address` varchar(500) DEFAULT NULL,
  `allow_profile_discovery` tinyint(1) NOT NULL DEFAULT '1',
  `allow_direct_messages` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_erp_profile_details_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_profile_details`
--

LOCK TABLES `erp_profile_details` WRITE;
/*!40000 ALTER TABLE `erp_profile_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_profile_details` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_profile_documents`
--

DROP TABLE IF EXISTS `erp_profile_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_profile_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `label` varchar(120) NOT NULL,
  `storage_key` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_erp_profile_documents_user` (`user_id`),
  CONSTRAINT `fk_erp_profile_document_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_profile_documents`
--

LOCK TABLES `erp_profile_documents` WRITE;
/*!40000 ALTER TABLE `erp_profile_documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_profile_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_social_blocks`
--

DROP TABLE IF EXISTS `erp_social_blocks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_social_blocks` (
  `blocker_id` int NOT NULL,
  `blocked_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`blocker_id`,`blocked_id`),
  KEY `fk_erp_social_block_blocked` (`blocked_id`),
  CONSTRAINT `fk_erp_social_block_blocked` FOREIGN KEY (`blocked_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_erp_social_block_blocker` FOREIGN KEY (`blocker_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_social_blocks`
--

LOCK TABLES `erp_social_blocks` WRITE;
/*!40000 ALTER TABLE `erp_social_blocks` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_social_blocks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_social_report_actions`
--

DROP TABLE IF EXISTS `erp_social_report_actions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_social_report_actions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `report_id` int NOT NULL,
  `actor_id` int NOT NULL,
  `action` enum('reviewed','closed','content_removed','report_dismissed') NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_erp_social_report_action_actor` (`actor_id`),
  KEY `idx_erp_social_report_actions_report` (`report_id`,`created_at`),
  CONSTRAINT `fk_erp_social_report_action_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_erp_social_report_action_report` FOREIGN KEY (`report_id`) REFERENCES `erp_social_reports` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_social_report_actions`
--

LOCK TABLES `erp_social_report_actions` WRITE;
/*!40000 ALTER TABLE `erp_social_report_actions` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_social_report_actions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `erp_social_reports`
--

DROP TABLE IF EXISTS `erp_social_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `erp_social_reports` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reporter_id` int NOT NULL,
  `target_type` enum('post','comment','message','user') NOT NULL,
  `target_id` int NOT NULL,
  `reason` varchar(500) NOT NULL,
  `status` enum('Open','Reviewed','Closed') NOT NULL DEFAULT 'Open',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_erp_social_reporter` (`reporter_id`),
  KEY `idx_erp_social_reports_status` (`status`,`created_at`),
  CONSTRAINT `fk_erp_social_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `erp_social_reports`
--

LOCK TABLES `erp_social_reports` WRITE;
/*!40000 ALTER TABLE `erp_social_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `erp_social_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_participants`
--

DROP TABLE IF EXISTS `event_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_participants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `student_id` int NOT NULL,
  `scan_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `ip_address` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `event_id` (`event_id`,`student_id`),
  UNIQUE KEY `event_id_2` (`event_id`,`student_id`),
  UNIQUE KEY `event_id_3` (`event_id`,`student_id`),
  UNIQUE KEY `event_id_4` (`event_id`,`student_id`),
  KEY `idx_event` (`event_id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_participants_event` (`event_id`),
  KEY `idx_participants_student` (`student_id`),
  CONSTRAINT `event_participants_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_participants_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_participants`
--

LOCK TABLES `event_participants` WRITE;
/*!40000 ALTER TABLE `event_participants` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_periods`
--

DROP TABLE IF EXISTS `event_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_periods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `event_date` date NOT NULL,
  `period_number` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `event_id` (`event_id`),
  CONSTRAINT `event_periods_ibfk_1` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE,
  CONSTRAINT `event_periods_chk_1` CHECK ((`period_number` between 1 and 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_periods`
--

LOCK TABLES `event_periods` WRITE;
/*!40000 ALTER TABLE `event_periods` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_periods` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `event_qr_tokens`
--

DROP TABLE IF EXISTS `event_qr_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_qr_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_id` int NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_qr_token` (`token`)
) ENGINE=InnoDB AUTO_INCREMENT=52 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `event_qr_tokens`
--

LOCK TABLES `event_qr_tokens` WRITE;
/*!40000 ALTER TABLE `event_qr_tokens` DISABLE KEYS */;
/*!40000 ALTER TABLE `event_qr_tokens` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `club_id` int NOT NULL,
  `organizer_id` int DEFAULT NULL,
  `title` varchar(200) NOT NULL,
  `from_date` date NOT NULL,
  `to_date` date NOT NULL,
  `is_full_day` tinyint(1) DEFAULT '0',
  `status` enum('Pending','Approved','Rejected') DEFAULT 'Pending',
  `proof_file` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `department_id` int NOT NULL,
  `target_hod_id` int DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `attendance_active` tinyint(1) DEFAULT '0',
  `is_deleted` tinyint DEFAULT '0',
  `attendance_status` enum('pending','submitted','approved','resubmitted') DEFAULT 'pending',
  PRIMARY KEY (`id`),
  KEY `club_id` (`club_id`),
  KEY `fk_events_department` (`department_id`),
  KEY `idx_events_status` (`status`),
  KEY `fk_organizer` (`organizer_id`),
  KEY `fk_events_target_hod` (`target_hod_id`),
  CONSTRAINT `events_ibfk_1` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_target_hod` FOREIGN KEY (`target_hod_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_organizer` FOREIGN KEY (`organizer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (8,1,8,'discussion','2026-03-13','2026-03-13',0,'Pending',NULL,'2026-03-13 10:19:27',1,NULL,'09:47:00','16:30:00',0,0,'pending'),(9,1,8,'discussion','2026-03-13','2026-03-13',0,'Pending',NULL,'2026-03-13 10:19:28',1,NULL,'09:47:00','16:30:00',0,0,'pending');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `examination_marks`
--

DROP TABLE IF EXISTS `examination_marks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `examination_marks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `student_id` int NOT NULL,
  `marks` decimal(8,2) NOT NULL,
  `entered_by` int NOT NULL,
  `published_at` datetime DEFAULT NULL,
  `published_by` int DEFAULT NULL,
  `correction_reason` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_marks` (`exam_id`,`student_id`),
  KEY `fk_exam_marks_student` (`student_id`),
  KEY `fk_exam_marks_enterer` (`entered_by`),
  KEY `fk_exam_marks_publisher` (`published_by`),
  CONSTRAINT `fk_exam_marks_enterer` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_marks_exam` FOREIGN KEY (`exam_id`) REFERENCES `examinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_marks_publisher` FOREIGN KEY (`published_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_exam_marks_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_exam_marks_value` CHECK ((`marks` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `examination_marks`
--

LOCK TABLES `examination_marks` WRITE;
/*!40000 ALTER TABLE `examination_marks` DISABLE KEYS */;
/*!40000 ALTER TABLE `examination_marks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `examination_registrations`
--

DROP TABLE IF EXISTS `examination_registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `examination_registrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `student_id` int NOT NULL,
  `registered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('Registered','Cancelled') NOT NULL DEFAULT 'Registered',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_registration` (`exam_id`,`student_id`),
  KEY `fk_exam_registration_student` (`student_id`),
  CONSTRAINT `fk_exam_registration_exam` FOREIGN KEY (`exam_id`) REFERENCES `examinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_registration_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `examination_registrations`
--

LOCK TABLES `examination_registrations` WRITE;
/*!40000 ALTER TABLE `examination_registrations` DISABLE KEYS */;
/*!40000 ALTER TABLE `examination_registrations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `examination_seats`
--

DROP TABLE IF EXISTS `examination_seats`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `examination_seats` (
  `id` int NOT NULL AUTO_INCREMENT,
  `exam_id` int NOT NULL,
  `registration_id` int NOT NULL,
  `room_id` int NOT NULL,
  `seat_label` varchar(40) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_exam_seat_student` (`exam_id`,`registration_id`),
  UNIQUE KEY `uq_exam_seat_label` (`exam_id`,`room_id`,`seat_label`),
  KEY `fk_exam_seat_registration` (`registration_id`),
  KEY `fk_exam_seat_room` (`room_id`),
  CONSTRAINT `fk_exam_seat_exam` FOREIGN KEY (`exam_id`) REFERENCES `examinations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_seat_registration` FOREIGN KEY (`registration_id`) REFERENCES `examination_registrations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_exam_seat_room` FOREIGN KEY (`room_id`) REFERENCES `classrooms` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `examination_seats`
--

LOCK TABLES `examination_seats` WRITE;
/*!40000 ALTER TABLE `examination_seats` DISABLE KEYS */;
/*!40000 ALTER TABLE `examination_seats` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `examinations`
--

DROP TABLE IF EXISTS `examinations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `examinations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `semester_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `section_id` int NOT NULL,
  `created_by` int NOT NULL,
  `title` varchar(180) NOT NULL,
  `exam_type` varchar(60) NOT NULL,
  `registration_open_at` datetime DEFAULT NULL,
  `registration_deadline` datetime DEFAULT NULL,
  `scheduled_start` datetime DEFAULT NULL,
  `scheduled_end` datetime DEFAULT NULL,
  `room_id` int DEFAULT NULL,
  `maximum_marks` decimal(8,2) NOT NULL,
  `pass_marks` decimal(8,2) NOT NULL,
  `grading_rules` json NOT NULL,
  `status` enum('Draft','Scheduled','Registration Open','Marks Pending','Published','Archived') NOT NULL DEFAULT 'Draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_exams_target` (`session_id`,`semester_id`,`subject_id`,`batch_id`,`section_id`,`status`),
  KEY `idx_exams_schedule` (`scheduled_start`,`scheduled_end`,`room_id`),
  KEY `fk_exam_semester` (`semester_id`),
  KEY `fk_exam_subject` (`subject_id`),
  KEY `fk_exam_batch` (`batch_id`),
  KEY `fk_exam_section` (`section_id`),
  KEY `fk_exam_creator` (`created_by`),
  KEY `fk_exam_room` (`room_id`),
  CONSTRAINT `fk_exam_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_room` FOREIGN KEY (`room_id`) REFERENCES `classrooms` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_exam_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_semester` FOREIGN KEY (`semester_id`) REFERENCES `semesters` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_exam_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_exam_dates` CHECK (((`registration_deadline` is null) or (`registration_open_at` is null) or (`registration_deadline` >= `registration_open_at`))),
  CONSTRAINT `chk_exam_marks` CHECK (((`maximum_marks` > 0) and (`pass_marks` >= 0) and (`pass_marks` <= `maximum_marks`))),
  CONSTRAINT `chk_exam_schedule` CHECK (((`scheduled_end` is null) or (`scheduled_start` is null) or (`scheduled_end` > `scheduled_start`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `examinations`
--

LOCK TABLES `examinations` WRITE;
/*!40000 ALTER TABLE `examinations` DISABLE KEYS */;
/*!40000 ALTER TABLE `examinations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `faculty_attendance`
--

DROP TABLE IF EXISTS `faculty_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faculty_attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `faculty_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `status` enum('Present','Absent','Late','On Leave') NOT NULL,
  `check_in` datetime DEFAULT NULL,
  `check_out` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_by` int NOT NULL,
  `updated_by` int NOT NULL,
  `corrected_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_faculty_attendance_day` (`faculty_id`,`attendance_date`),
  KEY `idx_faculty_attendance_date` (`attendance_date`),
  KEY `idx_faculty_attendance_status` (`status`),
  KEY `fk_faculty_attendance_creator` (`created_by`),
  KEY `fk_faculty_attendance_updater` (`updated_by`),
  CONSTRAINT `fk_faculty_attendance_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_faculty_attendance_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_faculty_attendance_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_faculty_attendance_times` CHECK (((`check_out` is null) or (`check_in` is null) or (`check_out` >= `check_in`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `faculty_attendance`
--

LOCK TABLES `faculty_attendance` WRITE;
/*!40000 ALTER TABLE `faculty_attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `faculty_attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `faculty_profiles`
--

DROP TABLE IF EXISTS `faculty_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faculty_profiles` (
  `user_id` int NOT NULL,
  `designation` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `employee_code` varchar(50) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_faculty_profiles_employee_code` (`employee_code`),
  CONSTRAINT `fk_faculty_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `faculty_profiles`
--

LOCK TABLES `faculty_profiles` WRITE;
/*!40000 ALTER TABLE `faculty_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `faculty_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_adjustments`
--

DROP TABLE IF EXISTS `finance_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_adjustments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `kind` enum('Discount','Scholarship','Aid','Waiver','Refund') NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  `reason` varchar(500) NOT NULL,
  `approved_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_finance_adjustment_invoice` (`invoice_id`),
  KEY `fk_finance_adjustment_approver` (`approved_by`),
  CONSTRAINT `fk_finance_adjustment_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_adjustment_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `finance_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_finance_adjustment_amount` CHECK ((`amount_paise` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_adjustments`
--

LOCK TABLES `finance_adjustments` WRITE;
/*!40000 ALTER TABLE `finance_adjustments` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_adjustments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_budgets`
--

DROP TABLE IF EXISTS `finance_budgets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_budgets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_id` int DEFAULT NULL,
  `name` varchar(160) NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_finance_budget_department` (`department_id`),
  KEY `fk_finance_budget_creator` (`created_by`),
  CONSTRAINT `fk_finance_budget_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_budget_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_finance_budget_dates` CHECK ((`period_end` >= `period_start`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_budgets`
--

LOCK TABLES `finance_budgets` WRITE;
/*!40000 ALTER TABLE `finance_budgets` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_budgets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_expenses`
--

DROP TABLE IF EXISTS `finance_expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_expenses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `budget_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `vendor` varchar(160) NOT NULL,
  `description` varchar(500) NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  `expense_date` date NOT NULL,
  `status` enum('Submitted','Approved','Rejected') NOT NULL DEFAULT 'Submitted',
  `created_by` int NOT NULL,
  `approved_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_finance_expense_budget` (`budget_id`),
  KEY `fk_finance_expense_department` (`department_id`),
  KEY `fk_finance_expense_creator` (`created_by`),
  KEY `fk_finance_expense_approver` (`approved_by`),
  CONSTRAINT `fk_finance_expense_approver` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_finance_expense_budget` FOREIGN KEY (`budget_id`) REFERENCES `finance_budgets` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_finance_expense_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_expense_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_finance_expense_amount` CHECK ((`amount_paise` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_expenses`
--

LOCK TABLES `finance_expenses` WRITE;
/*!40000 ALTER TABLE `finance_expenses` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_expenses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_fee_items`
--

DROP TABLE IF EXISTS `finance_fee_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_fee_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `structure_id` int NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(160) NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_finance_fee_item` (`structure_id`,`code`),
  CONSTRAINT `fk_finance_fee_item_structure` FOREIGN KEY (`structure_id`) REFERENCES `finance_fee_structures` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_finance_fee_item_amount` CHECK ((`amount_paise` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_fee_items`
--

LOCK TABLES `finance_fee_items` WRITE;
/*!40000 ALTER TABLE `finance_fee_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_fee_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_fee_structures`
--

DROP TABLE IF EXISTS `finance_fee_structures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_fee_structures` (
  `id` int NOT NULL AUTO_INCREMENT,
  `department_id` int DEFAULT NULL,
  `name` varchar(160) NOT NULL,
  `academic_year` varchar(20) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'INR',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_finance_fee_structure_scope` (`department_id`,`academic_year`,`is_active`),
  KEY `fk_finance_fee_creator` (`created_by`),
  CONSTRAINT `fk_finance_fee_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_fee_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_fee_structures`
--

LOCK TABLES `finance_fee_structures` WRITE;
/*!40000 ALTER TABLE `finance_fee_structures` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_fee_structures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_invoice_items`
--

DROP TABLE IF EXISTS `finance_invoice_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_invoice_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(160) NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_finance_invoice_item_invoice` (`invoice_id`),
  CONSTRAINT `fk_finance_invoice_item_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `finance_invoices` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_finance_invoice_item_amount` CHECK ((`amount_paise` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_invoice_items`
--

LOCK TABLES `finance_invoice_items` WRITE;
/*!40000 ALTER TABLE `finance_invoice_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_invoice_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_invoices`
--

DROP TABLE IF EXISTS `finance_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_no` varchar(50) NOT NULL,
  `student_id` int NOT NULL,
  `structure_id` int DEFAULT NULL,
  `issue_date` date NOT NULL,
  `due_date` date NOT NULL,
  `status` enum('Issued','Partially Paid','Paid','Cancelled','Overdue') NOT NULL DEFAULT 'Issued',
  `total_paise` bigint unsigned NOT NULL DEFAULT '0',
  `discount_paise` bigint unsigned NOT NULL DEFAULT '0',
  `waiver_paise` bigint unsigned NOT NULL DEFAULT '0',
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoice_no` (`invoice_no`),
  KEY `idx_finance_invoice_student` (`student_id`,`status`,`due_date`),
  KEY `fk_finance_invoice_structure` (`structure_id`),
  KEY `fk_finance_invoice_creator` (`created_by`),
  CONSTRAINT `fk_finance_invoice_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_invoice_structure` FOREIGN KEY (`structure_id`) REFERENCES `finance_fee_structures` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_finance_invoice_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_finance_invoice_dates` CHECK ((`due_date` >= `issue_date`)),
  CONSTRAINT `chk_finance_invoice_total` CHECK ((`total_paise` >= (`discount_paise` + `waiver_paise`)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_invoices`
--

LOCK TABLES `finance_invoices` WRITE;
/*!40000 ALTER TABLE `finance_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_payments`
--

DROP TABLE IF EXISTS `finance_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_id` int NOT NULL,
  `student_id` int NOT NULL,
  `amount_paise` bigint unsigned NOT NULL,
  `method` enum('Offline','Gateway') NOT NULL,
  `reference_no` varchar(120) DEFAULT NULL,
  `proof_storage_key` varchar(255) DEFAULT NULL,
  `status` enum('Pending','Verified','Rejected','Refunded') NOT NULL DEFAULT 'Pending',
  `verified_by` int DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_finance_payment_reference` (`method`,`reference_no`),
  KEY `idx_finance_payment_invoice` (`invoice_id`,`status`),
  KEY `fk_finance_payment_student` (`student_id`),
  KEY `fk_finance_payment_verifier` (`verified_by`),
  CONSTRAINT `fk_finance_payment_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `finance_invoices` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_payment_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_finance_payment_verifier` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_finance_payment_amount` CHECK ((`amount_paise` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_payments`
--

LOCK TABLES `finance_payments` WRITE;
/*!40000 ALTER TABLE `finance_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `learning_assignments`
--

DROP TABLE IF EXISTS `learning_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subject_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `section_id` int NOT NULL,
  `created_by` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `instructions` text,
  `attachment_storage_key` varchar(255) DEFAULT NULL,
  `attachment_original_name` varchar(255) DEFAULT NULL,
  `attachment_mime` varchar(120) DEFAULT NULL,
  `attachment_size` int unsigned DEFAULT NULL,
  `publish_at` datetime DEFAULT NULL,
  `deadline` datetime NOT NULL,
  `max_marks` decimal(8,2) NOT NULL,
  `allowed_file_types` varchar(500) NOT NULL DEFAULT 'pdf,doc,docx,ppt,pptx,xls,xlsx,txt,png,jpg,jpeg',
  `max_file_size` int unsigned NOT NULL DEFAULT '10485760',
  `status` enum('Draft','Published','Archived') NOT NULL DEFAULT 'Draft',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_learning_assignments_target` (`subject_id`,`batch_id`,`section_id`,`status`),
  KEY `idx_learning_assignments_deadline` (`deadline`),
  KEY `fk_learning_assignment_batch` (`batch_id`),
  KEY `fk_learning_assignment_section` (`section_id`),
  KEY `fk_learning_assignment_creator` (`created_by`),
  CONSTRAINT `fk_learning_assignment_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_learning_assignment_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_learning_assignment_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_learning_assignment_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_learning_assignment_marks` CHECK ((`max_marks` > 0)),
  CONSTRAINT `chk_learning_assignment_size` CHECK ((`max_file_size` > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `learning_assignments`
--

LOCK TABLES `learning_assignments` WRITE;
/*!40000 ALTER TABLE `learning_assignments` DISABLE KEYS */;
/*!40000 ALTER TABLE `learning_assignments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `learning_materials`
--

DROP TABLE IF EXISTS `learning_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `subject_id` int NOT NULL,
  `course_id` int NOT NULL,
  `created_by` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `storage_key` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime` varchar(120) NOT NULL,
  `size` int unsigned NOT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_learning_materials_subject` (`subject_id`,`is_archived`),
  KEY `fk_learning_material_course` (`course_id`),
  KEY `fk_learning_material_creator` (`created_by`),
  CONSTRAINT `fk_learning_material_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_learning_material_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_learning_material_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `learning_materials`
--

LOCK TABLES `learning_materials` WRITE;
/*!40000 ALTER TABLE `learning_materials` DISABLE KEYS */;
/*!40000 ALTER TABLE `learning_materials` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `learning_submissions`
--

DROP TABLE IF EXISTS `learning_submissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `learning_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `assignment_id` int NOT NULL,
  `student_id` int NOT NULL,
  `submission_no` smallint unsigned NOT NULL DEFAULT '1',
  `storage_key` varchar(255) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `mime` varchar(120) NOT NULL,
  `size` int unsigned NOT NULL,
  `submitted_at` datetime NOT NULL,
  `marks` decimal(8,2) DEFAULT NULL,
  `feedback` text,
  `status` enum('Submitted','Late','Graded','Returned') NOT NULL DEFAULT 'Submitted',
  `graded_by` int DEFAULT NULL,
  `graded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_learning_submission_version` (`assignment_id`,`student_id`,`submission_no`),
  KEY `idx_learning_submissions_assignment` (`assignment_id`,`status`),
  KEY `idx_learning_submissions_student` (`student_id`),
  KEY `fk_learning_submission_grader` (`graded_by`),
  CONSTRAINT `fk_learning_submission_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `learning_assignments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_learning_submission_grader` FOREIGN KEY (`graded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_learning_submission_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_learning_submission_marks` CHECK (((`marks` is null) or (`marks` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `learning_submissions`
--

LOCK TABLES `learning_submissions` WRITE;
/*!40000 ALTER TABLE `learning_submissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `learning_submissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_authors`
--

DROP TABLE IF EXISTS `library_authors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_authors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_authors`
--

LOCK TABLES `library_authors` WRITE;
/*!40000 ALTER TABLE `library_authors` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_authors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_book_authors`
--

DROP TABLE IF EXISTS `library_book_authors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_book_authors` (
  `book_id` int NOT NULL,
  `author_id` int NOT NULL,
  PRIMARY KEY (`book_id`,`author_id`),
  KEY `fk_library_ba_author` (`author_id`),
  CONSTRAINT `fk_library_ba_author` FOREIGN KEY (`author_id`) REFERENCES `library_authors` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_library_ba_book` FOREIGN KEY (`book_id`) REFERENCES `library_books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_book_authors`
--

LOCK TABLES `library_book_authors` WRITE;
/*!40000 ALTER TABLE `library_book_authors` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_book_authors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_books`
--

DROP TABLE IF EXISTS `library_books`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_books` (
  `id` int NOT NULL AUTO_INCREMENT,
  `isbn` varchar(40) DEFAULT NULL,
  `title` varchar(240) NOT NULL,
  `publisher` varchar(160) DEFAULT NULL,
  `publication_year` smallint DEFAULT NULL,
  `category_id` int DEFAULT NULL,
  `digital_storage_key` varchar(255) DEFAULT NULL,
  `digital_original_name` varchar(255) DEFAULT NULL,
  `digital_mime` varchar(120) DEFAULT NULL,
  `created_by` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `isbn` (`isbn`),
  KEY `fk_library_book_category` (`category_id`),
  KEY `fk_library_book_creator` (`created_by`),
  CONSTRAINT `fk_library_book_category` FOREIGN KEY (`category_id`) REFERENCES `library_categories` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_library_book_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_books`
--

LOCK TABLES `library_books` WRITE;
/*!40000 ALTER TABLE `library_books` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_books` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_categories`
--

DROP TABLE IF EXISTS `library_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_categories`
--

LOCK TABLES `library_categories` WRITE;
/*!40000 ALTER TABLE `library_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_copies`
--

DROP TABLE IF EXISTS `library_copies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_copies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `book_id` int NOT NULL,
  `accession_no` varchar(80) NOT NULL,
  `status` enum('Available','Issued','Lost','Maintenance') NOT NULL DEFAULT 'Available',
  PRIMARY KEY (`id`),
  UNIQUE KEY `accession_no` (`accession_no`),
  KEY `fk_library_copy_book` (`book_id`),
  CONSTRAINT `fk_library_copy_book` FOREIGN KEY (`book_id`) REFERENCES `library_books` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_copies`
--

LOCK TABLES `library_copies` WRITE;
/*!40000 ALTER TABLE `library_copies` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_copies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_loans`
--

DROP TABLE IF EXISTS `library_loans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_loans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `copy_id` int NOT NULL,
  `student_id` int NOT NULL,
  `issued_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `due_at` datetime NOT NULL,
  `returned_at` datetime DEFAULT NULL,
  `fine_paise` bigint unsigned NOT NULL DEFAULT '0',
  `status` enum('Issued','Returned','Lost') NOT NULL DEFAULT 'Issued',
  `issued_by` int NOT NULL,
  `returned_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_library_loan_copy` (`copy_id`),
  KEY `fk_library_loan_issuer` (`issued_by`),
  KEY `fk_library_loan_returner` (`returned_by`),
  KEY `idx_library_loan_student` (`student_id`,`status`),
  CONSTRAINT `fk_library_loan_copy` FOREIGN KEY (`copy_id`) REFERENCES `library_copies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_library_loan_issuer` FOREIGN KEY (`issued_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_library_loan_returner` FOREIGN KEY (`returned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_library_loan_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_library_loan_dates` CHECK ((`due_at` >= `issued_at`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_loans`
--

LOCK TABLES `library_loans` WRITE;
/*!40000 ALTER TABLE `library_loans` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_loans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `library_reservations`
--

DROP TABLE IF EXISTS `library_reservations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `library_reservations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `book_id` int NOT NULL,
  `student_id` int NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('Waiting','Fulfilled','Cancelled') NOT NULL DEFAULT 'Waiting',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_library_reservation` (`book_id`,`student_id`,`status`),
  KEY `fk_library_reservation_student` (`student_id`),
  CONSTRAINT `fk_library_reservation_book` FOREIGN KEY (`book_id`) REFERENCES `library_books` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_library_reservation_student` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `library_reservations`
--

LOCK TABLES `library_reservations` WRITE;
/*!40000 ALTER TABLE `library_reservations` DISABLE KEYS */;
/*!40000 ALTER TABLE `library_reservations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
INSERT INTO `notifications` VALUES (1,4,'Test notification',0,'2026-03-06 13:55:18'),(2,4,'Test notification',1,'2026-03-06 14:34:45'),(3,9,'New event requires approval: AI Workshop',0,'2026-03-06 14:51:05'),(4,2,'New event requires approval: AI Seminar',0,'2026-03-06 14:51:23'),(5,2,'New event requires approval: ai',0,'2026-03-09 20:40:22'),(6,2,'New event requires approval: discussion',0,'2026-03-13 10:19:27'),(7,2,'New event requires approval: discussion',0,'2026-03-13 10:19:28');
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `od_applications`
--

DROP TABLE IF EXISTS `od_applications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `od_applications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `student_id` int NOT NULL,
  `event_id` int NOT NULL,
  `hod_id` int DEFAULT NULL,
  `applied_date` date NOT NULL,
  `status` enum('Auto Approved','Pending','HOD Approved','Rejected') DEFAULT 'Auto Approved',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `event_id` (`event_id`),
  KEY `fk_od_hod` (`hod_id`),
  CONSTRAINT `fk_od_hod` FOREIGN KEY (`hod_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `od_applications_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `od_applications_ibfk_2` FOREIGN KEY (`event_id`) REFERENCES `events` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `od_applications`
--

LOCK TABLES `od_applications` WRITE;
/*!40000 ALTER TABLE `od_applications` DISABLE KEYS */;
/*!40000 ALTER TABLE `od_applications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sections`
--

DROP TABLE IF EXISTS `sections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `batch_id` int NOT NULL,
  `name` varchar(40) NOT NULL,
  `advisor_id` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_sections_batch_name` (`batch_id`,`name`),
  KEY `idx_sections_batch_active` (`batch_id`,`is_active`),
  KEY `fk_sections_advisor` (`advisor_id`),
  KEY `fk_sections_creator` (`created_by`),
  CONSTRAINT `fk_sections_advisor` FOREIGN KEY (`advisor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_sections_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_sections_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sections`
--

LOCK TABLES `sections` WRITE;
/*!40000 ALTER TABLE `sections` DISABLE KEYS */;
/*!40000 ALTER TABLE `sections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `semesters`
--

DROP TABLE IF EXISTS `semesters`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `semesters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `number` tinyint unsigned NOT NULL,
  `name` varchar(60) NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_semesters_session_number` (`session_id`,`number`),
  KEY `fk_semesters_creator` (`created_by`),
  CONSTRAINT `fk_semesters_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_semesters_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_semesters_dates` CHECK (((`end_date` is null) or (`start_date` is null) or (`end_date` >= `start_date`))),
  CONSTRAINT `chk_semesters_number` CHECK ((`number` between 1 and 20))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `semesters`
--

LOCK TABLES `semesters` WRITE;
/*!40000 ALTER TABLE `semesters` DISABLE KEYS */;
/*!40000 ALTER TABLE `semesters` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_profiles`
--

DROP TABLE IF EXISTS `student_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_profiles` (
  `user_id` int NOT NULL,
  `enrollment_no` varchar(50) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `batch_id` int DEFAULT NULL,
  `section_id` int DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `uq_student_profiles_enrollment` (`enrollment_no`),
  KEY `idx_student_profiles_batch_section` (`batch_id`,`section_id`),
  KEY `fk_student_profiles_section` (`section_id`),
  CONSTRAINT `fk_student_profiles_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_student_profiles_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_student_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_profiles`
--

LOCK TABLES `student_profiles` WRITE;
/*!40000 ALTER TABLE `student_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` int NOT NULL AUTO_INCREMENT,
  `course_id` int NOT NULL,
  `semester_id` int NOT NULL,
  `code` varchar(30) NOT NULL,
  `name` varchar(120) NOT NULL,
  `credits` decimal(4,1) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_subjects_course_semester_code` (`course_id`,`semester_id`,`code`),
  KEY `idx_subjects_course_semester` (`course_id`,`semester_id`),
  KEY `fk_subjects_semester` (`semester_id`),
  KEY `fk_subjects_creator` (`created_by`),
  CONSTRAINT `fk_subjects_course` FOREIGN KEY (`course_id`) REFERENCES `courses` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_subjects_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_subjects_semester` FOREIGN KEY (`semester_id`) REFERENCES `semesters` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_subjects_credits` CHECK (((`credits` is null) or (`credits` >= 0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subjects`
--

LOCK TABLES `subjects` WRITE;
/*!40000 ALTER TABLE `subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `timetable_entries`
--

DROP TABLE IF EXISTS `timetable_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timetable_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` int NOT NULL,
  `semester_id` int NOT NULL,
  `subject_id` int NOT NULL,
  `batch_id` int NOT NULL,
  `section_id` int NOT NULL,
  `faculty_id` int NOT NULL,
  `classroom_id` int NOT NULL,
  `weekday` tinyint unsigned NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_timetable_week` (`session_id`,`semester_id`,`weekday`,`start_time`),
  KEY `idx_timetable_section` (`section_id`,`weekday`,`start_time`),
  KEY `idx_timetable_faculty` (`faculty_id`,`weekday`,`start_time`),
  KEY `idx_timetable_classroom` (`classroom_id`,`weekday`,`start_time`),
  KEY `fk_timetable_semester` (`semester_id`),
  KEY `fk_timetable_subject` (`subject_id`),
  KEY `fk_timetable_batch` (`batch_id`),
  KEY `fk_timetable_creator` (`created_by`),
  CONSTRAINT `fk_timetable_batch` FOREIGN KEY (`batch_id`) REFERENCES `batches` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_classroom` FOREIGN KEY (`classroom_id`) REFERENCES `classrooms` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_timetable_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_semester` FOREIGN KEY (`semester_id`) REFERENCES `semesters` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_session` FOREIGN KEY (`session_id`) REFERENCES `academic_sessions` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_timetable_subject` FOREIGN KEY (`subject_id`) REFERENCES `subjects` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_timetable_times` CHECK ((`end_time` > `start_time`)),
  CONSTRAINT `chk_timetable_weekday` CHECK ((`weekday` between 1 and 7))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `timetable_entries`
--

LOCK TABLES `timetable_entries` WRITE;
/*!40000 ALTER TABLE `timetable_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `timetable_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `college_id` varchar(50) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('student','organizer','hod','super_admin') NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `department_id` int DEFAULT NULL,
  `deleted` tinyint DEFAULT '0',
  `club_name` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `college_id` (`college_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_department` (`department_id`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_college_id` (`college_id`),
  CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ADMIN001','Super Admin','admin@college.com','$2b$10$XcjulSWvM3GOV7Ha3PO3ruTGWlcq2o3FUXYI2kc2rncK9gBB4MHYe','super_admin',1,'2026-03-02 12:59:38',1,0,NULL),(2,'HOD001','Dr. Sharma','hodcse@college.com','$2b$10$MKZ6qZT845mk3To3FD8QRus0FLRbMlBRaLVM8XedGVxSt8HwN8fxW','hod',1,'2026-03-02 12:59:45',1,0,NULL),(5,'HOD002','Dr. Mehta','hodit@college.com','$2b$10$DrEawGibUs3b.dETjLJx1OaRK0gdg8QSplhhC1cq5NwStxbpeN3pG','hod',1,'2026-03-02 13:42:39',2,0,NULL),(8,'ORG010','Organizer Test','orgtest@college.com','$2b$10$2a6IeUCuloG0Z7ZAzJvpJ.wG0qfaeLakmF36JiMXFOq8iA5ZnEeSm','organizer',1,'2026-03-05 12:14:40',1,0,NULL),(12,'2421756','Prashant Kumar','2421756.it.cec@cgc.edu.in','$2b$10$BBudNp1VBxIjWStqYp2KQey0FZl0.Ob3kbq3CilkQYRIrwoQuGGAm','student',1,'2026-03-07 22:23:13',1,0,NULL),(14,'24221731','Manisha Kumari','2421731.it.cec@cgc.edu.in','$2b$10$2NipVdbZ1FcuTaj.Ikt69u9UE5zo6kf42DMGMJ5pZVGilJHKuw9R2','student',1,'2026-03-14 05:02:36',2,0,NULL),(15,'24221732','Manisha Rani','2421732.it.cec@cgc.edu.in','$2b$10$.4bU87OcfLcUfv/YE84wbuVsM1GXJ0j76gGsIhvSXXUlvA8VOcxYS','student',1,'2026-03-14 05:03:18',2,0,NULL),(17,'24221739','Muskan Kumari','2421739.it.cec@cgc.edu.in','$2b$10$bPGVQU/gHvGW5T3VzaRSt.jlAQNlJoaWBhO9ww9IbY5WBCY0njBha','student',1,'2026-03-14 05:04:10',2,0,NULL),(18,'2421735','Mehatab','2421735.it.cec@cgc.edu.in','$2b$10$0y/7gho5gN9P5ab7kKhQqOuGZqvVqIf//Q8drsRgpJ3egyG/Fm1g6','student',1,'2026-03-14 05:05:31',2,0,NULL),(21,'HODIT','HODIT','prashantrohit2003@gmail.com','$2b$10$QeI4i5SKXXVZxksJpyoj2OvAGkHLJsv0QNQzsN0GKEzT4f2njJfXu','hod',1,'2026-03-14 05:22:00',2,0,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping events for database 'institution_od_demo'
--

--
-- Dumping routines for database 'institution_od_demo'
--
/*!50003 DROP PROCEDURE IF EXISTS `ensure_od_workflow_schema` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'IGNORE_SPACE,ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `ensure_od_workflow_schema`()
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'events' AND column_name = 'target_hod_id'
    ) THEN
        ALTER TABLE events ADD COLUMN target_hod_id INT NULL AFTER department_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND table_name = 'events'
          AND constraint_name = 'fk_events_target_hod'
    ) THEN
        ALTER TABLE events
            ADD CONSTRAINT fk_events_target_hod
            FOREIGN KEY (target_hod_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'od_applications' AND column_name = 'hod_id'
    ) THEN
        ALTER TABLE od_applications ADD COLUMN hod_id INT NULL AFTER event_id;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE() AND table_name = 'od_applications'
          AND constraint_name = 'fk_od_hod'
    ) THEN
        ALTER TABLE od_applications
            ADD CONSTRAINT fk_od_hod
            FOREIGN KEY (hod_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;

    ALTER TABLE od_applications
        MODIFY COLUMN status ENUM('Auto Approved', 'Pending', 'HOD Approved', 'Rejected')
        DEFAULT 'Auto Approved';
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-13  0:56:42
