-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "app_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "themes" (
    "id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "themes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "works" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "team" TEXT,
    "theme_id" TEXT NOT NULL,
    "theme_name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "cover" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "votes" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "meta_json" JSONB,

    CONSTRAINT "works_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_media" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "poster" TEXT,
    "title" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "work_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "theme_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "phone" TEXT,
    "path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "day" TEXT NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "work_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "visitor_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "works_code_key" ON "works"("code");

-- CreateIndex
CREATE INDEX "idx_works_status_order" ON "works"("status", "display_order");

-- CreateIndex
CREATE INDEX "idx_works_theme" ON "works"("theme_id");

-- CreateIndex
CREATE INDEX "idx_votes_phone_day" ON "votes"("phone", "day");

-- CreateIndex
CREATE INDEX "idx_votes_work" ON "votes"("work_id");

-- CreateIndex
CREATE INDEX "idx_visits_day" ON "visits"("day");

-- CreateIndex
CREATE INDEX "idx_visits_identity" ON "visits"("visitor_id", "phone", "path", "created_at");

-- CreateIndex
CREATE INDEX "idx_reports_work" ON "reports"("work_id");

-- CreateIndex
CREATE INDEX "idx_reports_status" ON "reports"("status");

-- AddForeignKey
ALTER TABLE "works" ADD CONSTRAINT "works_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "themes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_media" ADD CONSTRAINT "work_media_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_work_id_fkey" FOREIGN KEY ("work_id") REFERENCES "works"("id") ON DELETE CASCADE ON UPDATE CASCADE;
