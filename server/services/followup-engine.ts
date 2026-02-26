import { getDb } from "../db";
import { followupRules, followupExecutions, leads, conversations, chatMessages } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "../_core/logger";

interface RuleEvaluationContext {
    lead: any;
    conversation?: any;
    lastMessage?: any;
}

export class FollowupEngine {
    private isRunning: boolean = false;
    private interval: NodeJS.Timeout | null = null;

    start(intervalMs: number = 5 * 60 * 1000): void {
        if (this.isRunning) {
            logger.info("[FollowupEngine] Already running");
            return;
        }

        logger.info("[FollowupEngine] Starting...");
        this.isRunning = true;

        this.runCycle().catch((error) => {
            logger.error({ err: error }, "[FollowupEngine] Error in initial cycle");
        });

        this.interval = setInterval(() => {
            this.runCycle().catch((error) => {
                logger.error({ err: error }, "[FollowupEngine] Error in cycle");
            });
        }, intervalMs);
    }

    stop(): void {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        logger.info("[FollowupEngine] Stopped");
    }

    private async runCycle(): Promise<void> {
        const db = await getDb();
        if (!db) {
            logger.error("[FollowupEngine] Database not available");
            return;
        }

        try {
            const rules = await db
                .select()
                .from(followupRules)
                .where(eq(followupRules.isActive, true))
                .orderBy(desc(followupRules.priority));

            if (rules.length === 0) {
                return;
            }

            logger.info(`[FollowupEngine] Evaluating ${rules.length} rules`);

            let totalExecuted = 0;

            for (const rule of rules) {
                try {
                    const executed = await this.evaluateAndExecuteRule(db, rule);
                    totalExecuted += executed;
                } catch (error: any) {
                    logger.error({ err: error }, `[FollowupEngine] Error evaluating rule ${rule.id}`);
                }
            }

            if (totalExecuted > 0) {
                logger.info(`[FollowupEngine] Cycle complete. Executed ${totalExecuted} actions`);
            }
        } catch (error: any) {
            logger.error({ err: error }, "[FollowupEngine] Error in cycle");
        }
    }

    private async evaluateAndExecuteRule(db: any, rule: any): Promise<number> {
        const candidates = await this.getCandidateLeads(db, rule);

        if (candidates.length === 0) return 0;

        let executedCount = 0;

        for (const lead of candidates) {
            try {
                const recentExecution = await db
                    .select()
                    .from(followupExecutions)
                    .where(
                        and(
                            eq(followupExecutions.ruleId, rule.id),
                            eq(followupExecutions.leadId, lead.id),
                            sql`${followupExecutions.executedAt} > DATE_SUB(NOW(), INTERVAL 24 HOUR)`
                        )
                    )
                    .limit(1);

                if (recentExecution.length > 0) continue;

                const context = await this.buildContext(db, lead);
                if (!this.evaluateConditions(rule, context)) continue;

                const result = await this.executeAction(db, rule, context);

                await db.insert(followupExecutions).values({
                    ruleId: rule.id,
                    leadId: lead.id,
                    conversationId: context.conversation?.id,
                    success: result.success,
                    errorMessage: result.error,
                    actionResult: result.data,
                });

                if (result.success) executedCount++;
            } catch (error: any) {
                logger.error({ err: error }, `[FollowupEngine] Error executing rule ${rule.id} for lead ${lead.id}`);

                await db.insert(followupExecutions).values({
                    ruleId: rule.id,
                    leadId: lead.id,
                    success: false,
                    errorMessage: error.message,
                });
            }
        }

        return executedCount;
    }

