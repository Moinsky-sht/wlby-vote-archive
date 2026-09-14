CREATE TABLE "login_throttles" (
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMP(3) NOT NULL,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "idx_login_throttles_scope_updated" ON "login_throttles"("scope", "updated_at");
CREATE INDEX "idx_login_throttles_locked_until" ON "login_throttles"("locked_until");
