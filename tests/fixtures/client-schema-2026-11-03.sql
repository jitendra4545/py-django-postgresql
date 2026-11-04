-- TEST FIXTURE ONLY. Never import this schema into an existing client database.
-- phpMyAdmin SQL Dump
-- version 5.2.3
-- https://www.phpmyadmin.net/
--
-- Host: o56gps.myd.infomaniak.com
-- Generation Time: Nov 03, 2026 at 12:06 PM
-- Server version: 10.6.28-MariaDB-deb11-log
-- PHP Version: 8.3.36

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `o56gps_reza_drive_luxury`
--

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `subject_type` varchar(100) NOT NULL,
  `subject_id` int(10) UNSIGNED NOT NULL,
  `feature_name` varchar(100) DEFAULT NULL,
  `features_id` int(10) UNSIGNED DEFAULT NULL,
  `action` varchar(50) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `old_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`old_values`)),
  `new_values` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`new_values`)),
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `address_details`
--

CREATE TABLE `address_details` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `address` varchar(191) NOT NULL,
  `latitude` varchar(191) DEFAULT NULL,
  `longitude` varchar(191) DEFAULT NULL,
  `city_name` varchar(191) NOT NULL,
  `country_id` varchar(191) NOT NULL DEFAULT '0',
  `city_id` varchar(191) NOT NULL DEFAULT '0',
  `place_id` varchar(191) DEFAULT NULL,
  `address_json` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT '1',
  `created_by` varchar(191) DEFAULT NULL,
  `updated_by` varchar(191) DEFAULT NULL,
  `deleted_by` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agencies`
--

CREATE TABLE `agencies` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `account_manager_id` bigint(20) UNSIGNED DEFAULT NULL,
  `logo` varchar(191) DEFAULT NULL,
  `country_id` int(11) NOT NULL,
  `city` varchar(191) DEFAULT NULL,
  `state` varchar(191) DEFAULT NULL,
  `address_one` varchar(191) DEFAULT NULL,
  `address_two` varchar(191) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `fax` varchar(191) DEFAULT NULL,
  `commission` double DEFAULT NULL,
  `fixed_amount_per_agreement` double DEFAULT NULL,
  `min_payout` double DEFAULT NULL,
  `payment_cycle` int(11) DEFAULT NULL,
  `agency_reg_no` varchar(191) DEFAULT NULL,
  `agency_tax_id` varchar(191) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0: Inactive, 1: Active',
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agency_commissions`
--

CREATE TABLE `agency_commissions` (
  `id` int(10) UNSIGNED NOT NULL,
  `is_custom_updated` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `agency_id` int(11) NOT NULL,
  `commission_amount` double NOT NULL,
  `paid_amount` double NOT NULL DEFAULT 0,
  `due_amount` double NOT NULL DEFAULT 0,
  `commission_percentage` double NOT NULL,
  `status` int(11) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agency_payments`
--

CREATE TABLE `agency_payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(255) NOT NULL,
  `reservation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `agency_id` bigint(20) UNSIGNED NOT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `note` text DEFAULT NULL,
  `payment_date` date NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agents`
--

CREATE TABLE `agents` (
  `id` int(10) UNSIGNED NOT NULL,
  `agency_id` int(11) NOT NULL,
  `full_name` varchar(191) DEFAULT NULL,
  `photo` varchar(191) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `address` varchar(191) DEFAULT NULL,
  `agent_type` tinyint(4) DEFAULT NULL COMMENT '1=Agency Admin,2=Agency member',
  `user_id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_settings`
--

CREATE TABLE `agreement_settings` (
  `id` int(10) UNSIGNED NOT NULL,
  `penalty_charge` longtext DEFAULT NULL,
  `condition_1` longtext DEFAULT NULL,
  `condition_2` longtext DEFAULT NULL,
  `condition_3` longtext DEFAULT NULL,
  `footer_left` longtext DEFAULT NULL,
  `footer_center` longtext DEFAULT NULL,
  `footer_right` longtext DEFAULT NULL,
  `lang` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_signatures`
--

CREATE TABLE `agreement_signatures` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `signature` text NOT NULL,
  `signature_drop_off` text DEFAULT NULL,
  `signature_drop_off_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_url_tokens`
--

CREATE TABLE `agreement_url_tokens` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `token` varchar(191) NOT NULL,
  `customer_signature` varchar(191) DEFAULT NULL,
  `jaadcar_signature` varchar(191) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `is_seen` int(11) NOT NULL DEFAULT 0,
  `is_update` int(11) NOT NULL DEFAULT 0,
  `expired_at` timestamp NULL DEFAULT NULL,
  `customer_signature_date` date DEFAULT NULL,
  `jaadcar_signature_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_vehicle_damages_drop_off_inspections`
--

CREATE TABLE `agreement_vehicle_damages_drop_off_inspections` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL DEFAULT 0,
  `vehicle_id` int(11) NOT NULL,
  `x` varchar(191) NOT NULL,
  `y` varchar(191) NOT NULL,
  `text` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_vehicle_damages_pick_up_inspections`
--

CREATE TABLE `agreement_vehicle_damages_pick_up_inspections` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL DEFAULT 0,
  `vehicle_id` int(11) NOT NULL,
  `x` varchar(191) NOT NULL,
  `y` varchar(191) NOT NULL,
  `text` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `agreement_vehicle_inspections`
--

CREATE TABLE `agreement_vehicle_inspections` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL DEFAULT 0,
  `vehicle_id` int(11) NOT NULL,
  `pick_up_km` double DEFAULT NULL,
  `drop_off_km` double DEFAULT NULL,
  `clean_inside_pick_up` tinyint(1) DEFAULT NULL,
  `clean_inside_drop_off` tinyint(1) DEFAULT NULL,
  `clean_outside_pick_up` tinyint(1) DEFAULT NULL,
  `clean_outside_drop_off` tinyint(1) DEFAULT NULL,
  `car_papers_pick_up` tinyint(1) DEFAULT NULL,
  `car_papers_drop_off` tinyint(1) DEFAULT NULL,
  `add_navigation_pick_up` tinyint(1) DEFAULT NULL,
  `add_navigation_drop_off` tinyint(1) DEFAULT NULL,
  `tank_reading_pickup` int(11) DEFAULT NULL,
  `tank_reading_drop_off` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `application_settings`
--

CREATE TABLE `application_settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `option_key` varchar(191) NOT NULL,
  `option_value` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_languages`
--

CREATE TABLE `app_languages` (
  `id` int(10) UNSIGNED NOT NULL,
  `language` varchar(191) NOT NULL,
  `iso_code` varchar(191) NOT NULL,
  `flag` varchar(191) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=InActive',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `app_settings`
--

CREATE TABLE `app_settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `option_key` varchar(191) NOT NULL,
  `option_value` longtext DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `blogs`
--

CREATE TABLE `blogs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `title_en` varchar(191) NOT NULL,
  `slug` varchar(191) DEFAULT NULL,
  `short_description_en` longtext DEFAULT NULL,
  `description_en` longtext DEFAULT NULL,
  `title_de` varchar(255) DEFAULT NULL,
  `short_description_de` longtext DEFAULT NULL,
  `description_de` longtext DEFAULT NULL,
  `title_fr` varchar(255) DEFAULT NULL,
  `short_description_fr` longtext DEFAULT NULL,
  `description_fr` longtext DEFAULT NULL,
  `thumbnail` varchar(191) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 0,
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `meta_keywords` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `blog_views`
--

CREATE TABLE `blog_views` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `view_uuid` char(36) NOT NULL,
  `blog_id` bigint(20) UNSIGNED DEFAULT NULL,
  `page_key` varchar(20) NOT NULL,
  `visitor_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `url` varchar(255) DEFAULT NULL,
  `locale` varchar(5) DEFAULT NULL,
  `referrer_domain` varchar(150) DEFAULT NULL,
  `traffic_source` varchar(20) DEFAULT NULL,
  `is_unique_for_day` tinyint(1) NOT NULL DEFAULT 0,
  `counted` tinyint(1) NOT NULL DEFAULT 0,
  `viewed_at` datetime NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `blog_visitors`
--

CREATE TABLE `blog_visitors` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `visitor_uuid` char(36) NOT NULL,
  `fingerprint` char(64) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `ip_version` tinyint(3) UNSIGNED NOT NULL DEFAULT 4,
  `user_agent` text DEFAULT NULL,
  `browser` varchar(60) DEFAULT NULL,
  `browser_version` varchar(30) DEFAULT NULL,
  `os` varchar(60) DEFAULT NULL,
  `os_version` varchar(30) DEFAULT NULL,
  `device_type` varchar(20) DEFAULT NULL,
  `device_brand` varchar(60) DEFAULT NULL,
  `is_bot` tinyint(1) NOT NULL DEFAULT 0,
  `bot_name` varchar(80) DEFAULT NULL,
  `country_code` char(2) DEFAULT NULL,
  `country` varchar(80) DEFAULT NULL,
  `region` varchar(80) DEFAULT NULL,
  `city` varchar(80) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `timezone` varchar(60) DEFAULT NULL,
  `isp` varchar(150) DEFAULT NULL,
  `organization` varchar(150) DEFAULT NULL,
  `geo_status` varchar(12) NOT NULL DEFAULT 'pending',
  `geo_attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `geo_resolved_at` timestamp NULL DEFAULT NULL,
  `first_seen_at` timestamp NULL DEFAULT NULL,
  `last_seen_at` timestamp NULL DEFAULT NULL,
  `total_views` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cities`
--

CREATE TABLE `cities` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `country_id` int(11) NOT NULL,
  `is_capital` tinyint(1) NOT NULL DEFAULT 0,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `lat` varchar(100) DEFAULT NULL,
  `lng` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `additional_name_1` varchar(255) DEFAULT NULL,
  `additional_name_2` varchar(255) DEFAULT NULL,
  `additional_name_3` varchar(255) DEFAULT NULL,
  `additional_name_4` varchar(255) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contacts`
--

CREATE TABLE `contacts` (
  `id` int(10) UNSIGNED NOT NULL,
  `first_name` varchar(191) NOT NULL,
  `last_name` varchar(191) DEFAULT NULL,
  `email` varchar(191) NOT NULL,
  `phone` varchar(191) NOT NULL,
  `subject` varchar(191) NOT NULL,
  `pick_up_city` varchar(255) DEFAULT NULL,
  `service_type` varchar(50) DEFAULT NULL,
  `pickup_location` varchar(191) DEFAULT NULL,
  `dropoff_location` varchar(191) DEFAULT NULL,
  `pickup_date` date DEFAULT NULL,
  `pickup_time` time DEFAULT NULL,
  `dropoff_date` date DEFAULT NULL,
  `dropoff_time` time DEFAULT NULL,
  `number_of_hours` int(11) DEFAULT NULL COMMENT 'For Daily Chauffeur service',
  `flight_train_number` varchar(191) DEFAULT NULL COMMENT 'For Airport Meet & Greet service',
  `number_of_passengers` int(11) DEFAULT NULL COMMENT 'For Airport Meet & Greet service',
  `luggage_number` int(11) DEFAULT NULL COMMENT 'For Airport Meet & Greet service',
  `luggage_type` varchar(191) DEFAULT NULL COMMENT 'For Airport Meet & Greet service',
  `additional_requests` text DEFAULT NULL,
  `vehicle_id` int(11) DEFAULT NULL,
  `is_seen` int(11) NOT NULL DEFAULT 0,
  `message_details` text NOT NULL,
  `metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Stores source, utm_source, utm_medium, utm_campaign' CHECK (json_valid(`metadata`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `countries`
--

CREATE TABLE `countries` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `code` varchar(191) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0=Inactive, 1=Active',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `credit_notes`
--

