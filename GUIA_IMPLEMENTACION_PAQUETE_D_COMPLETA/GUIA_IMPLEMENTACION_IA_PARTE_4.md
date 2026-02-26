# Guía de Implementación del Paquete D Enterprise - Parte 4

## Instrucciones para IA: Routers tRPC (Segunda Mitad)

---

## FASE 8: CREAR ROUTERS TRPC RESTANTES

### Paso 8.1: Router de IA (Respuestas Sugeridas)

Crear archivo: `server/routers/ai.ts`

```typescript
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { conversations, messages } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

// OpenAI integration (optional - fallback to rule-based if no API key)
async function generateAIReplies(conversationHistory: any[]): Promise<string[]> {
  // Check if OpenAI API key is configured
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    // Fallback: Rule-based suggestions
    return [
      "Gracias por tu mensaje. ¿En qué puedo ayudarte hoy?",
      "Entiendo tu consulta. Déjame revisar y te respondo enseguida.",
      "¿Podrías darme más detalles para poder asistirte mejor?",
    ];
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Eres un asistente de ventas profesional. Genera 3 opciones de respuesta diferentes (formal, casual, informativa) basándote en el historial de la conversación. Responde en español.",
          },
          {
            role: "user",
            content: `Historial de conversación:\n${conversationHistory.map((m) => `${m.direction === "inbound" ? "Cliente" : "Agente"}: ${m.content}`).join("\n")}\n\nGenera 3 opciones de respuesta.`,
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    const data = await response.json();
    const content = data.choices[0]?.message?.content || "";

    // Parse the 3 suggestions
    const suggestions = content.split("\n").filter((line: string) => line.trim().length > 0);

    return suggestions.slice(0, 3);
  } catch (error) {
    console.error("[AI] Error generating replies:", error);

    // Fallback
    return [
      "Gracias por tu mensaje. ¿En qué puedo ayudarte hoy?",
      "Entiendo tu consulta. Déjame revisar y te respondo enseguida.",
      "¿Podrías darme más detalles para poder asistirte mejor?",
    ];
  }
}

export const aiRouter = router({
  // Suggest replies based on conversation context
  suggestReplies: permissionProcedure("chat.view")
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { suggestions: [] };

      // Get last 6 messages for context
      const recentMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(6);

      const suggestions = await generateAIReplies(recentMessages.reverse());

      return { suggestions };
    }),

  // Summarize conversation
  summarizeConversation: permissionProcedure("chat.view")
    .input(
      z.object({
        conversationId: z.number(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { summary: "" };

      const allMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, input.conversationId))
        .orderBy(messages.createdAt);

      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        return {
          summary: `Conversación con ${allMessages.length} mensajes. Último mensaje: ${allMessages[allMessages.length - 1]?.content || "N/A"}`,
        };
      }

      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: "Resume la siguiente conversación de manera concisa, destacando los puntos clave y el estado actual.",
              },
              {
                role: "user",
                content: allMessages.map((m) => `${m.direction === "inbound" ? "Cliente" : "Agente"}: ${m.content}`).join("\n"),
              },
            ],
            temperature: 0.5,
            max_tokens: 200,
          }),
        });

        const data = await response.json();
        const summary = data.choices[0]?.message?.content || "No se pudo generar resumen";

        return { summary };
      } catch (error) {
        console.error("[AI] Error generating summary:", error);
        return {
          summary: `Conversación con ${allMessages.length} mensajes. Último mensaje: ${allMessages[allMessages.length - 1]?.content || "N/A"}`,
        };
      }
    }),
});
```

### Paso 8.2: Router de Importación

Crear archivo: `server/routers/import.ts`

