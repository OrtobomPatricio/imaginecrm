# Guía de Implementación del Paquete D Enterprise - Parte 3

## Instrucciones para IA: Routers tRPC (Primera Mitad)

---

## FASE 7: CREAR ROUTERS TRPC NUEVOS

### Paso 7.1: Router de Búsqueda Global

Crear archivo: `server/routers/search.ts`

```typescript
import { z } from "zod";
import { like, or, eq, sql } from "drizzle-orm";
import { leads, conversations, messages } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const searchRouter = router({
  // Global search across leads and conversations
  globalSearch: permissionProcedure("leads.view")
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { leads: [], conversations: [] };

      const { query, limit } = input;
      const searchPattern = `%${query}%`;

      // Search in leads
      const leadsResults = await db
        .select()
        .from(leads)
        .where(
          or(
            like(leads.name, searchPattern),
            like(leads.phone, searchPattern),
            like(leads.email, searchPattern)
          )
        )
        .limit(limit);

      // Search in conversation messages
      const conversationsResults = await db
        .select({
          id: conversations.id,
          leadId: conversations.leadId,
          lastMessage: messages.content,
          createdAt: conversations.createdAt,
        })
        .from(conversations)
        .innerJoin(messages, eq(messages.conversationId, conversations.id))
        .where(like(messages.content, searchPattern))
        .groupBy(conversations.id)
        .limit(limit);

      return {
        leads: leadsResults,
        conversations: conversationsResults,
      };
    }),
});
```

### Paso 7.2: Router de Tags

Crear archivo: `server/routers/tags.ts`

```typescript
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { tags, leadTags } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const tagsRouter = router({
  // List all tags
  list: permissionProcedure("leads.view")
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      return db.select().from(tags);
    }),

  // Get single tag
  get: permissionProcedure("leads.view")
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const tag = await db
        .select()
        .from(tags)
        .where(eq(tags.id, input.id))
        .limit(1);

      return tag[0] || null;
    }),

  // Create tag
  create: permissionProcedure("leads.manage")
    .input(
      z.object({
        name: z.string().min(1).max(100),
        color: z.string().default("#3b82f6"),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [newTag] = await db
        .insert(tags)
        .values(input)
        .$returningId();

      return newTag;
    }),

  // Update tag
  update: permissionProcedure("leads.manage")
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        color: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updates } = input;

      await db
        .update(tags)
        .set(updates)
        .where(eq(tags.id, id));

      return { success: true };
    }),

  // Delete tag
  delete: permissionProcedure("leads.manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(tags)
        .where(eq(tags.id, input.id));

      return { success: true };
    }),

  // Assign tag to lead
  assignToLead: permissionProcedure("leads.manage")
    .input(
      z.object({
        leadId: z.number(),
        tagId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .insert(leadTags)
        .values(input)
        .onDuplicateKeyUpdate({ set: { createdAt: sql`NOW()` } });

      return { success: true };
    }),

  // Remove tag from lead
  removeFromLead: permissionProcedure("leads.manage")
    .input(
      z.object({
        leadId: z.number(),
        tagId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(leadTags)
        .where(
          sql`${leadTags.leadId} = ${input.leadId} AND ${leadTags.tagId} = ${input.tagId}`
        );

      return { success: true };
    }),

  // Get tags for a lead
  getLeadTags: permissionProcedure("leads.view")
    .input(z.object({ leadId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
        })
        .from(leadTags)
        .innerJoin(tags, eq(tags.id, leadTags.tagId))
        .where(eq(leadTags.leadId, input.leadId));
    }),

  // Bulk assign tags to multiple leads
  bulkAssign: permissionProcedure("leads.manage")
    .input(
      z.object({
        leadIds: z.array(z.number()),
        tagId: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const values = input.leadIds.map((leadId) => ({
        leadId,
        tagId: input.tagId,
      }));

      await db
        .insert(leadTags)
        .values(values)
        .onDuplicateKeyUpdate({ set: { createdAt: sql`NOW()` } });

      return { success: true, count: values.length };
    }),

  // Get lead count for each tag
  getTagStats: permissionProcedure("leads.view")
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select({
          id: tags.id,
          name: tags.name,
          color: tags.color,
          leadCount: sql<number>`COUNT(${leadTags.leadId})`,
        })
        .from(tags)
        .leftJoin(leadTags, eq(leadTags.tagId, tags.id))
        .groupBy(tags.id);
    }),
});
```

### Paso 7.3: Router de Notas Internas

Crear archivo: `server/routers/conversation-notes.ts`

