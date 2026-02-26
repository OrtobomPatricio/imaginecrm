import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { logger } from "../_core/logger";

/**
 * Creates FULLTEXT indexes on leads and chatMessages tables for fast text search.
 * Safe to run multiple times (uses IF NOT EXISTS via raw SQL).
 */
export async function createFulltextIndexes(): Promise<void> {
    const db = await getDb();
    if (!db) {
        logger.warn("Cannot create FULLTEXT indexes: database not available");
        return;
    }

    try {
        // FULLTEXT index on leads (name, email, notes)
        // Note: Removed 'IF NOT EXISTS' as it causes syntax errors in some MySQL 9.x versions.
        // The catch block below handles 'ALREADY EXISTS' errors (1061).
        await db.execute(sql`
            CREATE FULLTEXT INDEX idx_leads_fulltext
            ON leads(name, email, notes)
        `);

        // FULLTEXT index on chatMessages (content)
        await db.execute(sql`
            CREATE FULLTEXT INDEX idx_chatmessages_fulltext
            ON chat_messages(content)
        `);

        logger.info("FULLTEXT indexes created/verified successfully");
    } catch (error: any) {
        // MySQL < 8.0.14 doesn't support IF NOT EXISTS on indexes - handle gracefully
        if (error?.code === "ER_DUP_KEYNAME" || error?.errno === 1061) {
            logger.info("FULLTEXT indexes already exist, skipping");
        } else {
            logger.error({ err: error }, "Failed to create FULLTEXT indexes");
        }
    }
}
