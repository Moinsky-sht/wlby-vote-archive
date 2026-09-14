-- Expand existing tables without removing account or voting data.
ALTER TABLE "users" ADD COLUMN "email" TEXT,
ADD COLUMN "registration_ip_hash" TEXT,
ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_identity_present" CHECK ("phone" IS NOT NULL OR "email" IS NOT NULL);
ALTER TABLE "vote_records" ADD COLUMN "ip_hash" TEXT;

CREATE TABLE "auth_verifications" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "ip_hash" TEXT NOT NULL,
  "code_hash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "delivered" BOOLEAN NOT NULL DEFAULT false,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_verifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_auth_verification_identity_time" ON "auth_verifications"("channel", "identifier", "created_at");
CREATE INDEX "idx_auth_verification_ip_time" ON "auth_verifications"("ip_hash", "created_at");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "idx_users_registration_ip_time" ON "users"("registration_ip_hash", "created_time");
CREATE INDEX "idx_vote_records_ip_time" ON "vote_records"("ip_hash", "created_time");
CREATE INDEX "idx_vote_records_user_time" ON "vote_records"("user_id", "created_time");