CREATE TABLE `credit_notes` (
  `id` int(10) UNSIGNED NOT NULL,
  `uuid` varchar(150) DEFAULT NULL,
  `credit_note_id` varchar(191) NOT NULL,
  `credit_note_date` date NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT '€',
  `reservation_id` varchar(191) DEFAULT NULL,
  `customer_title` varchar(191) DEFAULT NULL,
  `customer_full_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(191) DEFAULT NULL,
  `customer_email` varchar(191) DEFAULT NULL,
  `customer_address` varchar(191) DEFAULT NULL,
  `customer_address_2` varchar(191) DEFAULT NULL,
  `agency_name` varchar(191) DEFAULT NULL,
  `agency_email` varchar(191) DEFAULT NULL,
  `agency_phone` varchar(191) DEFAULT NULL,
  `agency_address_1` varchar(191) DEFAULT NULL,
  `agency_address_2` varchar(191) DEFAULT NULL,
  `discount_type` enum('percentage','fixed') NOT NULL,
  `discount_value` double NOT NULL,
  `net_amount` double NOT NULL,
  `credit_amount` double NOT NULL,
  `reason` text NOT NULL,
  `refund_scope` enum('partial','full') NOT NULL,
  `privacy_policy` longtext DEFAULT NULL,
  `terms_and_condition` longtext DEFAULT NULL,
  `footer_details` longtext DEFAULT NULL,
  `credit_note_page_break_point` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `credit_note_details`
--

CREATE TABLE `credit_note_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `credit_note_id` int(11) NOT NULL,
  `order_no` double NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `service_type` varchar(191) DEFAULT NULL,
  `vehicle_type` varchar(191) DEFAULT NULL,
  `net_amount` double DEFAULT NULL,
  `tax` double DEFAULT NULL,
  `total_price` double DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `id` int(10) UNSIGNED NOT NULL,
  `uuid` varchar(255) DEFAULT NULL,
  `agency_id` int(11) DEFAULT NULL,
  `title` varchar(191) DEFAULT NULL,
  `full_name` varchar(191) NOT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `payengine_id` varchar(255) NOT NULL DEFAULT '',
  `photo` varchar(191) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `zoho_customer_id` varchar(191) DEFAULT NULL,
  `sync_zoho` tinyint(1) NOT NULL DEFAULT 0,
  `date_of_birth` date DEFAULT NULL,
  `phone_no` varchar(191) NOT NULL,
  `fax_no` varchar(191) DEFAULT NULL,
  `country` varchar(191) DEFAULT NULL,
  `country_id` int(11) DEFAULT NULL,
  `city` varchar(191) DEFAULT NULL,
  `zip_code` varchar(191) DEFAULT NULL,
  `state` varchar(191) DEFAULT NULL,
  `address_one` varchar(191) DEFAULT NULL,
  `address_two` varchar(191) DEFAULT NULL,
  `default_payment_method` varchar(191) DEFAULT NULL,
  `licence_no` varchar(191) DEFAULT NULL,
  `licence_expired_date` date DEFAULT NULL,
  `licence_image` varchar(191) DEFAULT NULL,
  `passport_no` varchar(191) DEFAULT NULL,
  `passport_expired_date` date DEFAULT NULL,
  `passport_image` varchar(191) DEFAULT NULL,
  `licence_image_back` varchar(255) DEFAULT NULL,
  `passport_image_back` varchar(255) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL,
  `is_registered` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_card_information`
--

CREATE TABLE `customer_card_information` (
  `id` int(10) UNSIGNED NOT NULL,
  `customer_id` int(11) NOT NULL,
  `card_name` varchar(191) DEFAULT NULL,
  `card_type` varchar(191) DEFAULT NULL,
  `card_no` varchar(191) DEFAULT NULL,
  `card_ccv` varchar(191) DEFAULT NULL,
  `card_expire_date` date DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active 0=InActive',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_files`
--

CREATE TABLE `customer_files` (
  `id` int(10) UNSIGNED NOT NULL,
  `customer_id` int(11) NOT NULL,
  `file_name` varchar(191) DEFAULT NULL,
  `file_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `custom_invoices`
--

CREATE TABLE `custom_invoices` (
  `id` int(10) UNSIGNED NOT NULL,
  `uuid` varchar(150) DEFAULT NULL,
  `invoice_id` varchar(191) NOT NULL,
  `office_branch_id` int(11) NOT NULL DEFAULT 1 COMMENT '1=SW 2=AU',
  `invoice_date` date NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT '	€',
  `language` varchar(10) NOT NULL DEFAULT 'EN',
  `reservation_id` varchar(191) DEFAULT NULL,
  `reservation_no` int(11) DEFAULT 0,
  `payment_method` varchar(191) DEFAULT NULL,
  `due_payment_date` date DEFAULT NULL,
  `net_amount` double NOT NULL,
  `discount` double NOT NULL DEFAULT 0,
  `grand_total_amount` double NOT NULL,
  `invoice_page_break_point` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `provider_cost` double NOT NULL DEFAULT 0,
  `customer_title` varchar(191) DEFAULT NULL,
  `customer_full_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(191) DEFAULT NULL,
  `customer_email` varchar(191) DEFAULT NULL,
  `customer_id` int(10) UNSIGNED DEFAULT NULL,
  `customer_country` varchar(191) DEFAULT NULL,
  `customer_address` varchar(191) DEFAULT NULL,
  `customer_address_2` varchar(100) DEFAULT NULL,
  `agency_name` varchar(60) DEFAULT NULL,
  `agency_address_1` varchar(100) DEFAULT NULL,
  `agency_address_2` varchar(100) DEFAULT NULL,
  `agency_email` varchar(50) DEFAULT NULL,
  `agency_phone` varchar(20) DEFAULT NULL,
  `privacy_policy` longtext DEFAULT NULL,
  `terms_and_condition` longtext DEFAULT NULL,
  `service_type` int(11) DEFAULT NULL,
  `footer_details` longtext DEFAULT NULL,
  `user_id` int(11) NOT NULL DEFAULT 1,
  `updated_by` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `email_sending_counter` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `custom_invoice_details`
--

CREATE TABLE `custom_invoice_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `custom_invoice_id` int(11) NOT NULL,
  `office_branch_id` int(11) NOT NULL DEFAULT 1,
  `order_no` double NOT NULL DEFAULT 0,
  `reservation_id` int(11) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `service_type` varchar(191) DEFAULT NULL,
  `vehicle_type` varchar(191) DEFAULT NULL,
  `net_amount` double DEFAULT NULL,
  `tax` double DEFAULT NULL,
  `total_price` double DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `developers`
--

CREATE TABLE `developers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `email` varchar(160) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `designation` varchar(120) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dev_tasks`
--

CREATE TABLE `dev_tasks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(200) NOT NULL,
  `details` text DEFAULT NULL,
  `developer_id` bigint(20) UNSIGNED DEFAULT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'feature',
  `priority` varchar(20) NOT NULL DEFAULT 'medium',
  `status` varchar(20) NOT NULL DEFAULT 'todo',
  `revision_count` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `done_at` timestamp NULL DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `reviewed_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dev_task_activities`
--

CREATE TABLE `dev_task_activities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `task_id` bigint(20) UNSIGNED NOT NULL,
  `action` varchar(20) NOT NULL,
  `from_status` varchar(20) DEFAULT NULL,
  `to_status` varchar(20) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dev_task_attachments`
--

CREATE TABLE `dev_task_attachments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `task_id` bigint(20) UNSIGNED NOT NULL,
  `original_name` varchar(191) NOT NULL,
  `path` varchar(191) NOT NULL,
  `mime` varchar(120) DEFAULT NULL,
  `size` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `uploaded_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `discount_coupons`
--

CREATE TABLE `discount_coupons` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `coupon_code` varchar(191) NOT NULL,
  `amount` double NOT NULL,
  `deduction_type` tinyint(4) NOT NULL COMMENT '1=Amount,2=%',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `max_use` int(11) DEFAULT NULL,
  `use_at` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=InActive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `drivers`
--

CREATE TABLE `drivers` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(190) DEFAULT NULL,
  `full_name` varchar(191) NOT NULL,
  `last_name` varchar(190) DEFAULT NULL,
  `photo` varchar(191) DEFAULT NULL,
  `driving_licence_no` varchar(191) DEFAULT NULL,
  `driving_licence_copy` varchar(191) DEFAULT NULL,
  `driving_licence_copy_back` varchar(255) DEFAULT NULL,
  `driving_licence_expire_date` date DEFAULT NULL,
  `country_id` int(11) NOT NULL,
  `provider_id` int(11) DEFAULT NULL,
  `city_id` int(11) DEFAULT NULL,
  `state` varchar(191) DEFAULT NULL,
  `street` varchar(190) DEFAULT NULL,
  `city` varchar(191) DEFAULT NULL,
  `zip` varchar(50) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `passport_id` varchar(255) DEFAULT NULL,
  `passport_licence_expire_date` date DEFAULT NULL,
  `passport_licence_copy` varchar(255) DEFAULT NULL,
  `passport_licence_copy_back` varchar(255) DEFAULT NULL,
  `professional_license_front` varchar(255) DEFAULT NULL,
  `professional_license_back` varchar(255) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `created_by` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `driver_files`
--

CREATE TABLE `driver_files` (
  `id` int(10) UNSIGNED NOT NULL,
  `driver_id` int(11) NOT NULL,
  `file_name` varchar(191) DEFAULT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `driver_trip_links`
--

CREATE TABLE `driver_trip_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `token` varchar(64) NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `driver_id` bigint(20) UNSIGNED NOT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `last_viewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dynamic_pages`
--

CREATE TABLE `dynamic_pages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `meta_title` varchar(191) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `meta_keywords` text DEFAULT NULL,
  `og_image` varchar(500) DEFAULT NULL,
  `phone_number` varchar(191) DEFAULT NULL,
  `phone_link` varchar(191) DEFAULT NULL,
  `whatsapp_number` varchar(191) DEFAULT NULL,
  `whatsapp_link` varchar(191) DEFAULT NULL,
  `schema_json` longtext DEFAULT NULL,
  `extra_head_html` text DEFAULT NULL,
  `extra_css` text DEFAULT NULL,
  `extra_js` text DEFAULT NULL,
  `status` enum('draft','published') NOT NULL DEFAULT 'draft',
  `published_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `dynamic_page_sections`
--

CREATE TABLE `dynamic_page_sections` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `page_id` bigint(20) UNSIGNED NOT NULL,
  `section_type` varchar(50) NOT NULL,
  `section_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`section_data`)),
  `sort_order` smallint(6) NOT NULL DEFAULT 0,
  `is_visible` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `email_templates`
--

CREATE TABLE `email_templates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `key` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `recipient` varchar(20) NOT NULL,
  `subject` varchar(191) NOT NULL,
  `body` longtext DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `error_logs`
--

CREATE TABLE `error_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `type` varchar(191) DEFAULT NULL,
  `message` text NOT NULL,
  `file` varchar(191) DEFAULT NULL,
  `line` int(11) DEFAULT NULL,
  `trace` longtext DEFAULT NULL,
  `url` text DEFAULT NULL,
  `method` varchar(10) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `headers` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`headers`)),
  `request` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`request`)),
  `user_id` varchar(191) DEFAULT NULL,
  `user_agent` varchar(191) DEFAULT NULL,
  `status_code` int(11) DEFAULT NULL,
  `environment` varchar(50) DEFAULT NULL,
  `context` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`context`)),
  `resolved` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `events`
--

CREATE TABLE `events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `slug` varchar(191) DEFAULT NULL,
  `short_description` text DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `image` varchar(191) DEFAULT NULL,
  `location` varchar(191) DEFAULT NULL,
  `event_date` datetime NOT NULL,
  `event_end_date` datetime DEFAULT NULL,
  `timezone` varchar(191) DEFAULT NULL,
  `dynamic_page_id` bigint(20) UNSIGNED DEFAULT NULL,
  `custom_link` varchar(191) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `file_managers`
--

CREATE TABLE `file_managers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `bucket_type` varchar(191) NOT NULL DEFAULT 'website_root',
  `base_url` varchar(191) NOT NULL,
  `file_path` varchar(191) NOT NULL,
  `file_org_name` varchar(191) DEFAULT NULL,
  `file_extraction` varchar(191) NOT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `front_end_reservation_itineries`
--

CREATE TABLE `front_end_reservation_itineries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `front_page_reservation_id` bigint(20) UNSIGNED NOT NULL,
  `front_page_reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `full_address` varchar(191) NOT NULL,
  `distance_form_nearest_address` int(11) NOT NULL DEFAULT 0,
  `duration` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `galleries`
--

CREATE TABLE `galleries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `slug` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gallery_images`
--

CREATE TABLE `gallery_images` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `gallery_id` varchar(191) NOT NULL,
  `file_manager_id` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice_currencies`
--

CREATE TABLE `invoice_currencies` (
  `id` int(10) UNSIGNED NOT NULL,
  `currency` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice_remarks`
--

CREATE TABLE `invoice_remarks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `invoice_id` bigint(20) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `responsible_person` varchar(191) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice_settings`
--

CREATE TABLE `invoice_settings` (
  `id` int(10) UNSIGNED NOT NULL,
  `office_branch_id` int(11) NOT NULL DEFAULT 1,
  `logo` varchar(191) DEFAULT NULL,
  `header_right` text DEFAULT NULL,
  `privacy` longtext DEFAULT NULL,
  `terms_and_condition` longtext DEFAULT NULL,
  `footer_left` longtext DEFAULT NULL,
  `footer_right` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `leaves`
--

CREATE TABLE `leaves` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `application_id` varchar(191) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Leave for this user',
  `leave_type_id` bigint(20) UNSIGNED NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `number_of_days` int(11) NOT NULL DEFAULT 0 COMMENT 'চাহিত ছুটির দিন সংখ্যা',
  `is_inside_gov_holiday` int(11) NOT NULL DEFAULT 1 COMMENT '1=Yes 2=No',
  `number_of_inside_gov_holiday` int(11) NOT NULL DEFAULT 0,
  `actual_days` int(11) NOT NULL DEFAULT 0,
  `approved_days` int(11) NOT NULL DEFAULT 0,
  `year` varchar(191) NOT NULL DEFAULT '2023',
  `status` int(11) NOT NULL DEFAULT 1 COMMENT '1=Newly Created',
  `short_description` longtext DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `leave_types`
--

CREATE TABLE `leave_types` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `title` varchar(191) NOT NULL,
  `number_of_yearly_leaves` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `locator_cities`
--

CREATE TABLE `locator_cities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `country_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `province` varchar(120) DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `timezone` varchar(64) DEFAULT NULL,
  `hero_image` varchar(255) DEFAULT NULL,
  `offices_count` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `meta_title` varchar(160) DEFAULT NULL,
  `meta_description` varchar(320) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `locator_countries`
--

CREATE TABLE `locator_countries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `region_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `iso2` char(2) NOT NULL,
  `iso3` char(3) DEFAULT NULL,
  `phone_code` varchar(8) DEFAULT NULL,
  `flag_image` varchar(255) DEFAULT NULL,
  `offices_count` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `meta_title` varchar(160) DEFAULT NULL,
  `meta_description` varchar(320) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `locator_offices`
--

CREATE TABLE `locator_offices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `city_id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `name` varchar(150) NOT NULL,
  `slug` varchar(170) NOT NULL,
  `address_line` varchar(255) NOT NULL,
  `address_extra` varchar(255) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `google_place_id` varchar(255) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(120) DEFAULT NULL,
  `whatsapp` varchar(30) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `opening_hours` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`opening_hours`)),
  `show_opening_hours` tinyint(1) NOT NULL DEFAULT 1,
  `is_headquarters` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `meta_title` varchar(160) DEFAULT NULL,
  `meta_description` varchar(320) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `locator_regions`
