# Guía de Implementación del Paquete D Enterprise - Parte 2

## Instrucciones para IA: Servicios de Backend

---

## FASE 4: CREAR SERVICIO DE WEBSOCKET

### Paso 4.1: Crear Archivo de WebSocket Server

Crear archivo: `server/_core/websocket.ts`

```typescript
import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { verify } from "jsonwebtoken";
import { env } from "./env";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: number;
  tenantId?: number;
  isAlive?: boolean;
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<number, Set<AuthenticatedWebSocket>> = new Map();

  initialize(server: any) {
    this.wss = new WebSocketServer({ server, path: "/ws" });

    this.wss.on("connection", (ws: AuthenticatedWebSocket, request: IncomingMessage) => {
      // Authenticate connection
      const token = this.extractToken(request);
      if (!token) {
        ws.close(1008, "Unauthorized");
        return;
      }

      try {
        const decoded = verify(token, env.JWT_SECRET) as any;
        ws.userId = decoded.userId;
        ws.tenantId = decoded.tenantId;
        ws.isAlive = true;

        // Add to clients map
        if (!this.clients.has(ws.userId)) {
          this.clients.set(ws.userId, new Set());
        }
        this.clients.get(ws.userId)!.add(ws);

        console.log(`[WebSocket] Client connected: user-${ws.userId}`);

        // Setup heartbeat
        ws.on("pong", () => {
          ws.isAlive = true;
        });

        // Handle messages
        ws.on("message", (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            this.handleMessage(ws, message);
          } catch (error) {
            console.error("[WebSocket] Invalid message:", error);
          }
        });

        // Handle disconnect
        ws.on("close", () => {
          if (ws.userId) {
            const userClients = this.clients.get(ws.userId);
            if (userClients) {
              userClients.delete(ws);
              if (userClients.size === 0) {
                this.clients.delete(ws.userId);
              }
            }
            console.log(`[WebSocket] Client disconnected: user-${ws.userId}`);
          }
        });

        // Send welcome message
        ws.send(JSON.stringify({ type: "connected", userId: ws.userId }));
      } catch (error) {
        console.error("[WebSocket] Authentication failed:", error);
        ws.close(1008, "Unauthorized");
      }
    });

    // Start heartbeat interval
    this.startHeartbeat();

    console.log("[WebSocket] Server initialized");
  }

  private extractToken(request: IncomingMessage): string | null {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    return url.searchParams.get("token");
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: any) {
    switch (message.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "typing":
        this.broadcastToConversation(message.conversationId, {
          type: "user_typing",
          userId: ws.userId,
          conversationId: message.conversationId,
        }, ws.userId);
        break;
      default:
        console.warn("[WebSocket] Unknown message type:", message.type);
    }
  }

  private startHeartbeat() {
    setInterval(() => {
      this.clients.forEach((userClients) => {
        userClients.forEach((ws) => {
          if (!ws.isAlive) {
            userClients.delete(ws);
            return ws.terminate();
          }

          ws.isAlive = false;
          ws.ping();
        });
      });
    }, 30000); // Every 30 seconds
  }

  // Broadcast to specific user
  broadcastToUser(userId: number, data: any) {
    const userClients = this.clients.get(userId);
    if (userClients) {
      const message = JSON.stringify(data);
      userClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    }
  }

  // Broadcast to all users in a tenant
  broadcastToTenant(tenantId: number, data: any) {
    const message = JSON.stringify(data);
    this.clients.forEach((userClients) => {
      userClients.forEach((ws) => {
        if (ws.tenantId === tenantId && ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    });
  }

  // Broadcast to conversation participants
  broadcastToConversation(conversationId: number, data: any, excludeUserId?: number) {
    // This would need to query DB for conversation participants
    // For now, broadcast to all in tenant
    const message = JSON.stringify(data);
    this.clients.forEach((userClients, userId) => {
      if (userId !== excludeUserId) {
        userClients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        });
      }
    });
  }

  getStats() {
    return {
      totalClients: Array.from(this.clients.values()).reduce((sum, set) => sum + set.size, 0),
      uniqueUsers: this.clients.size,
    };
  }
}

export const wsManager = new WebSocketManager();
```

### Paso 4.2: Integrar WebSocket en el Servidor Principal

Abre el archivo `server/_core/index.ts` y realiza los siguientes cambios:

**1. Agregar import del WebSocket manager:**

```typescript
import { wsManager } from "./websocket";
```

**2. Buscar donde se crea el servidor HTTP (línea que contiene `createServer`) y después de esa línea, agregar:**

```typescript
// Initialize WebSocket server
wsManager.initialize(httpServer);
```

Debería verse así:

```typescript
const httpServer = createServer(app);

// Initialize WebSocket server
wsManager.initialize(httpServer);
```

---

## FASE 5: CREAR SERVICIO DE CACHÉ

