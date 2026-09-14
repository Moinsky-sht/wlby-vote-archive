-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "token" TEXT,
    "token_expire_time" TIMESTAMP(3),
    "created_time" TIMESTAMP(3) NOT NULL,
    "last_login_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "vote_date" TEXT NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vote_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_token_key" ON "users"("token");

-- CreateIndex
CREATE INDEX "idx_vote_records_user_theme_date" ON "vote_records"("user_id", "theme_id", "vote_date");

-- CreateIndex
CREATE INDEX "idx_vote_records_user_date" ON "vote_records"("user_id", "vote_date");

-- CreateIndex
CREATE INDEX "idx_vote_records_work" ON "vote_records"("work_id");

-- CreateIndex
CREATE INDEX "idx_vote_records_date" ON "vote_records"("vote_date");

-- Migrate existing PostgreSQL vote rows into database-backed users and vote_records.
INSERT INTO "users" ("id", "phone", "token", "token_expire_time", "created_time", "last_login_time")
SELECT
    'user_' || md5("phone") AS "id",
    "phone",
    NULL AS "token",
    NULL AS "token_expire_time",
    MIN("created_at") AS "created_time",
    MAX("created_at") AS "last_login_time"
FROM "votes"
GROUP BY "phone"
ON CONFLICT ("phone") DO NOTHING;

INSERT INTO "vote_records" ("id", "user_id", "work_id", "theme_id", "vote_date", "created_time")
SELECT
    "votes"."id",
    "users"."id" AS "user_id",
    "votes"."work_id",
    "votes"."theme_id",
    "votes"."day" AS "vote_date",
    "votes"."created_at" AS "created_time"
FROM "votes"
JOIN "users" ON "users"."phone" = "votes"."phone"
ON CONFLICT ("id") DO NOTHING;

-- AddForeignKey
ALTER TABLE "vote_records" ADD CONSTRAINT "vote_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_records" ADD CONSTRAINT "vote_records_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_records" ADD CONSTRAINT "vote_records_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