```typescript
import { z } from "zod";
import { eq } from "drizzle-orm";
import { leads, conversations, messages } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const importRouter = router({
  // Import conversations from JSON
  importConversations: permissionProcedure("leads.manage")
    .input(
      z.object({
        data: z.array(
          z.object({
            leadName: z.string(),
            leadPhone: z.string(),
            leadEmail: z.string().optional(),
            messages: z.array(
              z.object({
                direction: z.enum(["inbound", "outbound"]),
                content: z.string(),
                timestamp: z.string().optional(),
              })
            ),
          })
        ),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      let imported = 0;
      let errors: string[] = [];

      for (const item of input.data) {
        try {
          // Check if lead already exists
          const existingLead = await db
            .select()
            .from(leads)
            .where(eq(leads.phone, item.leadPhone))
            .limit(1);

          let leadId: number;

          if (existingLead[0]) {
            leadId = existingLead[0].id;
          } else {
            // Create new lead
            const [newLead] = await db
              .insert(leads)
              .values({
                name: item.leadName,
                phone: item.leadPhone,
                email: item.leadEmail,
                source: "import",
              })
              .$returningId();

            leadId = newLead.id;
          }

          // Create conversation
          const [newConversation] = await db
            .insert(conversations)
            .values({
              leadId,
              platform: "whatsapp",
            })
            .$returningId();

          // Import messages
          for (const msg of item.messages) {
            await db.insert(messages).values({
              conversationId: newConversation.id,
              direction: msg.direction,
              messageType: "text",
              content: msg.content,
              externalId: `import_${Date.now()}_${Math.random()}`,
              createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
            });
          }

          imported++;
        } catch (error: any) {
          errors.push(`Error importing ${item.leadName}: ${error.message}`);
        }
      }

      return {
        success: true,
        imported,
        total: input.data.length,
        errors,
      };
    }),

  // Parse CSV and return structured data
  parseCSV: permissionProcedure("leads.manage")
    .input(
      z.object({
        csvContent: z.string(),
      })
    )
    .query(async ({ input }) => {
      const lines = input.csvContent.split("\n").filter((line) => line.trim());

      if (lines.length < 2) {
        throw new Error("CSV must have at least a header and one data row");
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      // Validate required columns
      const requiredColumns = ["name", "phone"];
      const missingColumns = requiredColumns.filter((col) => !headers.includes(col));

      if (missingColumns.length > 0) {
        throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
      }

      const data = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(",").map((v) => v.trim());
        const row: any = {};

        headers.forEach((header, index) => {
          row[header] = values[index] || "";
        });

        data.push({
          leadName: row.name,
          leadPhone: row.phone,
          leadEmail: row.email,
          messages: [],
        });
      }

      return { data, count: data.length };
    }),
});
```

### Paso 8.3: Router de Follow-up

Crear archivo: `server/routers/followup.ts`