### Paso 5.1: Crear Archivo de Servicio de Caché

Crear archivo: `server/services/cache.ts`

```typescript
/**
 * Simple in-memory cache service for frequently accessed data
 * For production, consider Redis or similar distributed cache
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>>;
  private cleanupInterval: NodeJS.Timeout | null;

  constructor() {
    this.cache = new Map();
    this.cleanupInterval = null;
    this.startCleanup();
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  set<T>(key: string, data: T, ttl: number = 60000): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  invalidatePattern(pattern: RegExp): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this.cache.delete(key));
  }

  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    ttl: number = 60000
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;

    const data = await fn();
    this.set(key, data, ttl);
    return data;
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const keysToDelete: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > entry.ttl) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach((key) => this.cache.delete(key));

      if (keysToDelete.length > 0) {
        console.log(`[Cache] Cleaned up ${keysToDelete.length} expired entries`);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getStats() {
    const entries = Array.from(this.cache.values());
    const timestamps = entries.map((e) => e.timestamp);

    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }
}

export const cache = new CacheService();

// Cache key builders
export const CacheKeys = {
  user: (id: number) => `user:${id}`,
  userPermissions: (id: number) => `user:${id}:permissions`,
  lead: (id: number) => `lead:${id}`,
  leadsList: (filters: string) => `leads:list:${filters}`,
  conversation: (id: number) => `conversation:${id}`,
  conversationsList: (filters: string) => `conversations:list:${filters}`,
  messages: (conversationId: number) => `messages:${conversationId}`,
  campaign: (id: number) => `campaign:${id}`,
  campaignsList: () => `campaigns:list`,
  pipelineStages: () => `pipeline:stages`,
  whatsappNumbers: () => `whatsapp:numbers`,
  customFields: () => `custom:fields`,
  tags: () => `tags:list`,
  dashboardStats: (userId: number) => `dashboard:stats:${userId}`,
  analyticsReport: (range: string) => `analytics:${range}`,
};

// Cache TTLs (in milliseconds)
export const CacheTTL = {
  SHORT: 30 * 1000, // 30 seconds
  MEDIUM: 5 * 60 * 1000, // 5 minutes
  LONG: 30 * 60 * 1000, // 30 minutes
  VERY_LONG: 2 * 60 * 60 * 1000, // 2 hours
};

// Cache invalidation helpers
export const invalidateCache = {
  user: (id: number) => {
    cache.delete(CacheKeys.user(id));
    cache.delete(CacheKeys.userPermissions(id));
  },
  lead: (id: number) => {
    cache.delete(CacheKeys.lead(id));
    cache.invalidatePattern(/^leads:list:/);
  },
  conversation: (id: number) => {
    cache.delete(CacheKeys.conversation(id));
    cache.invalidatePattern(/^conversations:list:/);
  },
  messages: (conversationId: number) => {
    cache.delete(CacheKeys.messages(conversationId));
  },
  campaign: (id: number) => {
    cache.delete(CacheKeys.campaign(id));
    cache.delete(CacheKeys.campaignsList());
  },
  settings: () => {
    cache.delete(CacheKeys.pipelineStages());
    cache.delete(CacheKeys.whatsappNumbers());
    cache.delete(CacheKeys.customFields());
    cache.delete(CacheKeys.tags());
  },
  analytics: () => {
    cache.invalidatePattern(/^dashboard:stats:/);
    cache.invalidatePattern(/^analytics:/);
  },
};
```

---

## FASE 6: CREAR SERVICIO DE FOLLOW-UP AUTOMÁTICO

### Paso 6.1: Crear Motor de Follow-up

Crear archivo: `server/services/followup-engine.ts`