--

CREATE TABLE `locator_regions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(120) NOT NULL,
  `sort_order` smallint(5) UNSIGNED NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `meta_title` varchar(160) DEFAULT NULL,
  `meta_description` varchar(320) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `magic_login_tokens`
--

CREATE TABLE `magic_login_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `token` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `media_files`
--

CREATE TABLE `media_files` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `path_hash` char(40) NOT NULL,
  `path` varchar(500) NOT NULL,
  `disk` varchar(50) NOT NULL,
  `source` varchar(100) DEFAULT NULL,
  `size` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `mime_type` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `migrations`
--

CREATE TABLE `migrations` (
  `id` int(10) UNSIGNED NOT NULL,
  `migration` varchar(191) NOT NULL,
  `batch` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `model_has_roles`
--

CREATE TABLE `model_has_roles` (
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `model_type` varchar(191) NOT NULL,
  `model_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `monthly_summaries`
--

CREATE TABLE `monthly_summaries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `year` year(4) NOT NULL,
  `month` tinyint(3) UNSIGNED NOT NULL COMMENT '1-12',
  `type` varchar(191) NOT NULL COMMENT 'invoice or reservation',
  `office_branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `total_items` int(10) UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Total count of items',
  `total_amount` decimal(15,2) NOT NULL DEFAULT 0.00 COMMENT 'Total amount',
  `data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Additional flexible data in JSON format' CHECK (json_valid(`data`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` char(36) NOT NULL,
  `type` varchar(191) NOT NULL,
  `notifiable_type` varchar(191) NOT NULL,
  `notifiable_id` bigint(20) UNSIGNED NOT NULL,
  `data` text NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `odoo_sync_logs`
--

CREATE TABLE `odoo_sync_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(20) NOT NULL,
  `entity_id` bigint(20) UNSIGNED NOT NULL,
  `odoo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `action` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `message` text DEFAULT NULL,
  `request_payload` longtext DEFAULT NULL,
  `response` longtext DEFAULT NULL,
  `duration_ms` int(10) UNSIGNED DEFAULT NULL,
  `triggered_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `odoo_sync_states`
--

CREATE TABLE `odoo_sync_states` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(20) NOT NULL,
  `entity_id` bigint(20) UNSIGNED NOT NULL,
  `odoo_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pending',
  `payload_hash` varchar(40) DEFAULT NULL,
  `attempts` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `last_error` text DEFAULT NULL,
  `last_attempt_at` timestamp NULL DEFAULT NULL,
  `synced_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offers`
--

CREATE TABLE `offers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `offer_customer_id` bigint(20) UNSIGNED NOT NULL,
  `offer_number` varchar(191) NOT NULL,
  `offer_date` datetime NOT NULL,
  `discount` double NOT NULL,
  `total_amount` double NOT NULL,
  `cover_letter` longtext DEFAULT NULL,
  `terms_and_condition` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `currency` varchar(20) NOT NULL DEFAULT '€',
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offer_customers`
--

CREATE TABLE `offer_customers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `title` varchar(191) DEFAULT NULL,
  `full_name` varchar(191) DEFAULT NULL,
  `address_one` varchar(191) DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `phone_no` varchar(191) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offer_details`
--

CREATE TABLE `offer_details` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `offer_id` int(11) NOT NULL,
  `description` text DEFAULT NULL,
  `service_type` varchar(191) DEFAULT NULL,
  `vehicle_type` varchar(191) DEFAULT NULL,
  `net_amount` double DEFAULT NULL,
  `unit` double DEFAULT NULL,
  `per_day` double NOT NULL DEFAULT 0,
  `tax` double NOT NULL DEFAULT 0,
  `tax_amount` double NOT NULL DEFAULT 0,
  `total_price` double DEFAULT NULL,
  `order_no` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `office_locations`
--

CREATE TABLE `office_locations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `address` varchar(191) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 1,
  `order_id` int(11) DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `partners`
--

CREATE TABLE `partners` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `title` varchar(191) DEFAULT NULL,
  `logo_path` varchar(191) NOT NULL,
  `url` varchar(191) DEFAULT NULL,
  `type` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_resets`
--

CREATE TABLE `password_resets` (
  `email` varchar(191) NOT NULL,
  `token` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `name` varchar(191) NOT NULL,
  `guard_name` varchar(191) NOT NULL,
  `permission_group_id` bigint(20) NOT NULL,
  `note` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permission_groups`
--

CREATE TABLE `permission_groups` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `order_by` int(11) NOT NULL DEFAULT 99,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `pickup_reminder_logs`
--

CREATE TABLE `pickup_reminder_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED DEFAULT NULL,
  `recipient_type` varchar(20) NOT NULL,
  `driver_id` bigint(20) UNSIGNED DEFAULT NULL,
  `email` varchar(191) DEFAULT NULL,
  `pickup_at` datetime NOT NULL,
  `status` varchar(20) NOT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 1,
  `error` text DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `popular_cities`
--

CREATE TABLE `popular_cities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `thumbnail` varchar(191) DEFAULT NULL,
  `banner` varchar(255) DEFAULT NULL,
  `country_name` varchar(191) NOT NULL,
  `city_name` varchar(191) NOT NULL,
  `description_en` text DEFAULT NULL,
  `description_fr` longtext DEFAULT NULL,
  `description_de` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `providers`
--

CREATE TABLE `providers` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(191) DEFAULT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `city_id` int(11) DEFAULT NULL,
  `address_1` varchar(191) DEFAULT NULL,
  `address_2` varchar(191) DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `provider_type` int(11) NOT NULL DEFAULT 1,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `provider_files`
--

CREATE TABLE `provider_files` (
  `id` int(10) UNSIGNED NOT NULL,
  `provider_id` int(11) NOT NULL,
  `file_name` varchar(191) DEFAULT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refund_vouchers`
--

CREATE TABLE `refund_vouchers` (
  `id` int(10) UNSIGNED NOT NULL,
  `uuid` varchar(150) DEFAULT NULL,
  `refund_voucher_id` varchar(191) NOT NULL,
  `refund_date` date NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT '€',
  `reservation_id` varchar(191) DEFAULT NULL,
  `customer_title` varchar(191) DEFAULT NULL,
  `customer_full_name` varchar(191) DEFAULT NULL,
  `customer_phone` varchar(191) DEFAULT NULL,
  `customer_email` varchar(191) DEFAULT NULL,
  `customer_address` varchar(191) DEFAULT NULL,
  `customer_address_2` varchar(191) DEFAULT NULL,
  `agency_name` varchar(191) DEFAULT NULL,
  `agency_email` varchar(191) DEFAULT NULL,
  `agency_phone` varchar(191) DEFAULT NULL,
  `agency_address_1` varchar(191) DEFAULT NULL,
  `agency_address_2` varchar(191) DEFAULT NULL,
  `net_amount` double NOT NULL,
  `refund_amount` double NOT NULL,
  `reason` text NOT NULL,
  `refund_scope` enum('partial','full') NOT NULL,
  `privacy_policy` longtext DEFAULT NULL,
  `terms_and_condition` longtext DEFAULT NULL,
  `footer_details` longtext DEFAULT NULL,
  `refund_voucher_page_break_point` int(11) NOT NULL DEFAULT 0,
  `user_id` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `refund_voucher_details`
--

CREATE TABLE `refund_voucher_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `refund_voucher_id` int(11) NOT NULL,
  `order_no` double NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `service_type` varchar(191) DEFAULT NULL,
  `vehicle_type` varchar(191) DEFAULT NULL,
  `net_amount` double DEFAULT NULL,
  `tax` double DEFAULT NULL,
  `total_price` double DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rental_distances`
--

CREATE TABLE `rental_distances` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `span_distance` int(11) NOT NULL,
  `rent_type` int(11) NOT NULL DEFAULT 0 COMMENT '0=Default,1=Car with driver,2=Car rent,3=Transfer',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rental_durations`
--

CREATE TABLE `rental_durations` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `span_duration` int(11) NOT NULL,
  `rent_type` int(11) NOT NULL DEFAULT 0 COMMENT '0=Default,1=Car with driver,2=Car rent,3=Transfer',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rental_options`
--

CREATE TABLE `rental_options` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `title_en` varchar(255) DEFAULT NULL,
  `title_de` varchar(255) DEFAULT NULL,
  `title_fr` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `based_on` int(11) NOT NULL DEFAULT 1 COMMENT '1=Per day,2=Per rent',
  `rate_type` int(11) NOT NULL COMMENT '1=Amount, 2=Percentage',
  `amount` double NOT NULL,
  `taxable` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1=Yes,2=No',
  `rent_type` tinyint(4) NOT NULL COMMENT '1=Car with driver,2=Car rent,3=Transfer',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,0=Inactive',
  `show_on_frontend` int(11) NOT NULL DEFAULT 1 COMMENT '1=show 2=Not Show',
  `user_id` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rental_option_classes`
--

CREATE TABLE `rental_option_classes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `rental_option_id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_class_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `rental_seasons`
--

CREATE TABLE `rental_seasons` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `start` date NOT NULL,
  `end` date NOT NULL,
  `description` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservations`
--

CREATE TABLE `reservations` (
  `id` int(10) UNSIGNED NOT NULL,
  `uuid` varchar(255) DEFAULT NULL,
  `reservation_no` varchar(191) NOT NULL,
  `frontend_res_id` int(11) DEFAULT NULL,
  `service_type` int(11) NOT NULL,
  `customer_id` int(11) DEFAULT NULL,
  `agency_id` int(11) DEFAULT NULL,
  `provider_id` int(11) DEFAULT NULL,
  `payengine_payment_id` varchar(100) DEFAULT NULL,
  `reservation_form` int(11) NOT NULL DEFAULT 1 COMMENT '1=Backend User 2=Frontend',
  `provider_cost` double DEFAULT NULL,
  `currency` varchar(255) NOT NULL DEFAULT '€',
  `discount` double DEFAULT NULL,
  `discount_coupon_id` int(11) DEFAULT NULL,
  `tank_reading` int(11) DEFAULT NULL,
  `additional_driver` varchar(255) DEFAULT NULL,
  `user_id` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 0 COMMENT '0=Pending,1=Confirmed,2=Complete,3=Cancel',
  `payment_status` int(11) NOT NULL DEFAULT 0,
  `payment_method` int(11) NOT NULL DEFAULT 0,
  `payment_method_note` text DEFAULT NULL,
  `is_pick_up_and_collection` int(11) NOT NULL DEFAULT 0,
  `dev_vehicle_reserved` int(11) NOT NULL DEFAULT 0,
  `is_invoice` int(11) NOT NULL DEFAULT 0,
  `office_location_id` int(11) DEFAULT 1,
  `invoice_office_id` int(11) DEFAULT 0,
  `responsible_person_id` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `special_note` text DEFAULT NULL,
  `zoho_deal_id` varchar(191) DEFAULT NULL COMMENT 'Zoho CRM Deal ID',
  `sync_zoho_status` tinyint(4) NOT NULL DEFAULT 0 COMMENT '0=pending, 1=synced, 88=failed',
  `zoho_last_synced_at` timestamp NULL DEFAULT NULL,
  `data_sync_to_zoho` tinyint(4) NOT NULL DEFAULT 0 COMMENT '0=data modified/needs sync, 1=data synced',
  `last_zoho_sync_date` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_agreements`
--

CREATE TABLE `reservation_agreements` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `pick_up_clean_outside` tinyint(1) DEFAULT NULL,
  `drop_off_clean_outside` tinyint(1) DEFAULT NULL,
  `pick_up_clean_inside` tinyint(1) DEFAULT NULL,
  `drop_off_clean_inside` tinyint(1) DEFAULT NULL,
  `pick_up_car_paper` tinyint(1) DEFAULT NULL,
  `drop_off_car_paper` tinyint(1) DEFAULT NULL,
  `pick_up_kilometers` varchar(191) DEFAULT NULL,
  `drop_off_kilometers` varchar(191) DEFAULT NULL,
  `pick_up_navigation_system` tinyint(1) DEFAULT NULL,
  `drop_off_navigation_system` tinyint(1) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_agreement_notes`
--

CREATE TABLE `reservation_agreement_notes` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `sl` varchar(191) NOT NULL,
  `description` text NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_comments`
--

CREATE TABLE `reservation_comments` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `description` longtext NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_costs`
--

CREATE TABLE `reservation_costs` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `discount` double NOT NULL DEFAULT 0,
  `base_rate` double NOT NULL,
  `base_tax` double NOT NULL,
  `optional_cost` double NOT NULL,
  `one_way_drop_off_charge` double NOT NULL,
  `car_with_driver_extra_cost` double NOT NULL DEFAULT 0,
  `insurance_cost` double NOT NULL,
  `net_cost` double NOT NULL,
  `total_tax` double NOT NULL,
  `total_amount` double NOT NULL,
  `user_id` int(11) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_currencies`
--

CREATE TABLE `reservation_currencies` (
  `id` int(10) UNSIGNED NOT NULL,
  `currency` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_deposits`
--

CREATE TABLE `reservation_deposits` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `deposit_amount` double NOT NULL,
  `description` longtext DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0=Deposit,1=Refund',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_details`
--

CREATE TABLE `reservation_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `is_extra_service` int(11) NOT NULL DEFAULT 0,
  `days` int(11) NOT NULL DEFAULT 1,
  `is_hourly` int(11) NOT NULL DEFAULT 0,
  `approximate_distance` double NOT NULL DEFAULT 1,
  `pick_up_location` varchar(191) NOT NULL,
  `drop_off_location` varchar(191) DEFAULT NULL,
  `pick_up_date` date NOT NULL,
  `drop_off_date` date NOT NULL,
  `pick_up_time` time NOT NULL,
  `drop_off_time` time NOT NULL,
  `pick_up_country_id` int(11) NOT NULL,
  `drop_off_country_id` int(11) NOT NULL,
  `pick_up_city` varchar(255) DEFAULT NULL,
  `drop_off_city` varchar(255) DEFAULT NULL,
  `pick_up_city_id` int(11) NOT NULL DEFAULT 0,
  `drop_off_city_id` int(11) NOT NULL DEFAULT 0,
  `service_details` text DEFAULT NULL,
  `provider_id` int(11) DEFAULT NULL,
  `provider_cost` double NOT NULL DEFAULT 0,
  `other_cost` double DEFAULT NULL,
  `other_cost_note` text DEFAULT NULL,
  `agency_id` int(11) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0=Past,1=Present',
  `is_delete_history` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `old_detail_id` int(11) DEFAULT NULL,
  `special_note` longtext DEFAULT NULL,
  `trip_status_id` bigint(20) UNSIGNED DEFAULT NULL,
  `trip_status_updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `trip_status_updated_at` timestamp NULL DEFAULT NULL,
  `ops_note` longtext DEFAULT NULL,
  `ops_note_updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `ops_note_updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_discounts`
--

CREATE TABLE `reservation_discounts` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `discount_coupon_id` int(11) DEFAULT NULL,
  `discount_amount` double NOT NULL,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_discount_coupons`
--

CREATE TABLE `reservation_discount_coupons` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `discount_coupon_id` bigint(20) UNSIGNED NOT NULL,
  `front_page_reservation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reservation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `coupon_value` int(11) NOT NULL DEFAULT 0,
  `coupon_type` int(11) NOT NULL DEFAULT 2,
  `discount_amount` double NOT NULL DEFAULT 0,
  `updated_by` int(11) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_drivers`
--

CREATE TABLE `reservation_drivers` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(10) UNSIGNED NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `pick_up_date` date DEFAULT NULL,
  `pick_up_time` time DEFAULT NULL,
  `pick_up_driver_id` int(11) DEFAULT NULL,
  `drop_off_date` date DEFAULT NULL,
  `drop_off_time` time DEFAULT NULL,
  `drop_off_driver_id` int(11) DEFAULT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=InActive',
  `pick_up_driver_cost` int(11) NOT NULL DEFAULT 0,
  `drop_off_driver_cost` int(11) NOT NULL DEFAULT 0,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_driver_statuses`
--

CREATE TABLE `reservation_driver_statuses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `driver_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reservation_status_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` varchar(30) NOT NULL,
  `note` varchar(500) DEFAULT NULL,
  `source` varchar(20) NOT NULL DEFAULT 'driver_link',
  `ip` varchar(45) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_email_logs`
--

CREATE TABLE `reservation_email_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED DEFAULT NULL,
  `type` varchar(50) NOT NULL,
  `recipient_type` varchar(20) NOT NULL,
  `driver_id` bigint(20) UNSIGNED DEFAULT NULL,
  `email` varchar(191) NOT NULL,
  `subject` varchar(191) NOT NULL,
  `body` longtext DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `error` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_files`
--

CREATE TABLE `reservation_files` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) DEFAULT NULL,
  `type` int(11) DEFAULT 0,
  `file_path` varchar(191) NOT NULL,
  `description` longtext DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_flight_numbers`
--

CREATE TABLE `reservation_flight_numbers` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(10) UNSIGNED DEFAULT NULL,
  `flight_number` varchar(191) DEFAULT NULL,
  `departure_time` datetime DEFAULT NULL,
  `arrival_time` datetime DEFAULT NULL,
  `terminal` varchar(100) DEFAULT NULL,
  `countries_to_visit` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_insurances`
--

CREATE TABLE `reservation_insurances` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `vehicle_insurance_text` varchar(191) DEFAULT NULL,
  `vehicle_insurance_amount` double NOT NULL,
  `vehicle_insurance_text_en` text DEFAULT NULL,
  `vehicle_insurance_text_de` text DEFAULT NULL,
  `vehicle_insurance_text_fr` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_invoices`
--

CREATE TABLE `reservation_invoices` (
  `id` int(10) UNSIGNED NOT NULL,
  `invoice_id` varchar(191) NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `note` text DEFAULT NULL,
  `invoice_type` int(11) NOT NULL COMMENT '1=Main Invoice , 2 Additional Invoice',
  `payment_status` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1=Paid,2=Due',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_invoice_details`
--

CREATE TABLE `reservation_invoice_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_invoice_id` int(11) NOT NULL,
  `services_type` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `vehicle_type` varchar(191) DEFAULT NULL,
  `tax` double DEFAULT NULL,
  `tax_amount` double DEFAULT NULL,
  `price` double NOT NULL,
  `total_price` double NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_itineraries`
--

CREATE TABLE `reservation_itineraries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_date` date NOT NULL,
  `full_address` varchar(191) DEFAULT NULL,
  `country_id` bigint(20) UNSIGNED DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `distance` double NOT NULL DEFAULT 0,
  `duration` int(11) NOT NULL DEFAULT 0,
  `status` int(11) NOT NULL DEFAULT 1,
  `sort_numer` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_messages`
--

CREATE TABLE `reservation_messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `sender_id` bigint(20) UNSIGNED NOT NULL,
  `body` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_message_attachments`
--

CREATE TABLE `reservation_message_attachments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_message_id` bigint(20) UNSIGNED NOT NULL,
  `disk` varchar(40) NOT NULL DEFAULT 'spaces',
  `path` varchar(191) NOT NULL,
  `original_name` varchar(191) NOT NULL,
  `mime_type` varchar(120) DEFAULT NULL,
  `size` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_message_recipients`
--

CREATE TABLE `reservation_message_recipients` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_message_id` bigint(20) UNSIGNED NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  `emailed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_optional_costs`
--

CREATE TABLE `reservation_optional_costs` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `rental_option_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `rental_option_text` varchar(191) NOT NULL,
  `rent_type` int(11) NOT NULL,
  `rate_type` int(11) NOT NULL,
  `quantity` int(11) NOT NULL,
  `based_on` int(11) NOT NULL,
  `amount` double NOT NULL,
  `total_amount` double NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_other_costs`
--

CREATE TABLE `reservation_other_costs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `amount` double NOT NULL DEFAULT 0,
  `type` varchar(30) NOT NULL,
  `note` text DEFAULT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_payments`
--

CREATE TABLE `reservation_payments` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) DEFAULT NULL,
  `custom_invoices` int(11) DEFAULT NULL,
  `total_due` double NOT NULL,
  `payment_amount` double NOT NULL,
  `due_amount` double NOT NULL,
  `payment_type` int(11) NOT NULL COMMENT '1=Cash,2=Card,3=Bank Transfer,4=Other',
  `note` text DEFAULT NULL,
  `payment_date` varchar(255) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0=Pending,1=Approve,2=Cancel',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_payment_with_banks`
--

CREATE TABLE `reservation_payment_with_banks` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_payment_id` int(11) NOT NULL,
  `bank_name` varchar(191) DEFAULT NULL,
  `swift_code` varchar(191) DEFAULT NULL,
  `iban_code` varchar(191) DEFAULT NULL,
  `account_no` varchar(191) DEFAULT NULL,
  `account_name` varchar(191) DEFAULT NULL,
  `country` varchar(191) DEFAULT NULL,
  `branch` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_payment_with_cards`
--

CREATE TABLE `reservation_payment_with_cards` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_payment_id` int(11) NOT NULL,
  `card_name` varchar(191) DEFAULT NULL,
  `card_type` varchar(191) DEFAULT NULL,
  `card_no` varchar(191) DEFAULT NULL,
  `expire_date` varchar(191) DEFAULT NULL,
  `cvc_no` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_payment_with_cashes`
--

CREATE TABLE `reservation_payment_with_cashes` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_payment_id` int(11) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_payment_with_others`
--

CREATE TABLE `reservation_payment_with_others` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_payment_id` int(11) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_statuses`
--

CREATE TABLE `reservation_statuses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `slug` varchar(30) NOT NULL,
  `type` varchar(30) DEFAULT NULL,
  `driver_status` tinyint(1) NOT NULL DEFAULT 0,
  `bg_color` varchar(20) DEFAULT NULL,
  `text_color` varchar(20) DEFAULT NULL,
  `sort_order` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_taxes`
--

CREATE TABLE `reservation_taxes` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `tax` double NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_temp_vehicle_histories`
--

CREATE TABLE `reservation_temp_vehicle_histories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `old_vehicle_id` int(11) DEFAULT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_vehicles`
--

CREATE TABLE `reservation_vehicles` (
  `id` int(10) UNSIGNED NOT NULL,
  `reservation_id` int(11) NOT NULL,
  `reservation_details_id` int(11) NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `pick_up_date` date NOT NULL,
  `drop_off_date` date DEFAULT NULL,
  `pick_up_time` time NOT NULL,
  `drop_off_time` time DEFAULT NULL,
  `note` text DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `description_en` text DEFAULT NULL,
  `description_de` text DEFAULT NULL,
  `description_fr` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_vehicle_damages`
--

CREATE TABLE `reservation_vehicle_damages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` int(11) NOT NULL DEFAULT 0,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_vehicle_damage_photos`
--

CREATE TABLE `reservation_vehicle_damage_photos` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `type` int(11) DEFAULT NULL,
  `is_only_agreement` int(11) NOT NULL DEFAULT 0,
  `reservation_vehicle_damage_id` bigint(20) UNSIGNED NOT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `description` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservation_vehicle_usages_histories`
--

CREATE TABLE `reservation_vehicle_usages_histories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_details_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `pick_up_location` varchar(255) DEFAULT NULL,
  `drop_off_location` varchar(255) DEFAULT NULL,
  `pick_up_country_id` int(11) DEFAULT NULL,
  `drop_off_country_id` int(11) DEFAULT NULL,
  `pick_up_city` int(11) DEFAULT NULL,
  `drop_off_city` int(11) DEFAULT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `pick_up_date` date NOT NULL,
  `drop_off_date` date NOT NULL,
  `pick_up_time` time DEFAULT NULL,
  `drop_off_time` time DEFAULT NULL,
  `note` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(191) NOT NULL,
  `guard_name` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_has_permissions`
--

CREATE TABLE `role_has_permissions` (
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `route_access_logs`
--

CREATE TABLE `route_access_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `feature_name` varchar(100) DEFAULT NULL,
  `method` varchar(10) NOT NULL,
  `uri` varchar(500) NOT NULL,
  `route_name` varchar(191) DEFAULT NULL,
  `query_params` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`query_params`)),
  `request_body` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`request_body`)),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `status_code` smallint(5) UNSIGNED DEFAULT NULL,
  `duration_ms` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `serives_comments`
--

CREATE TABLE `serives_comments` (
  `id` int(10) UNSIGNED NOT NULL,
  `service_type` int(11) NOT NULL,
  `comment` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `services`
--

CREATE TABLE `services` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `slug` varchar(255) DEFAULT NULL,
  `image` varchar(191) DEFAULT NULL,
  `description_en` text DEFAULT NULL,
  `description_de` text DEFAULT NULL,
  `description_fr` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` varchar(191) NOT NULL,
  `user_id` int(10) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` text NOT NULL,
  `last_activity` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shifts`
--

CREATE TABLE `shifts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `title` varchar(191) NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `total_working_hours` decimal(10,2) NOT NULL DEFAULT 0.00,
  `status` int(11) NOT NULL DEFAULT 1,
  `note` varchar(255) DEFAULT NULL,
  `text_color` varchar(15) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tax_surecharges`
--

CREATE TABLE `tax_surecharges` (
  `id` int(10) UNSIGNED NOT NULL,
  `title` varchar(191) NOT NULL,
  `description` text DEFAULT NULL,
  `country_id` int(11) NOT NULL,
  `service_type` int(11) NOT NULL COMMENT '1=Limosoune,2=Rent a car,3=Transfer',
  `amount` double NOT NULL,
  `status` tinyint(1) NOT NULL COMMENT '1=Active,0=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transfer_city_wise_prices`
--

CREATE TABLE `transfer_city_wise_prices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `vehicle_class_id` bigint(20) UNSIGNED NOT NULL,
  `city_1` bigint(20) UNSIGNED NOT NULL,
  `city_2` bigint(20) UNSIGNED NOT NULL,
  `country_1` int(11) DEFAULT NULL,
  `country_2` int(11) DEFAULT NULL,
  `price` double NOT NULL DEFAULT 0,
  `transfer_city_wise_price_id` bigint(20) NOT NULL DEFAULT 0,
  `transfer_frontend_city_price_id` int(11) DEFAULT NULL,
  `transfer_frontend_city_price_updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transfer_frontend_city_classes`
--

CREATE TABLE `transfer_frontend_city_classes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `transfer_frontend_city_price_id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_class_id` bigint(20) UNSIGNED NOT NULL,
  `transfer_frontend_price_page_id` int(11) NOT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transfer_frontend_city_prices`
--

CREATE TABLE `transfer_frontend_city_prices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `city_title_1` varchar(191) DEFAULT NULL,
  `city_1` bigint(20) UNSIGNED DEFAULT NULL,
  `city_2` bigint(20) UNSIGNED DEFAULT NULL,
  `city_title_2` varchar(191) DEFAULT NULL,
  `country_1` bigint(20) UNSIGNED DEFAULT NULL,
  `country_2` bigint(20) UNSIGNED DEFAULT NULL,
  `transfer_frontend_city_price_id` bigint(20) UNSIGNED DEFAULT NULL,
  `transfer_frontend_price_page_id` int(11) DEFAULT NULL,
  `price` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transfer_frontend_price_pages`
--

CREATE TABLE `transfer_frontend_price_pages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `country_id` int(11) NOT NULL,
  `title_en` varchar(191) DEFAULT NULL,
  `title_de` varchar(191) DEFAULT NULL,
  `title_fr` varchar(191) DEFAULT NULL,
  `slug` varchar(191) NOT NULL,
  `description_en` longtext DEFAULT NULL,
  `description_de` longtext DEFAULT NULL,
  `description_fr` longtext DEFAULT NULL,
  `show_on_footer` int(11) NOT NULL DEFAULT 1,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `trusted_devices`
--

CREATE TABLE `trusted_devices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `device_token` varchar(64) NOT NULL,
  `device_name` varchar(255) DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `two_factor_auth_tokens`
--

CREATE TABLE `two_factor_auth_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` char(36) NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `code` varchar(6) NOT NULL,
  `token` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `verified_at` timestamp NULL DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_name` varchar(191) NOT NULL,
  `full_name` varchar(191) NOT NULL,
  `photo` varchar(191) DEFAULT NULL,
  `email` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0=Active, 1=Inactive',
  `role` tinyint(4) NOT NULL COMMENT '1=Admin,2=User,3=Driver,4=Agent,5=Customer',
  `lang` varchar(10) NOT NULL DEFAULT 'en',
  `remember_token` varchar(100) DEFAULT NULL,
  `ignore_2f` tinyint(4) NOT NULL DEFAULT 0 COMMENT 'Flag to bypass 2FA (0 = enforce, 1 = skip)',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_permissions`
--

CREATE TABLE `user_permissions` (
  `id` int(10) UNSIGNED NOT NULL,
  `user_id` int(11) NOT NULL,
  `url` varchar(191) NOT NULL,
  `method` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_rosters`
--

CREATE TABLE `user_rosters` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `working_date` date NOT NULL,
  `week_off_year` int(11) DEFAULT NULL,
  `is_updated` int(11) NOT NULL DEFAULT 0,
  `shift_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_absent` int(11) NOT NULL DEFAULT 0,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_shifts`
--

CREATE TABLE `user_shifts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `week_type` varchar(15) DEFAULT NULL,
  `day_name` varchar(191) NOT NULL,
  `shift_id` bigint(20) UNSIGNED DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicles`
--

CREATE TABLE `vehicles` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_class_id` int(11) NOT NULL,
  `title` varchar(191) NOT NULL,
  `thumbnail` varchar(191) DEFAULT NULL,
  `model` varchar(191) NOT NULL,
  `year` varchar(191) NOT NULL,
  `vin_no` varchar(191) NOT NULL,
  `reg_no` varchar(191) NOT NULL,
  `one_way_drop_off_charge` double NOT NULL DEFAULT 0,
  `free_km` double NOT NULL DEFAULT 0,
  `service_type` varchar(191) NOT NULL DEFAULT '[1]',
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '0= InActive,1=Available , 2=Maintanance,3=Accident,4=Sold,5=Pending Sale,6=List on site to sell,7=Disposed',
  `online_booking_status` int(11) NOT NULL DEFAULT 1,
  `user_id` int(11) NOT NULL,
  `start_km` varchar(255) DEFAULT NULL,
  `end_km` varchar(255) DEFAULT NULL,
  `current_location` text DEFAULT NULL,
  `doa_fleet` varchar(50) DEFAULT NULL,
  `close_date` varchar(50) DEFAULT NULL,
  `provider_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_blocks`
--

CREATE TABLE `vehicle_blocks` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `block_type` int(11) NOT NULL DEFAULT 1,
  `user_id` int(11) DEFAULT NULL,
  `note` text DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_brakes`
--

CREATE TABLE `vehicle_brakes` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `front_break` varchar(191) DEFAULT NULL,
  `rear_break` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_cities`
--

CREATE TABLE `vehicle_cities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `city_id` bigint(20) UNSIGNED NOT NULL,
  `country` varchar(191) NOT NULL,
  `locality` varchar(191) DEFAULT NULL,
  `city_auto_complete` varchar(191) NOT NULL,
  `administrative_area_level_1` varchar(191) DEFAULT NULL,
  `administrative_area_level_2` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_classes`
--

CREATE TABLE `vehicle_classes` (
  `id` int(10) UNSIGNED NOT NULL,
  `clone_from` int(11) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `rental_type` int(11) NOT NULL DEFAULT 0,
  `description` text NOT NULL,
  `description_de` text DEFAULT NULL,
  `description_fr` text DEFAULT NULL,
  `daily_rate` double NOT NULL,
  `weekly_rate` double NOT NULL,
  `one_way_drop_off_charge` double NOT NULL DEFAULT 1,
  `car_with_driver_free_km` double NOT NULL DEFAULT 200,
  `car_with_driver_extra_cost_per_km` double NOT NULL DEFAULT 2,
  `half_insurance_text_en` text DEFAULT NULL,
  `half_insurance_amount` double DEFAULT NULL,
  `full_insurance_text_en` text DEFAULT NULL,
  `full_insurance_amount` double DEFAULT NULL,
  `half_insurance_text` text DEFAULT NULL,
  `half_insurance_text_de` text DEFAULT NULL,
  `half_insurance_text_fr` text DEFAULT NULL,
  `full_insurance_text` text DEFAULT NULL,
  `full_insurance_text_de` text DEFAULT NULL,
  `full_insurance_text_fr` text DEFAULT NULL,
  `deposit_amount` double NOT NULL DEFAULT 0,
  `image` varchar(191) DEFAULT NULL,
  `inspection_layout` varchar(255) DEFAULT NULL,
  `status` tinyint(4) NOT NULL DEFAULT 1 COMMENT '0=Inactive,1=Active,2=Maintenance',
  `user_id` int(11) NOT NULL,
  `office_location_id` int(11) DEFAULT 1,
  `can_reservation_from_website` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_class_city_wise_base_rates`
--

CREATE TABLE `vehicle_class_city_wise_base_rates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_class_id` bigint(20) UNSIGNED NOT NULL,
  `rental_season_id` bigint(20) UNSIGNED NOT NULL DEFAULT 0,
  `country_id` bigint(20) UNSIGNED NOT NULL,
  `base_rate` double NOT NULL DEFAULT 0,
  `rate_1` double DEFAULT NULL,
  `rate_2` double DEFAULT NULL,
  `rate_3` double DEFAULT NULL,
  `rent_type` tinyint(4) NOT NULL COMMENT '1=Limousine, 2=Rent a car, 3=Transfer',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_class_countries`
--

CREATE TABLE `vehicle_class_countries` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_class_id` bigint(20) UNSIGNED NOT NULL,
  `country_id` bigint(20) UNSIGNED NOT NULL,
  `created_by` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_class_price_rates`
--

CREATE TABLE `vehicle_class_price_rates` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_class_id` int(11) NOT NULL,
  `rental_season_id` int(11) NOT NULL,
  `rental_duration_id` int(11) NOT NULL,
  `country_id` int(11) NOT NULL DEFAULT 0,
  `amount` double NOT NULL,
  `rent_type` tinyint(4) NOT NULL COMMENT '1=Limousine,3=Rent a car,4=Transfer',
  `status` tinyint(1) NOT NULL DEFAULT 1 COMMENT '1=Active,2=Inactive',
  `user_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_class_price_rate_details`
--

CREATE TABLE `vehicle_class_price_rate_details` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_class_price_rate_id` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_comments`
--

CREATE TABLE `vehicle_comments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `file_path` varchar(191) DEFAULT NULL,
  `comment` longtext NOT NULL,
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_dimensions`
--

CREATE TABLE `vehicle_dimensions` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `gross_weight` varchar(191) DEFAULT NULL,
  `kerb_weight` varchar(191) DEFAULT NULL,
  `length` varchar(191) DEFAULT NULL,
  `height` varchar(191) DEFAULT NULL,
  `width` varchar(191) DEFAULT NULL,
  `wheelbase` varchar(191) DEFAULT NULL,
  `track_front` varchar(191) DEFAULT NULL,
  `track_rear` varchar(191) DEFAULT NULL,
  `ground_clearance` varchar(191) DEFAULT NULL,
  `seating_capacity` varchar(191) DEFAULT NULL,
  `boot_capacity` varchar(191) DEFAULT NULL,
  `folded_boot_capacity` varchar(191) DEFAULT NULL,
  `fuel_capacity` varchar(191) DEFAULT NULL,
  `tyre_size` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_drive_trains`
--

CREATE TABLE `vehicle_drive_trains` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `type` varchar(191) DEFAULT NULL,
  `gears` varchar(191) DEFAULT NULL,
  `transmission` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_engines`
--

CREATE TABLE `vehicle_engines` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `fuel_type` varchar(191) NOT NULL DEFAULT 'Petrol',
  `engine_capacity` varchar(191) NOT NULL DEFAULT '0',
  `engine_layout` varchar(191) DEFAULT NULL,
  `cylinder` int(11) NOT NULL DEFAULT 0,
  `valves` int(11) NOT NULL DEFAULT 0,
  `stroke` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_exteriors`
--

CREATE TABLE `vehicle_exteriors` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `door` int(11) NOT NULL DEFAULT 2,
  `color` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_fuels`
--

CREATE TABLE `vehicle_fuels` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `fuel_type` varchar(191) NOT NULL,
  `carbon_emission` varchar(191) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_images`
--

CREATE TABLE `vehicle_images` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `image_path` varchar(191) NOT NULL,
  `is_thumbnail` tinyint(1) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_ineriors`
--

CREATE TABLE `vehicle_ineriors` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `air_condition` tinyint(1) NOT NULL DEFAULT 1,
  `hater` tinyint(1) NOT NULL DEFAULT 1,
  `sit_cover` varchar(191) DEFAULT NULL,
  `sun_roof` tinyint(1) NOT NULL DEFAULT 0,
  `alloy_wheels` tinyint(1) NOT NULL DEFAULT 0,
  `rear_split_fold` tinyint(1) NOT NULL DEFAULT 0,
  `lather_upholstery` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_inspactions`
--

CREATE TABLE `vehicle_inspactions` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `x` varchar(191) NOT NULL,
  `y` varchar(191) NOT NULL,
  `text` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_insurances`
--

CREATE TABLE `vehicle_insurances` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `half_insurance_text_en` varchar(191) NOT NULL,
  `half_insurance_amount` double NOT NULL,
  `full_insurance_text_en` varchar(191) NOT NULL,
  `full_insurance_amount` double NOT NULL,
  `half_insurance_text` text DEFAULT NULL,
  `half_insurance_text_de` text DEFAULT NULL,
  `half_insurance_text_fr` text DEFAULT NULL,
  `full_insurance_text` text DEFAULT NULL,
  `full_insurance_text_de` text DEFAULT NULL,
  `full_insurance_text_fr` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_number_plate_change_histories`
--

CREATE TABLE `vehicle_number_plate_change_histories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_1` bigint(20) UNSIGNED NOT NULL,
  `vehicle_1_reg_no` varchar(191) DEFAULT NULL,
  `vehicle_2` bigint(20) UNSIGNED NOT NULL,
  `vehicle_2_reg_no` varchar(191) DEFAULT NULL,
  `comment` text DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_original_cities`
--

CREATE TABLE `vehicle_original_cities` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `city_id` bigint(20) UNSIGNED NOT NULL,
  `country` varchar(191) NOT NULL,
  `locality` varchar(191) DEFAULT NULL,
  `city_auto_complete` varchar(191) NOT NULL,
  `administrative_area_level_1` varchar(191) DEFAULT NULL,
  `administrative_area_level_2` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_performances`
--

CREATE TABLE `vehicle_performances` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `max_power` varchar(191) DEFAULT NULL,
  `max_electric_power` varchar(191) DEFAULT NULL,
  `max_torque` varchar(191) DEFAULT NULL,
  `top_speed` varchar(191) DEFAULT NULL,
  `bhp` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_reserved_dates`
--

CREATE TABLE `vehicle_reserved_dates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_id` bigint(20) UNSIGNED NOT NULL,
  `reservation_detail_id` bigint(20) UNSIGNED NOT NULL,
  `reserved_date` date NOT NULL,
  `vehcile_block_id` int(11) DEFAULT NULL,
  `type` int(11) DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_safeties`
--

CREATE TABLE `vehicle_safeties` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `ncap_ratting` varchar(191) DEFAULT NULL,
  `driver_airbag` varchar(191) DEFAULT NULL,
  `passenger_airbag` varchar(191) DEFAULT NULL,
  `abs` varchar(191) DEFAULT NULL,
  `ebd` varchar(191) DEFAULT NULL,
  `key_less_entry` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_service_types`
--

CREATE TABLE `vehicle_service_types` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `service_type` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_status_update_logs`
--

CREATE TABLE `vehicle_status_update_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` bigint(20) UNSIGNED NOT NULL,
  `status` int(11) NOT NULL,
  `updated_by` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_suspensions`
--

CREATE TABLE `vehicle_suspensions` (
  `id` int(10) UNSIGNED NOT NULL,
  `vehicle_id` int(11) NOT NULL,
  `front` varchar(191) DEFAULT NULL,
  `rear` varchar(191) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `website_vehicles`
--

CREATE TABLE `website_vehicles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(191) NOT NULL,
  `service_type` int(11) NOT NULL DEFAULT 1 COMMENT '1=Ceff 2=Luxury Car',
  `title` varchar(191) NOT NULL,
  `slug` varchar(255) DEFAULT NULL,
  `description` longtext DEFAULT NULL,
  `description_de` longtext DEFAULT NULL,
  `description_fr` longtext DEFAULT NULL,
  `thumbnail` varchar(191) DEFAULT NULL,
  `banner` varchar(255) DEFAULT NULL,
  `available_in` varchar(255) DEFAULT 'Vienna',
  `available_in_de` varchar(255) DEFAULT NULL,
  `available_in_fr` varchar(255) DEFAULT NULL,
  `top_speed` varchar(191) DEFAULT NULL,
  `engine` varchar(191) DEFAULT NULL,
  `transmission` varchar(191) DEFAULT NULL,
  `rims` varchar(191) DEFAULT NULL,
  `brakes` varchar(191) DEFAULT NULL,
  `color` varchar(191) DEFAULT NULL,
  `passenger` int(11) DEFAULT NULL,
  `siutcase` int(11) DEFAULT NULL,
  `botled_water` varchar(191) DEFAULT NULL,
  `child_seat` varchar(191) DEFAULT NULL,
  `status` int(11) NOT NULL DEFAULT 1,
  `meta_title` varchar(255) DEFAULT NULL,
  `meta_description` text DEFAULT NULL,
  `meta_keywords` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `zoho_sync_logs`
--

CREATE TABLE `zoho_sync_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(191) NOT NULL,
  `entity_id` bigint(20) UNSIGNED NOT NULL,
  `zoho_id` varchar(191) DEFAULT NULL,
  `action` varchar(191) NOT NULL,
  `status` varchar(191) NOT NULL,
  `request_payload` text DEFAULT NULL,
  `response_data` text DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `retry_count` int(11) NOT NULL DEFAULT 0,
  `synced_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `zoho_tokens`
--

CREATE TABLE `zoho_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `access_token` text NOT NULL,
  `refresh_token` text NOT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `activity_logs_subject_type_subject_id_index` (`subject_type`,`subject_id`),
  ADD KEY `activity_logs_feature_name_created_at_index` (`feature_name`,`created_at`),
  ADD KEY `activity_logs_user_id_created_at_index` (`user_id`,`created_at`),
  ADD KEY `activity_logs_subject_id_index` (`subject_id`),
  ADD KEY `activity_logs_features_id_index` (`features_id`);

--
-- Indexes for table `address_details`
--
ALTER TABLE `address_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agencies`
--
ALTER TABLE `agencies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `agencies_name_unique` (`name`);

--
-- Indexes for table `agency_commissions`
--
ALTER TABLE `agency_commissions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `ac_reservation_id` (`reservation_id`),
  ADD KEY `ac_reservation_details_id` (`reservation_details_id`),
  ADD KEY `ac_agency_id` (`agency_id`);

--
-- Indexes for table `agency_payments`
--
ALTER TABLE `agency_payments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agents`
--
ALTER TABLE `agents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_agents_full_name` (`full_name`),
  ADD KEY `idx_agents_email` (`email`),
  ADD KEY `idx_agents_phone` (`phone`);

--
-- Indexes for table `agreement_settings`
--
ALTER TABLE `agreement_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agreement_signatures`
--
ALTER TABLE `agreement_signatures`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agreement_url_tokens`
--
ALTER TABLE `agreement_url_tokens`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `agreement_vehicle_damages_drop_off_inspections`
--
ALTER TABLE `agreement_vehicle_damages_drop_off_inspections`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`);

--
-- Indexes for table `agreement_vehicle_damages_pick_up_inspections`
--
ALTER TABLE `agreement_vehicle_damages_pick_up_inspections`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`);

--
-- Indexes for table `agreement_vehicle_inspections`
--
ALTER TABLE `agreement_vehicle_inspections`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`);

--
-- Indexes for table `application_settings`
--
ALTER TABLE `application_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `app_languages`
--
ALTER TABLE `app_languages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `app_languages_language_unique` (`language`),
  ADD UNIQUE KEY `app_languages_iso_code_unique` (`iso_code`);

--
-- Indexes for table `app_settings`
--
ALTER TABLE `app_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `blogs`
--
ALTER TABLE `blogs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `blog_views`
--
ALTER TABLE `blog_views`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `blog_views_view_uuid_unique` (`view_uuid`),
  ADD KEY `blog_views_blog_id_viewed_at_index` (`blog_id`,`viewed_at`),
  ADD KEY `blog_views_viewed_at_index` (`viewed_at`),
  ADD KEY `blog_views_visitor_id_blog_id_viewed_at_index` (`visitor_id`,`blog_id`,`viewed_at`),
  ADD KEY `blog_views_page_key_viewed_at_index` (`page_key`,`viewed_at`),
  ADD KEY `blog_views_blog_source_idx` (`blog_id`,`traffic_source`),
  ADD KEY `blog_views_user_id_foreign` (`user_id`);

--
-- Indexes for table `blog_visitors`
--
ALTER TABLE `blog_visitors`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `blog_visitors_visitor_uuid_unique` (`visitor_uuid`),
  ADD UNIQUE KEY `blog_visitors_fingerprint_unique` (`fingerprint`),
  ADD KEY `blog_visitors_ip_address_index` (`ip_address`),
  ADD KEY `blog_visitors_geo_status_geo_attempts_index` (`geo_status`,`geo_attempts`),
  ADD KEY `blog_visitors_is_bot_last_seen_at_index` (`is_bot`,`last_seen_at`),
  ADD KEY `blog_visitors_country_code_index` (`country_code`);

--
-- Indexes for table `cities`
--
ALTER TABLE `cities`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `contacts`
--
ALTER TABLE `contacts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `countries`
--
ALTER TABLE `countries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `credit_notes`
--
ALTER TABLE `credit_notes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `credit_notes_credit_note_id_unique` (`credit_note_id`);

--
-- Indexes for table `credit_note_details`
--
ALTER TABLE `credit_note_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customers_full_name` (`full_name`),
  ADD KEY `idx_customers_last_name` (`last_name`),
  ADD KEY `idx_customers_email` (`email`),
  ADD KEY `idx_customers_phone` (`phone_no`),
  ADD KEY `idx_customers_licence` (`licence_no`),
  ADD KEY `idx_customers_passport` (`passport_no`),
  ADD KEY `idx_customers_sync_zoho` (`sync_zoho`);

--
-- Indexes for table `customer_card_information`
--
ALTER TABLE `customer_card_information`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `customer_files`
--
ALTER TABLE `customer_files`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `custom_invoices`
--
ALTER TABLE `custom_invoices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `custom_invoices_invoice_id_unique` (`invoice_id`),
  ADD KEY `idx_invoices_id` (`invoice_id`),
  ADD KEY `idx_invoices_reservation` (`reservation_id`);

--
-- Indexes for table `custom_invoice_details`
--
ALTER TABLE `custom_invoice_details`
  ADD PRIMARY KEY (`id`),
  ADD KEY `cid_reservation_id` (`reservation_id`);

--
-- Indexes for table `developers`
--
ALTER TABLE `developers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `dev_tasks`
--
ALTER TABLE `dev_tasks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dev_tasks_status_index` (`status`),
  ADD KEY `dev_tasks_developer_id_index` (`developer_id`);

--
-- Indexes for table `dev_task_activities`
--
ALTER TABLE `dev_task_activities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dev_task_activities_task_id_index` (`task_id`);

--
-- Indexes for table `dev_task_attachments`
--
ALTER TABLE `dev_task_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dev_task_attachments_task_id_index` (`task_id`);

--
-- Indexes for table `discount_coupons`
--
ALTER TABLE `discount_coupons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `drivers`
--
ALTER TABLE `drivers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_drivers_full_name` (`full_name`),
  ADD KEY `idx_drivers_phone` (`phone`);

--
-- Indexes for table `driver_files`
--
ALTER TABLE `driver_files`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `driver_trip_links`
--
ALTER TABLE `driver_trip_links`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `driver_trip_links_reservation_id_driver_id_unique` (`reservation_id`,`driver_id`),
  ADD UNIQUE KEY `driver_trip_links_token_unique` (`token`);

--
-- Indexes for table `dynamic_pages`
--
ALTER TABLE `dynamic_pages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `dynamic_pages_slug_unique` (`slug`);

--
-- Indexes for table `dynamic_page_sections`
--
ALTER TABLE `dynamic_page_sections`
  ADD PRIMARY KEY (`id`),
  ADD KEY `dynamic_page_sections_page_id_sort_order_index` (`page_id`,`sort_order`);

--
-- Indexes for table `email_templates`
--
ALTER TABLE `email_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email_templates_key_unique` (`key`);

--
-- Indexes for table `error_logs`
--
ALTER TABLE `error_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `error_logs_type_created_at_index` (`type`,`created_at`),
  ADD KEY `error_logs_created_at_index` (`created_at`),
  ADD KEY `error_logs_type_index` (`type`),
  ADD KEY `error_logs_user_id_index` (`user_id`),
  ADD KEY `error_logs_resolved_index` (`resolved`);

--
-- Indexes for table `events`
--
ALTER TABLE `events`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `events_slug_unique` (`slug`),
  ADD KEY `events_dynamic_page_id_foreign` (`dynamic_page_id`);

--
-- Indexes for table `file_managers`
--
ALTER TABLE `file_managers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `front_end_reservation_itineries`
--
ALTER TABLE `front_end_reservation_itineries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `galleries`
--
ALTER TABLE `galleries`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `gallery_images`
--
ALTER TABLE `gallery_images`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `invoice_currencies`
--
ALTER TABLE `invoice_currencies`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `invoice_remarks`
--
ALTER TABLE `invoice_remarks`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `invoice_settings`
--
ALTER TABLE `invoice_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `leaves`
--
ALTER TABLE `leaves`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `leave_types`
--
ALTER TABLE `leave_types`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `locator_cities`
--
ALTER TABLE `locator_cities`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `locator_cities_country_id_slug_unique` (`country_id`,`slug`),
  ADD UNIQUE KEY `locator_cities_uuid_unique` (`uuid`),
  ADD KEY `locator_cities_country_id_is_active_sort_order_index` (`country_id`,`is_active`,`sort_order`);

--
-- Indexes for table `locator_countries`
--
ALTER TABLE `locator_countries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `locator_countries_slug_unique` (`slug`),
  ADD UNIQUE KEY `locator_countries_uuid_unique` (`uuid`),
  ADD KEY `locator_countries_region_id_is_active_sort_order_index` (`region_id`,`is_active`,`sort_order`),
  ADD KEY `locator_countries_iso2_index` (`iso2`);

--
-- Indexes for table `locator_offices`
--
ALTER TABLE `locator_offices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `locator_offices_city_id_slug_unique` (`city_id`,`slug`),
  ADD UNIQUE KEY `locator_offices_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `locator_offices_code_unique` (`code`),
  ADD KEY `locator_offices_city_id_is_active_sort_order_index` (`city_id`,`is_active`,`sort_order`),
  ADD KEY `locator_offices_latitude_longitude_index` (`latitude`,`longitude`),
  ADD KEY `locator_offices_google_place_id_index` (`google_place_id`);

--
-- Indexes for table `locator_regions`
--
ALTER TABLE `locator_regions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `locator_regions_slug_unique` (`slug`),
  ADD UNIQUE KEY `locator_regions_uuid_unique` (`uuid`),
  ADD KEY `locator_regions_is_active_sort_order_index` (`is_active`,`sort_order`);

--
-- Indexes for table `magic_login_tokens`
--
ALTER TABLE `magic_login_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `magic_login_tokens_token_unique` (`token`),
  ADD KEY `magic_login_tokens_user_id_index` (`user_id`);

--
-- Indexes for table `media_files`
--
ALTER TABLE `media_files`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `media_files_path_hash_unique` (`path_hash`);

--
-- Indexes for table `migrations`
--
ALTER TABLE `migrations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `model_has_roles`
--
ALTER TABLE `model_has_roles`
  ADD PRIMARY KEY (`role_id`,`model_id`,`model_type`),
  ADD KEY `model_has_roles_model_id_model_type_index` (`model_id`,`model_type`);

--
-- Indexes for table `monthly_summaries`
--
ALTER TABLE `monthly_summaries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_year_month_type` (`year`,`month`,`type`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `notifications_notifiable_type_notifiable_id_index` (`notifiable_type`,`notifiable_id`);

--
-- Indexes for table `odoo_sync_logs`
--
ALTER TABLE `odoo_sync_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `odoo_sync_logs_entity_type_entity_id_index` (`entity_type`,`entity_id`),
  ADD KEY `odoo_sync_logs_created_at_index` (`created_at`);

--
-- Indexes for table `odoo_sync_states`
--
ALTER TABLE `odoo_sync_states`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `odoo_sync_states_entity_type_entity_id_unique` (`entity_type`,`entity_id`),
  ADD KEY `odoo_sync_states_entity_type_status_index` (`entity_type`,`status`);

--
-- Indexes for table `offers`
--
ALTER TABLE `offers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `offer_customers`
--
ALTER TABLE `offer_customers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `offer_details`
--
ALTER TABLE `offer_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `office_locations`
--
ALTER TABLE `office_locations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `partners`
--
ALTER TABLE `partners`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `password_resets`
--
ALTER TABLE `password_resets`
  ADD KEY `password_resets_email_index` (`email`);

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permissions_name_guard_name_unique` (`name`,`guard_name`);

--
-- Indexes for table `permission_groups`
--
ALTER TABLE `permission_groups`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permission_groups_name_unique` (`name`);

--
-- Indexes for table `pickup_reminder_logs`
--
ALTER TABLE `pickup_reminder_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `pickup_reminder_lookup` (`reservation_id`,`recipient_type`,`driver_id`);

--
-- Indexes for table `popular_cities`
--
ALTER TABLE `popular_cities`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `providers`
--
ALTER TABLE `providers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `provider_files`
--
ALTER TABLE `provider_files`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `refund_vouchers`
--
ALTER TABLE `refund_vouchers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `refund_vouchers_refund_voucher_id_unique` (`refund_voucher_id`);

--
-- Indexes for table `refund_voucher_details`
--
ALTER TABLE `refund_voucher_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `rental_distances`
--
ALTER TABLE `rental_distances`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `rental_durations`
--
ALTER TABLE `rental_durations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `rental_options`
--
ALTER TABLE `rental_options`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `rental_option_classes`
--
ALTER TABLE `rental_option_classes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `rental_seasons`
--
ALTER TABLE `rental_seasons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservations`
--
ALTER TABLE `reservations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reservations_uuid_unique` (`uuid`),
  ADD KEY `frontend_res_id` (`frontend_res_id`,`customer_id`,`agency_id`,`provider_id`,`payengine_payment_id`,`discount_coupon_id`,`user_id`,`updated_by`,`office_location_id`,`invoice_office_id`,`responsible_person_id`),
  ADD KEY `idx_reservations_no` (`reservation_no`),
  ADD KEY `idx_reservations_customer` (`customer_id`),
  ADD KEY `reservations_zoho_deal_id_index` (`zoho_deal_id`),
  ADD KEY `reservations_sync_zoho_status_index` (`sync_zoho_status`),
  ADD KEY `reservations_data_sync_to_zoho_index` (`data_sync_to_zoho`);

--
-- Indexes for table `reservation_agreements`
--
ALTER TABLE `reservation_agreements`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_agreement_notes`
--
ALTER TABLE `reservation_agreement_notes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_comments`
--
ALTER TABLE `reservation_comments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`user_id`,`updated_by`);

--
-- Indexes for table `reservation_costs`
--
ALTER TABLE `reservation_costs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`user_id`),
  ADD KEY `rc_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_currencies`
--
ALTER TABLE `reservation_currencies`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_deposits`
--
ALTER TABLE `reservation_deposits`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`);

--
-- Indexes for table `reservation_details`
--
ALTER TABLE `reservation_details`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`pick_up_country_id`,`drop_off_country_id`,`pick_up_city_id`,`drop_off_city_id`,`provider_id`,`agency_id`,`old_detail_id`),
  ADD KEY `rd_res_status` (`reservation_id`,`status`),
  ADD KEY `rd_res_delhist` (`reservation_id`,`is_delete_history`),
  ADD KEY `reservation_details_trip_status_id_foreign` (`trip_status_id`);

--
-- Indexes for table `reservation_discounts`
--
ALTER TABLE `reservation_discounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`discount_coupon_id`,`user_id`);

--
-- Indexes for table `reservation_discount_coupons`
--
ALTER TABLE `reservation_discount_coupons`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_drivers`
--
ALTER TABLE `reservation_drivers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`pick_up_driver_id`,`drop_off_driver_id`,`user_id`,`updated_by`),
  ADD KEY `rd_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_driver_statuses`
--
ALTER TABLE `reservation_driver_statuses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `res_driver_status_leg` (`reservation_id`,`reservation_details_id`),
  ADD KEY `reservation_driver_statuses_reservation_status_id_foreign` (`reservation_status_id`);

--
-- Indexes for table `reservation_email_logs`
--
ALTER TABLE `reservation_email_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_email_logs_reservation_id_index` (`reservation_id`);

--
-- Indexes for table `reservation_files`
--
ALTER TABLE `reservation_files`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`user_id`);

--
-- Indexes for table `reservation_flight_numbers`
--
ALTER TABLE `reservation_flight_numbers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`),
  ADD KEY `reservation_flight_numbers_reservation_details_id_index` (`reservation_details_id`);

--
-- Indexes for table `reservation_insurances`
--
ALTER TABLE `reservation_insurances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`,`user_id`),
  ADD KEY `ri_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_invoices`
--
ALTER TABLE `reservation_invoices`
  ADD PRIMARY KEY (`id`),
  ADD KEY `invoice_id` (`invoice_id`,`reservation_id`,`user_id`);

--
-- Indexes for table `reservation_invoice_details`
--
ALTER TABLE `reservation_invoice_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_itineraries`
--
ALTER TABLE `reservation_itineraries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`country_id`);

--
-- Indexes for table `reservation_messages`
--
ALTER TABLE `reservation_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_messages_reservation_id_created_at_index` (`reservation_id`,`created_at`);

--
-- Indexes for table `reservation_message_attachments`
--
ALTER TABLE `reservation_message_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_message_attachments_reservation_message_id_index` (`reservation_message_id`);

--
-- Indexes for table `reservation_message_recipients`
--
ALTER TABLE `reservation_message_recipients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `res_msg_recipient_unique` (`reservation_message_id`,`user_id`),
  ADD KEY `reservation_message_recipients_user_id_read_at_index` (`user_id`,`read_at`);

--
-- Indexes for table `reservation_optional_costs`
--
ALTER TABLE `reservation_optional_costs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`rental_option_id`,`reservation_details_id`,`user_id`),
  ADD KEY `roc_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_other_costs`
--
ALTER TABLE `reservation_other_costs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_other_costs_reservation_details_id_index` (`reservation_details_id`),
  ADD KEY `reservation_other_costs_reservation_id_index` (`reservation_id`);

--
-- Indexes for table `reservation_payments`
--
ALTER TABLE `reservation_payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`user_id`);

--
-- Indexes for table `reservation_payment_with_banks`
--
ALTER TABLE `reservation_payment_with_banks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_payment_id` (`reservation_payment_id`);

--
-- Indexes for table `reservation_payment_with_cards`
--
ALTER TABLE `reservation_payment_with_cards`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_payment_with_cashes`
--
ALTER TABLE `reservation_payment_with_cashes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_payment_with_others`
--
ALTER TABLE `reservation_payment_with_others`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `reservation_statuses`
--
ALTER TABLE `reservation_statuses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `reservation_statuses_slug_unique` (`slug`),
  ADD KEY `reservation_statuses_driver_status_index` (`driver_status`),
  ADD KEY `reservation_statuses_type_index` (`type`);

--
-- Indexes for table `reservation_taxes`
--
ALTER TABLE `reservation_taxes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`),
  ADD KEY `rt_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_temp_vehicle_histories`