```typescript
import { z } from "zod";
import { eq, desc, sql } from "drizzle-orm";
import { followupRules, followupExecutions } from "../../drizzle/schema";
import { getDb } from "../db";
import { permissionProcedure, router } from "../_core/trpc";

export const followupRouter = router({
  // List all follow-up rules
  listRules: permissionProcedure("settings.view")
    .query(async () => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(followupRules)
        .orderBy(desc(followupRules.priority), desc(followupRules.createdAt));
    }),

  // Get single rule
  getRule: permissionProcedure("settings.view")
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const rule = await db
        .select()
        .from(followupRules)
        .where(eq(followupRules.id, input.id))
        .limit(1);

      return rule[0] || null;
    }),

  // Create follow-up rule
  createRule: permissionProcedure("settings.manage")
    .input(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().optional(),
        isActive: z.boolean().default(true),
        triggerType: z.enum(["no_response", "status_change", "time_based", "tag_added"]),
        triggerConfig: z.record(z.any()),
        conditions: z.record(z.any()).optional(),
        actionType: z.enum(["send_message", "assign_to", "change_status", "add_tag", "create_task"]),
        actionConfig: z.record(z.any()),
        priority: z.number().default(0),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [newRule] = await db
        .insert(followupRules)
        .values(input)
        .$returningId();

      return newRule;
    }),

  // Update follow-up rule
  updateRule: permissionProcedure("settings.manage")
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional(),
        triggerType: z.enum(["no_response", "status_change", "time_based", "tag_added"]).optional(),
        triggerConfig: z.record(z.any()).optional(),
        conditions: z.record(z.any()).optional(),
        actionType: z.enum(["send_message", "assign_to", "change_status", "add_tag", "create_task"]).optional(),
        actionConfig: z.record(z.any()).optional(),
        priority: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const { id, ...updates } = input;

      await db
        .update(followupRules)
        .set(updates)
        .where(eq(followupRules.id, id));

      return { success: true };
    }),

  // Delete follow-up rule
  deleteRule: permissionProcedure("settings.manage")
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(followupRules)
        .where(eq(followupRules.id, input.id));

      return { success: true };
    }),

  // Toggle rule active status
  toggleRule: permissionProcedure("settings.manage")
    .input(
      z.object({
        id: z.number(),
        isActive: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .update(followupRules)
        .set({ isActive: input.isActive })
        .where(eq(followupRules.id, input.id));

      return { success: true };
    }),

  // Get execution history for a rule
  getRuleExecutions: permissionProcedure("settings.view")
    .input(
      z.object({
        ruleId: z.number(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(followupExecutions)
        .where(eq(followupExecutions.ruleId, input.ruleId))
        .orderBy(desc(followupExecutions.executedAt))
        .limit(input.limit);
    }),

  // Get execution statistics
  getExecutionStats: permissionProcedure("settings.view")
    .query(async () => {
      const db = await getDb();
      if (!db) return { totalExecutions: 0, successRate: 0, last24h: 0 };

      const totalQuery = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(followupExecutions);

      const successQuery = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(followupExecutions)
        .where(eq(followupExecutions.success, true));

      const last24hQuery = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(followupExecutions)
        .where(sql`${followupExecutions.executedAt} > DATE_SUB(NOW(), INTERVAL 24 HOUR)`);

      const totalExecutions = Number(totalQuery[0]?.count || 0);
      const successCount = Number(successQuery[0]?.count || 0);
      const last24h = Number(last24hQuery[0]?.count || 0);

      const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 0;

      return {
        totalExecutions,
        successRate: Math.round(successRate * 10) / 10,
        last24h,
      };
    }),
});
```

---

## FASE 9: ACTUALIZAR ROUTER INDEX

### Paso 9.1: Agregar Imports de Nuevos Routers

Abre el archivo `server/routers/index.ts` y agrega los siguientes imports al inicio (después de los imports existentes):

```typescript
import { tagsRouter } from "./tags";
import { conversationNotesRouter } from "./conversation-notes";
import { aiRouter } from "./ai";
import { importRouter } from "./import";
import { searchRouter } from "./search";
import { savedFiltersRouter } from "./saved-filters";
import { followupRouter } from "./followup";
```

### Paso 9.2: Agregar Routers al appRouter

En el mismo archivo, busca la definición de `appRouter` y agrega los nuevos routers:

```typescript
export const appRouter = router({
  // ... routers existentes ...
  
  // AGREGAR ESTOS NUEVOS ROUTERS:
  tags: tagsRouter,
  conversationNotes: conversationNotesRouter,
  ai: aiRouter,
  import: importRouter,
  search: searchRouter,
  savedFilters: savedFiltersRouter,
  followup: followupRouter,
});
```

---

## FASE 10: ACTUALIZAR ROUTERS EXISTENTES

### Paso 10.1: Agregar Endpoint de Actualización de Tema en Auth Router

Abre el archivo `server/routers/auth.ts` y agrega el siguiente endpoint:

```typescript
// Update user theme preference
updateTheme: permissionProcedure("profile.edit")
  .input(
    z.object({
      theme: z.enum(["light", "dark", "system"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db
      .update(users)
      .set({ theme: input.theme })
      .where(eq(users.id, ctx.user!.id));

    return { success: true };
  }),
```