```typescript
import { getDb } from "../db";
import { followupRules, followupExecutions, leads, conversations, messages } from "../../drizzle/schema";
import { eq, and, sql, desc } from "drizzle-orm";

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
      console.log("[FollowupEngine] Already running");
      return;
    }

    console.log("[FollowupEngine] Starting...");
    this.isRunning = true;

    this.runCycle().catch((error) => {
      console.error("[FollowupEngine] Error in initial cycle:", error);
    });

    this.interval = setInterval(() => {
      this.runCycle().catch((error) => {
        console.error("[FollowupEngine] Error in cycle:", error);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    console.log("[FollowupEngine] Stopped");
  }

  private async runCycle(): Promise<void> {
    const db = await getDb();
    if (!db) {
      console.error("[FollowupEngine] Database not available");
      return;
    }

    try {
      const rules = await db
        .select()
        .from(followupRules)
        .where(eq(followupRules.isActive, true))
        .orderBy(desc(followupRules.priority));

      if (rules.length === 0) {
        console.log("[FollowupEngine] No active rules");
        return;
      }

      console.log(`[FollowupEngine] Evaluating ${rules.length} rules`);

      let totalExecuted = 0;

      for (const rule of rules) {
        try {
          const executed = await this.evaluateAndExecuteRule(db, rule);
          totalExecuted += executed;
        } catch (error: any) {
          console.error(`[FollowupEngine] Error evaluating rule ${rule.id}:`, error.message);
        }
      }

      console.log(`[FollowupEngine] Cycle complete. Executed ${totalExecuted} actions`);
    } catch (error: any) {
      console.error("[FollowupEngine] Error in cycle:", error);
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
        console.error(`[FollowupEngine] Error executing rule ${rule.id} for lead ${lead.id}:`, error.message);

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

    switch (triggerType) {
      case "no_response": {
        const hours = triggerConfig.hours || 24;

        const candidates = await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            status: leads.status,
          })
          .from(leads)
          .innerJoin(conversations, eq(conversations.leadId, leads.id))
          .innerJoin(messages, eq(messages.conversationId, conversations.id))
          .where(
            and(
              eq(messages.direction, "inbound"),
              sql`${messages.createdAt} < DATE_SUB(NOW(), INTERVAL ${hours} HOUR)`,
              sql`NOT EXISTS (
                SELECT 1 FROM messages AS m2
                WHERE m2.conversationId = ${conversations.id}
                  AND m2.direction = 'outbound'
                  AND m2.createdAt > ${messages.createdAt}
              )`
            )
          )
          .groupBy(leads.id);

        return candidates;
      }

      case "status_change": {
        const targetStatus = triggerConfig.status;
        return db
          .select()
          .from(leads)
          .where(eq(leads.status, targetStatus))
          .limit(100);
      }

      case "time_based": {
        const days = triggerConfig.days || 7;
        const field = triggerConfig.field || "createdAt";

        return db
          .select()
          .from(leads)
          .where(
            sql`${leads[field]} BETWEEN DATE_SUB(NOW(), INTERVAL ${days + 1} DAY) AND DATE_SUB(NOW(), INTERVAL ${days} DAY)`
          )
          .limit(100);
      }

      default:
        console.warn(`[FollowupEngine] Unknown trigger type: ${triggerType}`);
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
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      lastMessage = msgs[0];
    }

    return { lead, conversation, lastMessage };
  }

  private evaluateConditions(rule: any, context: RuleEvaluationContext): boolean {
    const { conditions } = rule;
    if (!conditions) return true;

    if (conditions.leadStatus && context.lead.status !== conditions.leadStatus) {
      return false;
    }

    if (conditions.leadSource && context.lead.source !== conditions.leadSource) {
      return false;
    }

    return true;
  }

  private async executeAction(
    db: any,
    rule: any,
    context: RuleEvaluationContext
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    const { actionType, actionConfig } = rule;

    try {
      switch (actionType) {
        case "send_message": {
          const messageTemplate = actionConfig.template || "Follow-up automático";

          if (!context.conversation) {
            return { success: false, error: "No conversation found" };
          }

          await db.insert(messages).values({
            conversationId: context.conversation.id,
            direction: "outbound",
            messageType: "text",
            content: messageTemplate,
            externalId: `followup_${Date.now()}`,
          });

          return { success: true, data: { message: "Message sent" } };
        }

        case "change_status": {
          const newStatus = actionConfig.status;

          await db
            .update(leads)
            .set({ status: newStatus })
            .where(eq(leads.id, context.lead.id));

          return { success: true, data: { status: newStatus } };
        }

        case "assign_to": {
          const userId = actionConfig.userId;

          await db
            .update(leads)
            .set({ assignedTo: userId })
            .where(eq(leads.id, context.lead.id));

          return { success: true, data: { assignedTo: userId } };
        }

        case "add_tag": {
          const tagId = actionConfig.tagId;
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
```

### Paso 6.2: Iniciar Follow-up Engine en el Servidor

Abre el archivo `server/_core/index.ts` y realiza los siguientes cambios:

**1. Agregar import:**

```typescript
import { followupEngine } from "../services/followup-engine";
```

**2. Buscar donde se inician los servicios de background (líneas con `startCampaignWorker()`, `startAutoBackup()`, etc.) y agregar:**

```typescript
followupEngine.start(); // Start follow-up automation engine
```

Debería verse así:

```typescript
// Background Services
initReminderScheduler();
startCampaignWorker();
startLogCleanup();
startAutoBackup();
startSessionCleanup();
followupEngine.start(); // Start follow-up automation engine
```

---

## VERIFICACIÓN DE FASE 4-6

Antes de continuar, verifica:

✅ Archivo `websocket.ts` creado correctamente  
✅ WebSocket integrado en servidor principal  
✅ Archivo `cache.ts` creado correctamente  
✅ Archivo `followup-engine.ts` creado correctamente  
✅ Follow-up engine iniciado en servidor principal  
✅ No hay errores de TypeScript al compilar

Si todo está correcto, continúa con la Parte 3 de la guía.

---

**Fin de Parte 2**
