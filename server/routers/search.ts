import { z } from "zod";
import { router, permissionProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { leads, conversations, users } from "../../drizzle/schema";
import { eq, or, like, and, desc } from "drizzle-orm";

export const searchRouter = router({
    globalSearch: permissionProcedure("leads.view")
        .input(z.object({ query: z.string().min(1), limit: z.number().min(1).max(50).default(20) }))
        .query(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) return { leads: [], conversations: [] };

            const searchTerm = `%${input.query}%`;

            const foundLeads = await db.select({
                id: leads.id,
                name: leads.name,
                phone: leads.phone,
            })
                .from(leads)
                .where(
                    and(
                        eq(leads.tenantId, ctx.tenantId),
                        or(
                            like(leads.name, searchTerm),
                            like(leads.phone, searchTerm),
                            like(leads.email, searchTerm)
                        )
                    )
                )
                .limit(input.limit);

            // Search conversations is a bit tricky without a join to messages
            // but we can search by contactName or contactPhone
            const foundConversations = await db.select({
                id: conversations.id,
                contactName: conversations.contactName,
                contactPhone: conversations.contactPhone,
            })
                .from(conversations)
                .where(
                    and(
                        eq(conversations.tenantId, ctx.tenantId),
                        or(
                            like(conversations.contactName, searchTerm),
                            like(conversations.contactPhone, searchTerm)
                        )
                    )
                )
                .limit(input.limit);

            return {
                leads: foundLeads,
                conversations: foundConversations.map(c => ({
                    id: c.id,
                    lastMessage: `Contacto: ${c.contactName || c.contactPhone}`
                })),
            };
        }),
});