--
ALTER TABLE `reservation_temp_vehicle_histories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_details_id` (`reservation_details_id`,`reservation_vehicle_id`,`old_vehicle_id`,`reservation_id`);

--
-- Indexes for table `reservation_vehicles`
--
ALTER TABLE `reservation_vehicles`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`,`user_id`),
  ADD KEY `rv_details_status` (`reservation_details_id`,`status`);

--
-- Indexes for table `reservation_vehicle_damages`
--
ALTER TABLE `reservation_vehicle_damages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`vehicle_id`,`created_by`);

--
-- Indexes for table `reservation_vehicle_damage_photos`
--
ALTER TABLE `reservation_vehicle_damage_photos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_vehicle_damage_id` (`reservation_vehicle_damage_id`);

--
-- Indexes for table `reservation_vehicle_usages_histories`
--
ALTER TABLE `reservation_vehicle_usages_histories`
  ADD PRIMARY KEY (`id`),
  ADD KEY `reservation_id` (`reservation_id`,`reservation_details_id`,`reservation_vehicle_id`,`pick_up_country_id`,`drop_off_country_id`,`vehicle_id`,`created_by`,`updated_by`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `roles_name_guard_name_unique` (`name`,`guard_name`);

--
-- Indexes for table `role_has_permissions`
--
ALTER TABLE `role_has_permissions`
  ADD PRIMARY KEY (`permission_id`,`role_id`),
  ADD KEY `role_has_permissions_role_id_foreign` (`role_id`);

--
-- Indexes for table `route_access_logs`
--
ALTER TABLE `route_access_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `route_access_logs_user_id_created_at_index` (`user_id`,`created_at`),
  ADD KEY `route_access_logs_feature_name_created_at_index` (`feature_name`,`created_at`),
  ADD KEY `route_access_logs_uri_index` (`uri`),
  ADD KEY `route_access_logs_user_id_index` (`user_id`),
  ADD KEY `route_access_logs_feature_name_index` (`feature_name`);

--
-- Indexes for table `serives_comments`
--
ALTER TABLE `serives_comments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `services`
--
ALTER TABLE `services`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD UNIQUE KEY `sessions_id_unique` (`id`);

--
-- Indexes for table `shifts`
--
ALTER TABLE `shifts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tax_surecharges`
--
ALTER TABLE `tax_surecharges`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transfer_city_wise_prices`
--
ALTER TABLE `transfer_city_wise_prices`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transfer_frontend_city_classes`
--
ALTER TABLE `transfer_frontend_city_classes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transfer_frontend_city_prices`
--
ALTER TABLE `transfer_frontend_city_prices`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `transfer_frontend_price_pages`
--
ALTER TABLE `transfer_frontend_price_pages`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `transfer_frontend_price_pages_slug_unique` (`slug`);

--
-- Indexes for table `trusted_devices`
--
ALTER TABLE `trusted_devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `trusted_devices_device_token_unique` (`device_token`),
  ADD KEY `idx_user_device` (`user_id`,`device_token`),
  ADD KEY `idx_expires_at` (`expires_at`);

--
-- Indexes for table `two_factor_auth_tokens`
--
ALTER TABLE `two_factor_auth_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `two_factor_auth_tokens_uuid_unique` (`uuid`),
  ADD UNIQUE KEY `two_factor_auth_tokens_token_unique` (`token`),
  ADD KEY `idx_user_verified` (`user_id`,`verified_at`),
  ADD KEY `idx_expires_at` (`expires_at`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_permissions`
--
ALTER TABLE `user_permissions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_rosters`
--
ALTER TABLE `user_rosters`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `user_shifts`
--
ALTER TABLE `user_shifts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_class_id` (`vehicle_class_id`,`user_id`,`provider_id`),
  ADD KEY `vehicles_title_index` (`title`),
  ADD KEY `vehicles_model_index` (`model`),
  ADD KEY `vehicles_reg_no_index` (`reg_no`),
  ADD KEY `vehicles_year_index` (`year`);

--
-- Indexes for table `vehicle_blocks`
--
ALTER TABLE `vehicle_blocks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`user_id`,`created_by`,`updated_by`);

--
-- Indexes for table `vehicle_brakes`
--
ALTER TABLE `vehicle_brakes`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_cities`
--
ALTER TABLE `vehicle_cities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`city_id`);

