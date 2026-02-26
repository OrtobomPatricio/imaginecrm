import { z } from "zod";
import { router, permissionProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { conversationNotes, users } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";

export const conversationNotesRouter = router({
    list: permissionProcedure("chat.view")
        .input(z.object({ conversationId: z.number() }))
        .query(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) return [];

            return db.select({
                id: conversationNotes.id,
                content: conversationNotes.content,
                createdAt: conversationNotes.createdAt,
                createdBy: {
                    id: users.id,
                    name: users.name,
                },
            })
                .from(conversationNotes)
                .leftJoin(users, eq(conversationNotes.createdById, users.id))
                .where(
                    and(
                        eq(conversationNotes.tenantId, ctx.tenantId),
                        eq(conversationNotes.conversationId, input.conversationId)
                    )
                )
                .orderBy(desc(conversationNotes.createdAt));
        }),

    create: permissionProcedure("chat.view")
        .input(z.object({ conversationId: z.number(), content: z.string().min(1) }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database not available");

            const result = await db.insert(conversationNotes).values({
                tenantId: ctx.tenantId,
                conversationId: input.conversationId,
                content: input.content,
                createdById: ctx.user!.id,
            });

            return { id: result[0].insertId, success: true };
        }),

    delete: permissionProcedure("chat.view")
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database not available");

            // Only allow deleting own notes unless admin
            const note = await db.select().from(conversationNotes).where(and(
                eq(conversationNotes.id, input.id),
                eq(conversationNotes.tenantId, ctx.tenantId)
            )).limit(1);

            if (!note[0]) throw new Error("Note not found");

            if (note[0].createdById !== ctx.user!.id && ctx.user!.role !== "admin" && ctx.user!.role !== "owner") {
                throw new Error("Unauthorized to delete this note");
            }

            await db.delete(conversationNotes).where(eq(conversationNotes.id, input.id));
            return { success: true };
        }),
});
