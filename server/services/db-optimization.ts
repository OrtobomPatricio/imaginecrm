import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../_core/logger";

/**
 * Creates covering indexes and CHECK constraints for database optimization.
 * Safe to run multiple times (uses IF NOT EXISTS).
 *
 * Covering indexes include all columns needed by frequent queries,
 * allowing MySQL to satisfy queries entirely from the index without
 * hitting the table data (a "covering" or "index-only" scan).
 */
export async function optimizeDatabaseIndexes(): Promise<void> {
    const db = await getDb();
    if (!db) {
        logger.warn("Cannot optimize indexes: database not available");
        return;
    }

    const indexStatements = [
        // ── Covering Indexes for Frequent Queries ──

        // Leads list: filtered by tenantId + status, covering name, phone, createdAt
        `CREATE INDEX idx_leads_tenant_status_covering
         ON leads(tenantId, status, createdAt, name, phone)`,

        // Leads search by phone (exact lookup)
        `CREATE INDEX idx_leads_tenant_phone
         ON leads(tenantId, phone)`,

        // Chat messages: conversation lookup sorted by createdAt
        `CREATE INDEX idx_chatmsg_conv_timestamp
         ON chat_messages(conversationId, createdAt DESC)`,

        // Chat messages: tenant + conversation covering content for search
        `CREATE INDEX idx_chatmsg_tenant_conv
         ON chat_messages(tenantId, conversationId, createdAt)`,

        // Conversations: tenant + status + lastMessageAt for helpdesk listing
        `CREATE INDEX idx_conv_tenant_status_lastmsg
         ON conversations(tenantId, status, lastMessageAt DESC)`,

        // Conversations: tenant + assignedToId for agent filtering
        `CREATE INDEX idx_conv_tenant_assigned
         ON conversations(tenantId, assignedToId)`,

        // Pipeline stages: tenant + pipeline for kanban
        `CREATE INDEX idx_pipestages_tenant_pipeline
         ON pipeline_stages(tenantId, pipelineId, \`order\`)`,

        // Lead tasks: tenant + status + dueDate for dashboard widgets
        `CREATE INDEX idx_leadtasks_tenant_status_due
         ON lead_tasks(tenantId, status, dueDate)`,

        // Campaign recipients: campaign + status for progress tracking
        `CREATE INDEX idx_campaignrecipients_campaign_status
         ON campaign_recipients(campaignId, status)`,

        // Access logs: tenant + createdAt for security audit
        `CREATE INDEX idx_accesslogs_tenant_created
         ON access_logs(tenantId, createdAt DESC)`,

        // ── CHECK Constraints ──

        // Ensure valid email format (basic check)
        `ALTER TABLE leads ADD CONSTRAINT chk_leads_email_format
         CHECK (email IS NULL OR email LIKE '%_@_%.__%')`,

        // Ensure conversation status is valid (matching schema enum)
        `ALTER TABLE conversations ADD CONSTRAINT chk_conv_status
         CHECK (status IN ('active', 'archived', 'blocked'))`,
    ];

    let created = 0;
    let skipped = 0;

    for (const stmt of indexStatements) {
        try {
            await db.execute(sql.raw(stmt));
            created++;
        } catch (error: any) {
            // Handle duplicate key/constraint errors gracefully
            if (
                error?.code === "ER_DUP_KEYNAME" ||
                error?.errno === 1061 ||
                error?.code === "ER_DUP_ENTRY" ||
                error?.errno === 3822 || // CHECK constraint already exists
                error?.message?.includes("already exists") ||
                error?.message?.includes("Duplicate")
            ) {
                skipped++;
            } else {
                logger.error({ err: error, stmt: stmt.slice(0, 60) }, "Failed to create index/constraint");
            }
        }
    }

    logger.info({ created, skipped }, "Database indexes/constraints optimized");
}
