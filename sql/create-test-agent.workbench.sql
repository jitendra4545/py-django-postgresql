-- TEST DATABASE ONLY. Select your imported schema in MySQL Workbench first.
-- Existing tables only. Non-QA accounts are never reset or overwritten.
-- Run the ENTIRE file. Email: agent.qa@driveluxury.test; password is supplied to generator.
-- Match the legacy varchar columns even when MySQL 8/Workbench defaults to utf8mb4_0900_ai_ci.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET @seed_lock = GET_LOCK('driveluxury_mobile_qa_v260',10);
START TRANSACTION;
SET @qa_email = _utf8mb4'agent.qa@driveluxury.test' COLLATE utf8mb4_unicode_ci;
SET @qa_client_email = _utf8mb4'client.qa@driveluxury.test' COLLATE utf8mb4_unicode_ci;
SET @qa_agency_name = _utf8mb4'Drive Luxury Mobile QA v260' COLLATE utf8mb4_unicode_ci;
SET @qa_country = (SELECT id FROM countries WHERE status=1 AND deleted_at IS NULL ORDER BY (code='CH') DESC,id LIMIT 1);
SET @qa_email_count = (SELECT COUNT(*) FROM users WHERE email=@qa_email);
SET @qa_client_email_count = (SELECT COUNT(*) FROM users WHERE email=@qa_client_email);
SET @qa_existing = (SELECT COUNT(*) FROM agents a JOIN users u ON u.id=a.user_id JOIN agencies ag ON ag.id=a.agency_id
 WHERE u.email=@qa_email AND u.full_name='Mobile QA Agent v260' AND u.role=4 AND u.status=0 AND u.deleted_at IS NULL
 AND a.deleted_at IS NULL AND ag.name=@qa_agency_name AND ag.agency_reg_no='DL-MOBILE-QA-V260' AND ag.status=1 AND ag.deleted_at IS NULL);
SET @qa_existing_client = (SELECT COUNT(*) FROM customers c JOIN users u ON u.id=c.user_id JOIN agencies ag ON ag.id=c.agency_id
 WHERE u.email=@qa_client_email AND u.full_name='Mobile QA Client v260' AND u.role=5 AND u.status=0 AND u.deleted_at IS NULL
 AND c.full_name='Mobile QA Client v260' AND c.status=1 AND c.deleted_at IS NULL
 AND ag.name=@qa_agency_name AND ag.agency_reg_no='DL-MOBILE-QA-V260' AND ag.status=1 AND ag.deleted_at IS NULL);
SET @qa_safe = (@seed_lock=1 AND @qa_country IS NOT NULL AND
 ((@qa_email_count=0 AND NOT EXISTS(SELECT 1 FROM agencies WHERE name=@qa_agency_name)) OR (@qa_email_count=1 AND @qa_existing=1))
 AND ((@qa_client_email_count=0) OR (@qa_client_email_count=1 AND @qa_existing_client=1)));
INSERT INTO users(user_name,full_name,email,password,status,role,lang,created_at,updated_at)
 SELECT @qa_email,'Mobile QA Agent v260',@qa_email,'$2y$12$r482Mo9Aena.vKPgsYLyv.gFVJAY0HZj5qY/VhvNvNuTWTv.u1Xei',0,4,'en',NOW(),NOW() WHERE @qa_safe AND @qa_email_count=0;
SET @qa_user = (SELECT id FROM users WHERE email=@qa_email AND role=4 AND full_name='Mobile QA Agent v260' AND status=0 AND deleted_at IS NULL ORDER BY id LIMIT 1);
INSERT INTO agencies(name,user_id,country_id,commission,agency_reg_no,status,created_by,created_at,updated_at)
 SELECT @qa_agency_name,@qa_user,@qa_country,10,'DL-MOBILE-QA-V260',1,@qa_user,NOW(),NOW()
 WHERE @qa_safe AND NOT EXISTS(SELECT 1 FROM agencies WHERE name=@qa_agency_name);
SET @qa_agency = (SELECT id FROM agencies WHERE name=@qa_agency_name AND agency_reg_no='DL-MOBILE-QA-V260' AND status=1 AND deleted_at IS NULL LIMIT 1);
UPDATE agencies SET commission=10,updated_at=NOW() WHERE @qa_safe AND id=@qa_agency AND COALESCE(commission,0)<>10;
INSERT INTO agents(agency_id,full_name,email,agent_type,user_id,created_by,created_at,updated_at)
 SELECT @qa_agency,'Mobile QA Agent v260',@qa_email,2,@qa_user,@qa_user,NOW(),NOW()
 WHERE @qa_safe AND NOT EXISTS(SELECT 1 FROM agents WHERE user_id=@qa_user);
SET @qa_agent = (SELECT id FROM agents WHERE user_id=@qa_user AND agency_id=@qa_agency AND deleted_at IS NULL LIMIT 1);
INSERT INTO users(user_name,full_name,email,password,status,role,lang,created_at,updated_at)
 SELECT @qa_client_email,'Mobile QA Client v260',@qa_client_email,'$2y$12$92XGa7qyrO8.YJ6lDH5uluXjA9HqURkWxS7WsA3658HBeRm9TnYVS',0,5,'en',NOW(),NOW()
 WHERE @qa_safe AND @qa_client_email_count=0;
SET @qa_client_user = (SELECT id FROM users WHERE email=@qa_client_email AND role=5 AND full_name='Mobile QA Client v260' AND status=0 AND deleted_at IS NULL ORDER BY id LIMIT 1);
INSERT INTO customers(uuid,agency_id,full_name,email,phone_no,country_id,status,user_id,created_by,is_registered,created_at,updated_at)
 SELECT UUID(),@qa_agency,'Mobile QA Client v260',@qa_client_email,'+41000000000',@qa_country,1,@qa_client_user,@qa_user,1,NOW(),NOW()
 WHERE @qa_safe AND NOT EXISTS(SELECT 1 FROM customers WHERE user_id=@qa_client_user AND deleted_at IS NULL);
SET @qa_customer = (SELECT id FROM customers WHERE user_id=@qa_client_user AND agency_id=@qa_agency AND status=1 AND deleted_at IS NULL LIMIT 1);
INSERT INTO app_agent_customer_assignments(agent_id,customer_id,agency_id,status,preferences,assigned_by_user_id,assigned_at,created_at,updated_at)
 SELECT @qa_agent,@qa_customer,@qa_agency,'ACTIVE','{}',@qa_user,NOW(),NOW(),NOW()
 WHERE @qa_safe AND @qa_agent IS NOT NULL AND @qa_customer IS NOT NULL
 ON DUPLICATE KEY UPDATE agency_id=VALUES(agency_id),status='ACTIVE',assigned_by_user_id=VALUES(assigned_by_user_id),assigned_at=NOW(),updated_at=NOW();
COMMIT;
SELECT IF(@qa_safe,'READY: test agent created or already exists','STOP: missing active country, identity collision, or lock unavailable') AS result,
 IF(@qa_safe,@qa_email,NULL) AS login_email,IF(@qa_safe,@qa_user,NULL) AS user_id,
 IF(@qa_safe,@qa_agency,NULL) AS agency_id,IF(@qa_safe,@qa_agent,NULL) AS agent_id,
 IF(@qa_safe,@qa_customer,NULL) AS booking_customer_id,IF(@qa_safe,@qa_client_email,NULL) AS test_client_email;
DO RELEASE_LOCK('driveluxury_mobile_qa_v260');
