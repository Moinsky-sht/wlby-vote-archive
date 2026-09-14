CREATE TABLE "user_login_audits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "visitor_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_login_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_user_login_audits_user_created" ON "user_login_audits"("user_id", "created_at");
CREATE INDEX "idx_user_login_audits_ip_created" ON "user_login_audits"("ip", "created_at");

ALTER TABLE "user_login_audits"
ADD CONSTRAINT "user_login_audits_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