--
-- Indexes for table `vehicle_classes`
--
ALTER TABLE `vehicle_classes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`,`office_location_id`);

--
-- Indexes for table `vehicle_class_city_wise_base_rates`
--
ALTER TABLE `vehicle_class_city_wise_base_rates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_class_id` (`vehicle_class_id`,`rental_season_id`,`country_id`,`user_id`);

--
-- Indexes for table `vehicle_class_countries`
--
ALTER TABLE `vehicle_class_countries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_class_id` (`vehicle_class_id`,`country_id`);

--
-- Indexes for table `vehicle_class_price_rates`
--
ALTER TABLE `vehicle_class_price_rates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_class_id` (`vehicle_class_id`,`rental_season_id`,`rental_duration_id`,`country_id`,`user_id`);

--
-- Indexes for table `vehicle_class_price_rate_details`
--
ALTER TABLE `vehicle_class_price_rate_details`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_comments`
--
ALTER TABLE `vehicle_comments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`user_id`);

--
-- Indexes for table `vehicle_dimensions`
--
ALTER TABLE `vehicle_dimensions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_drive_trains`
--
ALTER TABLE `vehicle_drive_trains`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_engines`
--
ALTER TABLE `vehicle_engines`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_exteriors`
--
ALTER TABLE `vehicle_exteriors`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_fuels`
--
ALTER TABLE `vehicle_fuels`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_images`
--
ALTER TABLE `vehicle_images`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_ineriors`
--
ALTER TABLE `vehicle_ineriors`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_inspactions`
--
ALTER TABLE `vehicle_inspactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_insurances`
--
ALTER TABLE `vehicle_insurances`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_number_plate_change_histories`
--
ALTER TABLE `vehicle_number_plate_change_histories`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_original_cities`
--
ALTER TABLE `vehicle_original_cities`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`city_id`);

