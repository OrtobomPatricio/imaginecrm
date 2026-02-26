import { z } from "zod";
import { router, permissionProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { savedFilters } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export const savedFiltersRouter = router({
    list: permissionProcedure("leads.view")
        .input(z.object({ entityType: z.enum(["leads", "conversations", "campaigns"]).optional() }))
        .query(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) return [];

            const query = db.select()
                .from(savedFilters)
                .where(
                    and(
                        eq(savedFilters.tenantId, ctx.tenantId),
                        eq(savedFilters.userId, ctx.user!.id)
                    )
                );

            const result = await query;
            if (input.entityType) {
                return result.filter(f => f.entityType === input.entityType);
            }
            return result;
        }),

    create: permissionProcedure("leads.view")
        .input(z.object({
            name: z.string().min(1),
            entityType: z.enum(["leads", "conversations", "campaigns"]),
            filterCriteria: z.record(z.string(), z.any()),
            isDefault: z.boolean().default(false)
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database not available");

            // If this is set to default, remove default from others
            if (input.isDefault) {
                await db.update(savedFilters)
                    .set({ isDefault: false })
                    .where(
                        and(
                            eq(savedFilters.tenantId, ctx.tenantId),
                            eq(savedFilters.userId, ctx.user!.id),
                            eq(savedFilters.entityType, input.entityType)
                        )
                    );
            }

            const result = await db.insert(savedFilters).values({
                tenantId: ctx.tenantId,
                userId: ctx.user!.id,
                name: input.name,
                entityType: input.entityType,
                filterCriteria: input.filterCriteria,
                isDefault: input.isDefault,
            });

            return { id: result[0].insertId, success: true };
        }),

    delete: permissionProcedure("leads.view")
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database not available");

            await db.delete(savedFilters).where(
                and(
                    eq(savedFilters.id, input.id),
                    eq(savedFilters.tenantId, ctx.tenantId),
                    eq(savedFilters.userId, ctx.user!.id)
                )
            );

            return { success: true };
        }),
});