También, busca el endpoint `me` y asegúrate de que incluya el campo `theme` en el select:

```typescript
me: permissionProcedure("profile.view")
  .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;

    const user = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        theme: users.theme, // AGREGAR ESTA LÍNEA
        // ... otros campos ...
      })
      .from(users)
      .where(eq(users.id, ctx.user!.id))
      .limit(1);

    return user[0] || null;
  }),
```

### Paso 10.2: Agregar Paginación Infinita en Leads Router

Abre el archivo `server/routers/leads.ts` y agrega el siguiente endpoint:

```typescript
// Infinite scroll pagination for leads
listInfinite: permissionProcedure("leads.view")
  .input(
    z.object({
      limit: z.number().min(1).max(100).default(20),
      cursor: z.number().optional(), // Last lead ID from previous page
      pipelineStageId: z.number().optional(),
      status: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], nextCursor: null };

    const { limit, cursor, pipelineStageId, status } = input;

    const conditions = [];

    if (cursor) {
      conditions.push(sql`${leads.id} < ${cursor}`);
    }

    if (pipelineStageId) {
      conditions.push(eq(leads.pipelineStageId, pipelineStageId));
    }

    if (status) {
      conditions.push(eq(leads.status, status));
    }

    const items = await db
      .select()
      .from(leads)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(leads.id))
      .limit(limit + 1); // Fetch one extra to determine if there are more

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      items: results,
      nextCursor,
    };
  }),
```

### Paso 10.3: Agregar Paginación Infinita en Chat Router

Abre el archivo `server/routers/chat.ts` y agrega el siguiente endpoint:

```typescript
// Infinite scroll pagination for messages
getMessagesInfinite: permissionProcedure("chat.view")
  .input(
    z.object({
      conversationId: z.number(),
      limit: z.number().min(1).max(100).default(50),
      cursor: z.number().optional(), // Last message ID from previous page
    })
  )
  .query(async ({ input }) => {
    const db = await getDb();
    if (!db) return { items: [], nextCursor: null };

    const { conversationId, limit, cursor } = input;

    const conditions = [eq(messages.conversationId, conversationId)];

    if (cursor) {
      conditions.push(sql`${messages.id} < ${cursor}`);
    }

    const items = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.id))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const results = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? results[results.length - 1].id : null;

    return {
      items: results.reverse(), // Reverse to show oldest first
      nextCursor,
    };
  }),
```

### Paso 10.4: Agregar Caché en Dashboard Router

Abre el archivo `server/routers/dashboard.ts` y realiza los siguientes cambios:

**1. Agregar imports:**

```typescript
import { cache, CacheKeys, CacheTTL } from "../services/cache";
```

**2. Modificar el endpoint `getStats` para usar caché:**

Busca la línea que dice:

```typescript
getStats: permissionProcedure("dashboard.view").query(async () => {
```

Y reemplázala por:

```typescript
getStats: permissionProcedure("dashboard.view").query(async ({ ctx }) => {
  return cache.getOrSet(
    CacheKeys.dashboardStats(ctx.user?.id || 0),
    async () => {
```

Luego, busca el `return` final del endpoint (donde devuelve todos los stats) y después de ese return, agrega:

```typescript
    },
    CacheTTL.SHORT
  );
}),
```

---

## VERIFICACIÓN DE FASE 8-10

Antes de continuar, verifica:

✅ Archivo `ai.ts` creado correctamente  
✅ Archivo `import.ts` creado correctamente  
✅ Archivo `followup.ts` creado correctamente  
✅ Todos los routers agregados al `index.ts`  
✅ Endpoint `updateTheme` agregado en `auth.ts`  
✅ Endpoints de paginación infinita agregados  
✅ Caché integrado en dashboard  
✅ No hay errores de TypeScript al compilar

Si todo está correcto, continúa con la Parte 5 de la guía (componentes de frontend).

---

**Fin de Parte 4**
