-- MySQL dump 10.13  Distrib 9.6.0, for macos15 (arm64)
--
-- Host: localhost    Database: institution_od_platform
-- ------------------------------------------------------
-- Server version	9.6.0-commercial

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

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ 'a2eabe40-0b0c-11f1-b279-08cef04ba457:1-223';

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
  CONSTRAINT `events_ibfk_1` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_organizer` FOREIGN KEY (`organizer_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (8,1,8,'discussion','2026-03-13','2026-03-13',0,'Pending',NULL,'2026-03-13 10:19:27',1,'09:47:00','16:30:00',0,0,'pending'),(9,1,8,'discussion','2026-03-13','2026-03-13',0,'Pending',NULL,'2026-03-13 10:19:28',1,'09:47:00','16:30:00',0,0,'pending');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
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
  `applied_date` date NOT NULL,
  `status` enum('Auto Approved','Rejected') DEFAULT 'Auto Approved',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `event_id` (`event_id`),
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
INSERT INTO `users` VALUES (1,'ADMIN001','Super Admin','admin@college.com','$2b$10$XcjulSWvM3GOV7Ha3PO3ruTGWlcq2o3FUXYI2kc2rncK9gBB4MHYe','super_admin',1,'2026-03-02 12:59:38',1,0,NULL),(2,'HOD001','Dr. Sharma','hodcse@college.com','hod123','hod',1,'2026-03-02 12:59:45',1,0,NULL),(5,'HOD002','Dr. Mehta','hodit@college.com','$2b$10$DrEawGibUs3b.dETjLJx1OaRK0gdg8QSplhhC1cq5NwStxbpeN3pG','hod',1,'2026-03-02 13:42:39',2,0,NULL),(8,'ORG010','Organizer Test','orgtest@college.com','$2b$10$2a6IeUCuloG0Z7ZAzJvpJ.wG0qfaeLakmF36JiMXFOq8iA5ZnEeSm','organizer',1,'2026-03-05 12:14:40',1,0,NULL),(12,'2421756','Prashant Kumar','2421756.it.cec@cgc.edu.in','$2b$10$BBudNp1VBxIjWStqYp2KQey0FZl0.Ob3kbq3CilkQYRIrwoQuGGAm','student',1,'2026-03-07 22:23:13',1,0,NULL),(14,'24221731','Manisha Kumari','2421731.it.cec@cgc.edu.in','$2b$10$2NipVdbZ1FcuTaj.Ikt69u9UE5zo6kf42DMGMJ5pZVGilJHKuw9R2','student',1,'2026-03-14 05:02:36',2,0,NULL),(15,'24221732','Manisha Rani','2421732.it.cec@cgc.edu.in','$2b$10$.4bU87OcfLcUfv/YE84wbuVsM1GXJ0j76gGsIhvSXXUlvA8VOcxYS','student',1,'2026-03-14 05:03:18',2,0,NULL),(17,'24221739','Muskan Kumari','2421739.it.cec@cgc.edu.in','$2b$10$bPGVQU/gHvGW5T3VzaRSt.jlAQNlJoaWBhO9ww9IbY5WBCY0njBha','student',1,'2026-03-14 05:04:10',2,0,NULL),(18,'2421735','Mehatab','2421735.it.cec@cgc.edu.in','$2b$10$0y/7gho5gN9P5ab7kKhQqOuGZqvVqIf//Q8drsRgpJ3egyG/Fm1g6','student',1,'2026-03-14 05:05:31',2,0,NULL),(21,'HODIT','HODIT','prashantrohit2003@gmail.com','$2b$10$QeI4i5SKXXVZxksJpyoj2OvAGkHLJsv0QNQzsN0GKEzT4f2njJfXu','hod',1,'2026-03-14 05:22:00',2,0,NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-15 13:49:43