--
-- Indexes for table `vehicle_performances`
--
ALTER TABLE `vehicle_performances`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_reserved_dates`
--
ALTER TABLE `vehicle_reserved_dates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`reservation_id`,`reservation_detail_id`,`vehcile_block_id`);

--
-- Indexes for table `vehicle_safeties`
--
ALTER TABLE `vehicle_safeties`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `vehicle_service_types`
--
ALTER TABLE `vehicle_service_types`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`);

--
-- Indexes for table `vehicle_status_update_logs`
--
ALTER TABLE `vehicle_status_update_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `vehicle_id` (`vehicle_id`,`updated_by`);

--
-- Indexes for table `vehicle_suspensions`
--
ALTER TABLE `vehicle_suspensions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `website_vehicles`
--
ALTER TABLE `website_vehicles`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `zoho_sync_logs`
--
ALTER TABLE `zoho_sync_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `zoho_sync_logs_entity_type_entity_id_index` (`entity_type`,`entity_id`),
  ADD KEY `zoho_sync_logs_status_created_at_index` (`status`,`created_at`),
  ADD KEY `idx_zoho_sync_logs_synced_at` (`synced_at`);

--
-- Indexes for table `zoho_tokens`
--
ALTER TABLE `zoho_tokens`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `activity_logs`
--
ALTER TABLE `activity_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `address_details`
--
ALTER TABLE `address_details`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agencies`
--
ALTER TABLE `agencies`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agency_commissions`
--
ALTER TABLE `agency_commissions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agency_payments`
--
ALTER TABLE `agency_payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agents`
--
ALTER TABLE `agents`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_settings`
--
ALTER TABLE `agreement_settings`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_signatures`
--
ALTER TABLE `agreement_signatures`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_url_tokens`
--
ALTER TABLE `agreement_url_tokens`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_vehicle_damages_drop_off_inspections`
--
ALTER TABLE `agreement_vehicle_damages_drop_off_inspections`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_vehicle_damages_pick_up_inspections`
--
ALTER TABLE `agreement_vehicle_damages_pick_up_inspections`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `agreement_vehicle_inspections`
--
ALTER TABLE `agreement_vehicle_inspections`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `application_settings`
--
ALTER TABLE `application_settings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `app_languages`
--
ALTER TABLE `app_languages`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `app_settings`
--
ALTER TABLE `app_settings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `blogs`
--
ALTER TABLE `blogs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `blog_views`
--
ALTER TABLE `blog_views`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `blog_visitors`
--
ALTER TABLE `blog_visitors`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `cities`
--
ALTER TABLE `cities`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contacts`
--
ALTER TABLE `contacts`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `countries`
--
ALTER TABLE `countries`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `credit_notes`
--
ALTER TABLE `credit_notes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `credit_note_details`
--
ALTER TABLE `credit_note_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_card_information`
--
ALTER TABLE `customer_card_information`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_files`
--
ALTER TABLE `customer_files`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `custom_invoices`
--
ALTER TABLE `custom_invoices`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `custom_invoice_details`
--
ALTER TABLE `custom_invoice_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `developers`
--
ALTER TABLE `developers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dev_tasks`
--
ALTER TABLE `dev_tasks`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dev_task_activities`
--
ALTER TABLE `dev_task_activities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dev_task_attachments`
--
ALTER TABLE `dev_task_attachments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `discount_coupons`
--
ALTER TABLE `discount_coupons`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `drivers`
--
ALTER TABLE `drivers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `driver_files`
--
ALTER TABLE `driver_files`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `driver_trip_links`
--
ALTER TABLE `driver_trip_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dynamic_pages`
--
ALTER TABLE `dynamic_pages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `dynamic_page_sections`
--
ALTER TABLE `dynamic_page_sections`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `email_templates`
--
ALTER TABLE `email_templates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `error_logs`
--
ALTER TABLE `error_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `events`
--
ALTER TABLE `events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `file_managers`
--
ALTER TABLE `file_managers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `front_end_reservation_itineries`
--
ALTER TABLE `front_end_reservation_itineries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `galleries`
--
ALTER TABLE `galleries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `gallery_images`
--
ALTER TABLE `gallery_images`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice_currencies`
--
ALTER TABLE `invoice_currencies`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice_remarks`
--
ALTER TABLE `invoice_remarks`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice_settings`
--
ALTER TABLE `invoice_settings`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `leaves`
--
ALTER TABLE `leaves`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `leave_types`
--
ALTER TABLE `leave_types`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `locator_cities`
--
ALTER TABLE `locator_cities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `locator_countries`
--
ALTER TABLE `locator_countries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `locator_offices`
--
ALTER TABLE `locator_offices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `locator_regions`
--
ALTER TABLE `locator_regions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `magic_login_tokens`
--
ALTER TABLE `magic_login_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `media_files`
--
ALTER TABLE `media_files`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `migrations`
--
ALTER TABLE `migrations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `monthly_summaries`
--
ALTER TABLE `monthly_summaries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `odoo_sync_logs`
--
ALTER TABLE `odoo_sync_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `odoo_sync_states`
--
ALTER TABLE `odoo_sync_states`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `offers`
--
ALTER TABLE `offers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `offer_customers`
--
ALTER TABLE `offer_customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `offer_details`
--
ALTER TABLE `offer_details`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `office_locations`
--
ALTER TABLE `office_locations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `partners`
--
ALTER TABLE `partners`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `permission_groups`
--
ALTER TABLE `permission_groups`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `pickup_reminder_logs`
--
ALTER TABLE `pickup_reminder_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `popular_cities`
--
ALTER TABLE `popular_cities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `providers`
--
ALTER TABLE `providers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `provider_files`
--
ALTER TABLE `provider_files`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refund_vouchers`
--
ALTER TABLE `refund_vouchers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `refund_voucher_details`
--
ALTER TABLE `refund_voucher_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rental_distances`
--
ALTER TABLE `rental_distances`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rental_durations`
--
ALTER TABLE `rental_durations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rental_options`
--
ALTER TABLE `rental_options`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rental_option_classes`
--
ALTER TABLE `rental_option_classes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `rental_seasons`
--
ALTER TABLE `rental_seasons`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservations`
--
ALTER TABLE `reservations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_agreements`
--
ALTER TABLE `reservation_agreements`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_agreement_notes`
--
ALTER TABLE `reservation_agreement_notes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_comments`
--
ALTER TABLE `reservation_comments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_costs`
--
ALTER TABLE `reservation_costs`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_currencies`
--
ALTER TABLE `reservation_currencies`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_deposits`
--
ALTER TABLE `reservation_deposits`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_details`
--
ALTER TABLE `reservation_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_discounts`
--
ALTER TABLE `reservation_discounts`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_discount_coupons`
--
ALTER TABLE `reservation_discount_coupons`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_drivers`
--
ALTER TABLE `reservation_drivers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_driver_statuses`
--
ALTER TABLE `reservation_driver_statuses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_email_logs`
--
ALTER TABLE `reservation_email_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_files`
--
ALTER TABLE `reservation_files`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_flight_numbers`
--
ALTER TABLE `reservation_flight_numbers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_insurances`
--
ALTER TABLE `reservation_insurances`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_invoices`
--
ALTER TABLE `reservation_invoices`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_invoice_details`
--
ALTER TABLE `reservation_invoice_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_itineraries`
--
ALTER TABLE `reservation_itineraries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_messages`
--
ALTER TABLE `reservation_messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_message_attachments`
--
ALTER TABLE `reservation_message_attachments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_message_recipients`
--
ALTER TABLE `reservation_message_recipients`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_optional_costs`
--
ALTER TABLE `reservation_optional_costs`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_other_costs`
--
ALTER TABLE `reservation_other_costs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_payments`
--
ALTER TABLE `reservation_payments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_payment_with_banks`
--
ALTER TABLE `reservation_payment_with_banks`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_payment_with_cards`
--
ALTER TABLE `reservation_payment_with_cards`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_payment_with_cashes`
--
ALTER TABLE `reservation_payment_with_cashes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_payment_with_others`
--
ALTER TABLE `reservation_payment_with_others`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_statuses`
--
ALTER TABLE `reservation_statuses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_taxes`
--
ALTER TABLE `reservation_taxes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_temp_vehicle_histories`
--
ALTER TABLE `reservation_temp_vehicle_histories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_vehicles`
--
ALTER TABLE `reservation_vehicles`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_vehicle_damages`
--
ALTER TABLE `reservation_vehicle_damages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_vehicle_damage_photos`
--
ALTER TABLE `reservation_vehicle_damage_photos`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `reservation_vehicle_usages_histories`
--
ALTER TABLE `reservation_vehicle_usages_histories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `route_access_logs`
--
ALTER TABLE `route_access_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `serives_comments`
--
ALTER TABLE `serives_comments`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `services`
--
ALTER TABLE `services`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shifts`
--
ALTER TABLE `shifts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tax_surecharges`
--
ALTER TABLE `tax_surecharges`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transfer_city_wise_prices`
--
ALTER TABLE `transfer_city_wise_prices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transfer_frontend_city_classes`
--
ALTER TABLE `transfer_frontend_city_classes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transfer_frontend_city_prices`
--
ALTER TABLE `transfer_frontend_city_prices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transfer_frontend_price_pages`
--
ALTER TABLE `transfer_frontend_price_pages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `trusted_devices`
--
ALTER TABLE `trusted_devices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `two_factor_auth_tokens`
--
ALTER TABLE `two_factor_auth_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_permissions`
--
ALTER TABLE `user_permissions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_rosters`
--
ALTER TABLE `user_rosters`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user_shifts`
--
ALTER TABLE `user_shifts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicles`
--
ALTER TABLE `vehicles`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_blocks`
--
ALTER TABLE `vehicle_blocks`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_brakes`
--
ALTER TABLE `vehicle_brakes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_cities`
--
ALTER TABLE `vehicle_cities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_classes`
--
ALTER TABLE `vehicle_classes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_class_city_wise_base_rates`
--
ALTER TABLE `vehicle_class_city_wise_base_rates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_class_countries`
--
ALTER TABLE `vehicle_class_countries`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_class_price_rates`
--
ALTER TABLE `vehicle_class_price_rates`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_class_price_rate_details`
--
ALTER TABLE `vehicle_class_price_rate_details`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_comments`
--
ALTER TABLE `vehicle_comments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_dimensions`
--
ALTER TABLE `vehicle_dimensions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_drive_trains`
--
ALTER TABLE `vehicle_drive_trains`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_engines`
--
ALTER TABLE `vehicle_engines`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_exteriors`
--
ALTER TABLE `vehicle_exteriors`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_fuels`
--
ALTER TABLE `vehicle_fuels`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_images`
--
ALTER TABLE `vehicle_images`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_ineriors`
--
ALTER TABLE `vehicle_ineriors`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_inspactions`
--
ALTER TABLE `vehicle_inspactions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_insurances`
--
ALTER TABLE `vehicle_insurances`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_number_plate_change_histories`
--
ALTER TABLE `vehicle_number_plate_change_histories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_original_cities`
--
ALTER TABLE `vehicle_original_cities`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_performances`
--
ALTER TABLE `vehicle_performances`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_reserved_dates`
--
ALTER TABLE `vehicle_reserved_dates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_safeties`
--
ALTER TABLE `vehicle_safeties`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_service_types`
--
ALTER TABLE `vehicle_service_types`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_status_update_logs`
--
ALTER TABLE `vehicle_status_update_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_suspensions`
--
ALTER TABLE `vehicle_suspensions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `website_vehicles`
--
ALTER TABLE `website_vehicles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `zoho_sync_logs`
--
ALTER TABLE `zoho_sync_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `zoho_tokens`
--
ALTER TABLE `zoho_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD CONSTRAINT `activity_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `blog_views`
--
ALTER TABLE `blog_views`
  ADD CONSTRAINT `blog_views_blog_id_foreign` FOREIGN KEY (`blog_id`) REFERENCES `blogs` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `blog_views_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `blog_views_visitor_id_foreign` FOREIGN KEY (`visitor_id`) REFERENCES `blog_visitors` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `dynamic_page_sections`
