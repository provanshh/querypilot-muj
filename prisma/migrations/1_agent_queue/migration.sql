-- CreateTable
CREATE TABLE "qp_meta"."agent_tasks" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "worker_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qp_meta"."agent_workers" (
    "id" TEXT NOT NULL,
    "agents" TEXT[],
    "host" TEXT NOT NULL,
    "pid" INTEGER NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tasks_done" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_workers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_tasks_claim_idx" ON "qp_meta"."agent_tasks"("status", "agent", "created_at");

-- CreateIndex
CREATE INDEX "agent_tasks_run_idx" ON "qp_meta"."agent_tasks"("run_id");

