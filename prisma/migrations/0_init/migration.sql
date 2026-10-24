-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "qp_meta";

-- CreateTable
CREATE TABLE "qp_meta"."runs" (
    "id" TEXT NOT NULL,
    "island" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "boss_id" TEXT,
    "level_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "answer" TEXT,
    "engine" TEXT,
    "started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "verdict" JSONB,
    "source" TEXT,
    "mode" TEXT,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qp_meta"."events" (
    "run_id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "ts" TIMESTAMPTZ(6) NOT NULL,
    "type" TEXT NOT NULL,
    "agent_id" TEXT,
    "summary" TEXT,
    "table_ids" TEXT[],
    "metadata" JSONB,

    CONSTRAINT "events_pkey" PRIMARY KEY ("run_id","seq")
);

-- CreateTable
CREATE TABLE "qp_meta"."uploads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema_name" TEXT NOT NULL,
    "table_name" TEXT NOT NULL,
    "row_count" INTEGER,
    "col_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qp_meta"."datasets" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org" TEXT,
    "tagline" TEXT,
    "messy_schema" TEXT NOT NULL,
    "clean_schema" TEXT,
    "rules" JSONB NOT NULL DEFAULT '[]',
    "row_count" INTEGER,
    "installed_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qp_meta"."tg_chats" (
    "chat_id" BIGINT NOT NULL,
    "title" TEXT,
    "dataset" TEXT,
    "follow" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tg_chats_pkey" PRIMARY KEY ("chat_id")
);

-- CreateIndex
CREATE INDEX "runs_started_idx" ON "qp_meta"."runs"("started_at" DESC);