--
ALTER TABLE `dynamic_page_sections`
  ADD CONSTRAINT `dynamic_page_sections_page_id_foreign` FOREIGN KEY (`page_id`) REFERENCES `dynamic_pages` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `events`
--
ALTER TABLE `events`
  ADD CONSTRAINT `events_dynamic_page_id_foreign` FOREIGN KEY (`dynamic_page_id`) REFERENCES `dynamic_pages` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `locator_cities`
--
ALTER TABLE `locator_cities`
  ADD CONSTRAINT `locator_cities_country_id_foreign` FOREIGN KEY (`country_id`) REFERENCES `locator_countries` (`id`);

--
-- Constraints for table `locator_countries`
--
ALTER TABLE `locator_countries`
  ADD CONSTRAINT `locator_countries_region_id_foreign` FOREIGN KEY (`region_id`) REFERENCES `locator_regions` (`id`);

--
-- Constraints for table `locator_offices`
--
ALTER TABLE `locator_offices`
  ADD CONSTRAINT `locator_offices_city_id_foreign` FOREIGN KEY (`city_id`) REFERENCES `locator_cities` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `model_has_roles`
--
ALTER TABLE `model_has_roles`
  ADD CONSTRAINT `model_has_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reservation_details`
--
ALTER TABLE `reservation_details`
  ADD CONSTRAINT `reservation_details_trip_status_id_foreign` FOREIGN KEY (`trip_status_id`) REFERENCES `reservation_statuses` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `reservation_driver_statuses`
--
ALTER TABLE `reservation_driver_statuses`
  ADD CONSTRAINT `reservation_driver_statuses_reservation_status_id_foreign` FOREIGN KEY (`reservation_status_id`) REFERENCES `reservation_statuses` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `role_has_permissions`
--
ALTER TABLE `role_has_permissions`
  ADD CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `route_access_logs`
--
ALTER TABLE `route_access_logs`
  ADD CONSTRAINT `route_access_logs_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `trusted_devices`
--
ALTER TABLE `trusted_devices`
  ADD CONSTRAINT `trusted_devices_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `two_factor_auth_tokens`
--
ALTER TABLE `two_factor_auth_tokens`
  ADD CONSTRAINT `two_factor_auth_tokens_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