```typescript
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { conversationNotes } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const conversationNotesRouter = router({
  // List notes for a conversation
  list: permissionProcedure("chat.view")
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(conversationNotes)
        .where(eq(conversationNotes.conversationId, input.conversationId))
        .orderBy(desc(conversationNotes.createdAt));
    }),

  // Create note
  create: permissionProcedure("chat.manage")
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [newNote] = await db
        .insert(conversationNotes)
        .values({
          conversationId: input.conversationId,
          userId: ctx.user!.id,
          content: input.content,
        })
        .$returningId();

      return newNote;
    }),

  // Update note
  update: permissionProcedure("chat.manage")
    .input(
      z.object({
        id: z.number(),
        content: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const note = await db
        .select()
        .from(conversationNotes)
        .where(eq(conversationNotes.id, input.id))
        .limit(1);

      if (!note[0] || note[0].userId !== ctx.user!.id) {
        throw new Error("Unauthorized");
      }

      await db
        .update(conversationNotes)
        .set({ content: input.content })
        .where(eq(conversationNotes.id, input.id));

      return { success: true };
    }),

  // Delete note
  delete: permissionProcedure("chat.manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify ownership
      const note = await db
        .select()
        .from(conversationNotes)
        .where(eq(conversationNotes.id, input.id))
        .limit(1);

      if (!note[0] || note[0].userId !== ctx.user!.id) {
        throw new Error("Unauthorized");
      }

      await db
        .delete(conversationNotes)
        .where(eq(conversationNotes.id, input.id));

      return { success: true };
    }),
});
```

### Paso 7.4: Router de Filtros Guardados

Crear archivo: `server/routers/saved-filters.ts`

```typescript
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { savedFilters } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const savedFiltersRouter = router({
  // List user's saved filters
  list: permissionProcedure("leads.view")
    .input(
      z.object({
        entityType: z.enum(["leads", "conversations", "campaigns"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [eq(savedFilters.userId, ctx.user!.id)];

      if (input.entityType) {
        conditions.push(eq(savedFilters.entityType, input.entityType));
      }

      return db
        .select()
        .from(savedFilters)
        .where(and(...conditions))
        .orderBy(desc(savedFilters.isDefault), desc(savedFilters.createdAt));
    }),

  // Get single filter
  get: permissionProcedure("leads.view")
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const filter = await db
        .select()
        .from(savedFilters)
        .where(
          and(
            eq(savedFilters.id, input.id),
            eq(savedFilters.userId, ctx.user!.id)
          )
        )
        .limit(1);

      return filter[0] || null;
    }),

  // Create saved filter
  create: permissionProcedure("leads.view")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        entityType: z.enum(["leads", "conversations", "campaigns"]),
        filterCriteria: z.record(z.any()),
        isDefault: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [newFilter] = await db
        .insert(savedFilters)
        .values({
          ...input,
          userId: ctx.user!.id,
        })
        .$returningId();

      return newFilter;
    }),

  // Update saved filter
  update: permissionProcedure("leads.view")
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        filterCriteria: z.record(z.any()).optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updates } = input;

      await db
        .update(savedFilters)
        .set(updates)
        .where(
          and(
            eq(savedFilters.id, id),
            eq(savedFilters.userId, ctx.user!.id)
          )
        );

      return { success: true };
    }),

  // Delete saved filter
  delete: permissionProcedure("leads.view")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(savedFilters)
        .where(
          and(
            eq(savedFilters.id, input.id),
            eq(savedFilters.userId, ctx.user!.id)
          )
        );

      return { success: true };
    }),

  // Get default filter for entity type
  getDefault: permissionProcedure("leads.view")
    .input(
      z.object({
        entityType: z.enum(["leads", "conversations", "campaigns"]),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return null;

      const filter = await db
        .select()
        .from(savedFilters)
        .where(
          and(
            eq(savedFilters.userId, ctx.user!.id),
            eq(savedFilters.entityType, input.entityType),
            eq(savedFilters.isDefault, true)
          )
        )
        .limit(1);

      return filter[0] || null;
    }),
});
```

---

## VERIFICACIÓN DE FASE 7 (Primera Mitad)

Antes de continuar, verifica:

✅ Archivo `search.ts` creado correctamente  
✅ Archivo `tags.ts` creado correctamente  
✅ Archivo `conversation-notes.ts` creado correctamente  
✅ Archivo `saved-filters.ts` creado correctamente  
✅ No hay errores de TypeScript al compilar

Si todo está correcto, continúa con la Parte 4 de la guía (routers restantes).

---

**Fin de Parte 3**