    private async getCandidateLeads(db: any, rule: any): Promise<any[]> {
        const { triggerType, triggerConfig } = rule;
        const config = typeof triggerConfig === "string" ? JSON.parse(triggerConfig) : (triggerConfig || {});

        switch (triggerType) {
            case "no_response": {
                const hours = config.hours || 24;

                const candidates = await db
                    .select({
                        id: leads.id,
                        name: leads.name,
                        phone: leads.phone,
                        status: leads.status,
                    })
                    .from(leads)
                    .innerJoin(conversations, eq(conversations.leadId, leads.id))
                    .innerJoin(chatMessages, eq(chatMessages.conversationId, conversations.id))
                    .where(
                        and(
                            eq(chatMessages.direction, "inbound"),
                            sql`${chatMessages.createdAt} < DATE_SUB(NOW(), INTERVAL ${hours} HOUR)`,
                            sql`NOT EXISTS (
                SELECT 1 FROM chat_messages AS m2
                WHERE m2.conversationId = ${conversations.id}
                  AND m2.direction = 'outbound'
                  AND m2.createdAt > ${chatMessages.createdAt}
              )`
                        )
                    )
                    .groupBy(leads.id);

                return candidates;
            }

            case "status_change": {
                const targetStatus = config.status;
                if (!targetStatus) return [];
                return db
                    .select()
                    .from(leads)
                    .where(eq(leads.status, targetStatus))
                    .limit(100);
            }

            case "time_based": {
                const days = config.days || 7;
                const fieldName = (config.field || "createdAt") as keyof typeof leads;
                const field = leads[fieldName] || leads.createdAt;

                return db
                    .select()
                    .from(leads)
                    .where(
                        sql`${field} BETWEEN DATE_SUB(NOW(), INTERVAL ${days + 1} DAY) AND DATE_SUB(NOW(), INTERVAL ${days} DAY)`
                    )
                    .limit(100);
            }

            default:
                logger.warn(`[FollowupEngine] Unknown trigger type: ${triggerType}`);
                return [];
        }
    }

    private async buildContext(db: any, lead: any): Promise<RuleEvaluationContext> {
        const conv = await db
            .select()
            .from(conversations)
            .where(eq(conversations.leadId, lead.id))
            .limit(1);

        const conversation = conv[0];

        let lastMessage;
        if (conversation) {
            const msgs = await db
                .select()
                .from(chatMessages)
                .where(eq(chatMessages.conversationId, conversation.id))
                .orderBy(desc(chatMessages.createdAt))
                .limit(1);

            lastMessage = msgs[0];
        }

        return { lead, conversation, lastMessage };
    }

    private evaluateConditions(rule: any, context: RuleEvaluationContext): boolean {
        const { conditions } = rule;
        if (!conditions) return true;

        let parsedConditions = conditions;
        if (typeof conditions === "string") {
            try { parsedConditions = JSON.parse(conditions); } catch { return true; }
        }

        if (parsedConditions.leadStatus && context.lead.status !== parsedConditions.leadStatus) {
            return false;
        }

        if (parsedConditions.leadSource && context.lead.source !== parsedConditions.leadSource) {
            return false;
        }

        return true;
    }

    private async executeAction(
        db: any,
        rule: any,
        context: RuleEvaluationContext
    ): Promise<{ success: boolean; error?: string; data?: any }> {
        const { actionType, actionConfig, tenantId } = rule;
        const config = typeof actionConfig === "string" ? JSON.parse(actionConfig) : (actionConfig || {});

        try {
            switch (actionType) {
                case "send_message": {
                    const messageTemplate = config.template || "Follow-up automático";

                    if (!context.conversation) {
                        return { success: false, error: "No conversation found" };
                    }

                    const externalId = `followup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                    await db.insert(chatMessages).values({
                        conversationId: context.conversation.id,
                        tenantId: tenantId ?? 1,
                        direction: "outbound",
                        messageType: "text",
                        content: messageTemplate,
                        whatsappMessageId: externalId,
                        status: "queued"
                    } as any);

                    // Normally here we would integrate with the queue system or Baileys to actually send it

                    return { success: true, data: { message: "Message queued" } };
                }

                case "change_status": {
                    const newStatus = config.status;
                    if (!newStatus) return { success: false, error: "Missing config.status" };

                    await db
                        .update(leads)
                        .set({ status: newStatus })
                        .where(eq(leads.id, context.lead.id));

                    return { success: true, data: { status: newStatus } };
                }

                case "assign_to": {
                    const userId = config.userId;
                    if (!userId) return { success: false, error: "Missing config.userId" };

                    await db
                        .update(leads)
                        .set({ assignedToId: userId })
                        .where(eq(leads.id, context.lead.id));

                    return { success: true, data: { assignedToId: userId } };
                }

                case "add_tag": {
                    const tagId = config.tagId;
                    return { success: true, data: { tagId } };
                }

                default:
                    return { success: false, error: `Unknown action type: ${actionType}` };
            }
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

export const followupEngine = new FollowupEngine();
