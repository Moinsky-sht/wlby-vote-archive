-- Add password-based account fields without removing legacy phone tokens.
ALTER TABLE "users"
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "temporary_password_expires_at" TIMESTAMP(3),
  ADD COLUMN "password_updated_at" TIMESTAMP(3);

-- Persistent, multi-device user login sessions.
CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "last_seen_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");
CREATE INDEX "idx_user_sessions_user" ON "user_sessions"("user_id");
CREATE INDEX "idx_user_sessions_expires" ON "user_sessions"("expires_at");
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Registration-only SMS codes and persistent anti-abuse counters.
CREATE TABLE "sms_verifications" (
  "id" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "day" TEXT NOT NULL,
  "send_ip" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sms_verifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_sms_phone_day" ON "sms_verifications"("phone", "day");
CREATE INDEX "idx_sms_ip_day" ON "sms_verifications"("send_ip", "day");
CREATE INDEX "idx_sms_phone_purpose_created" ON "sms_verifications"("phone", "purpose", "created_at");

-- Auditable administrator password-reset operations.
CREATE TABLE "admin_audit_logs" (
  "id" TEXT NOT NULL,
  "admin_user_id" TEXT NOT NULL,
  "target_user_id" TEXT,
  "action" TEXT NOT NULL,
  "ip" TEXT NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_admin_audit_admin_created" ON "admin_audit_logs"("admin_user_id", "created_at");
CREATE INDEX "idx_admin_audit_target_created" ON "admin_audit_logs"("target_user_id", "created_at");
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_admin_user_id_fkey"
  FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_user_id_fkey"
  FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
