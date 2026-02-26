# Guía de Implementación del Paquete D Enterprise - Parte 1

## Instrucciones para IA: Preparación y Configuración

Esta guía contiene instrucciones detalladas para implementar las 15 mejoras del Paquete D Enterprise en el proyecto CRM Pro. Sigue cada paso en orden y verifica que cada cambio funcione antes de continuar.

---

## FASE 1: PREPARACIÓN DEL ENTORNO

### Paso 1.1: Instalar Nuevas Dependencias

Ejecuta el siguiente comando en la raíz del proyecto:

```bash
pnpm add ws @types/ws @fullcalendar/core @fullcalendar/react @fullcalendar/daygrid @fullcalendar/timegrid @fullcalendar/list @fullcalendar/interaction cmdk
```

**Dependencias agregadas:**
- `ws` y `@types/ws`: WebSocket server y tipos
- `@fullcalendar/*`: Componente de calendario profesional
- `cmdk`: Componente de búsqueda tipo Cmd+K

### Paso 1.2: Verificar package.json

Asegúrate de que `package.json` contenga estas dependencias en la sección `dependencies`:

```json
{
  "dependencies": {
    "ws": "^8.18.0",
    "@fullcalendar/core": "^6.1.15",
    "@fullcalendar/react": "^6.1.15",
    "@fullcalendar/daygrid": "^6.1.15",
    "@fullcalendar/timegrid": "^6.1.15",
    "@fullcalendar/list": "^6.1.15",
    "@fullcalendar/interaction": "^6.1.15",
    "cmdk": "^1.1.1"
  },
  "devDependencies": {
    "@types/ws": "^8.5.13"
  }
}
```

---

## FASE 2: MIGRACIONES DE BASE DE DATOS

### Paso 2.1: Crear Migración para Tema de Usuario

Crear archivo: `drizzle/migrations/add_user_theme.sql`

```sql
-- Add theme column to users table
ALTER TABLE users ADD COLUMN theme VARCHAR(20) DEFAULT 'system' AFTER email;

-- Update existing users to have 'system' theme
UPDATE users SET theme = 'system' WHERE theme IS NULL;
```

### Paso 2.2: Crear Migración para Sistema de Tags

Crear archivo: `drizzle/migrations/add_tags_system.sql`

```sql
-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_tags_name (name),
  INDEX idx_tags_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create lead_tags junction table
CREATE TABLE IF NOT EXISTS lead_tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  lead_id INT NOT NULL,
  tag_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
  UNIQUE KEY idx_lead_tags_unique (lead_id, tag_id),
  INDEX idx_lead_tags_lead (lead_id),
  INDEX idx_lead_tags_tag (tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create conversation_notes table
CREATE TABLE IF NOT EXISTS conversation_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation_notes_conversation (conversation_id),
  INDEX idx_conversation_notes_user (user_id),
  INDEX idx_conversation_notes_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Paso 2.3: Crear Migración para Filtros Guardados

Crear archivo: `drizzle/migrations/add_saved_filters.sql`

```sql
-- Create saved_filters table
CREATE TABLE IF NOT EXISTS saved_filters (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  name VARCHAR(200) NOT NULL,
  entity_type VARCHAR(50) NOT NULL, -- 'leads', 'conversations', 'campaigns'
  filter_criteria JSON NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_saved_filters_user (user_id),
  INDEX idx_saved_filters_entity (entity_type),
  INDEX idx_saved_filters_default (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Paso 2.4: Crear Migración para Follow-up Automático

Crear archivo: `drizzle/migrations/add_followup_rules.sql`

```sql
-- Create followup_rules table
CREATE TABLE IF NOT EXISTS followup_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  trigger_type VARCHAR(50) NOT NULL, -- 'no_response', 'status_change', 'time_based', 'tag_added'
  trigger_config JSON NOT NULL,
  conditions JSON,
  action_type VARCHAR(50) NOT NULL, -- 'send_message', 'assign_to', 'change_status', 'add_tag', 'create_task'
  action_config JSON NOT NULL,
  priority INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_followup_rules_active (is_active),
  INDEX idx_followup_rules_trigger (trigger_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create followup_executions table (audit log)
CREATE TABLE IF NOT EXISTS followup_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_id INT NOT NULL,
  lead_id INT NOT NULL,
  conversation_id INT,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  action_result JSON,
  FOREIGN KEY (rule_id) REFERENCES followup_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  INDEX idx_followup_executions_rule (rule_id),
  INDEX idx_followup_executions_lead (lead_id),
  INDEX idx_followup_executions_time (executed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Paso 2.5: Ejecutar Migraciones

Ejecuta las migraciones en orden:

```bash
# Opción 1: Usando MySQL directamente
mysql -u usuario -p nombre_bd < drizzle/migrations/add_user_theme.sql
mysql -u usuario -p nombre_bd < drizzle/migrations/add_tags_system.sql
mysql -u usuario -p nombre_bd < drizzle/migrations/add_saved_filters.sql
mysql -u usuario -p nombre_bd < drizzle/migrations/add_followup_rules.sql

# Opción 2: Usando Drizzle (si está configurado)
npm run db:migrate
```

---

## FASE 3: ACTUALIZAR SCHEMA DE DRIZZLE

### Paso 3.1: Agregar Nuevas Tablas al Schema

Abre el archivo `drizzle/schema.ts` y agrega al final (antes del último export):

```typescript
/**
 * Tags for lead categorization
 */
export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  color: varchar("color", { length: 20 }).notNull().default("#3b82f6"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  nameIdx: index("idx_tags_name").on(table.name),
  createdIdx: index("idx_tags_created").on(table.createdAt),
}));

export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

/**
 * Lead-Tag junction table (many-to-many)
 */
export const leadTags = mysqlTable("lead_tags", {
  id: int("id").autoincrement().primaryKey(),
  leadId: int("leadId").notNull().references(() => leads.id, { onDelete: "cascade" }),
  tagId: int("tagId").notNull().references(() => tags.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  uniqueIdx: index("idx_lead_tags_unique").on(table.leadId, table.tagId),
  leadIdx: index("idx_lead_tags_lead").on(table.leadId),
  tagIdx: index("idx_lead_tags_tag").on(table.tagId),
}));

export type LeadTag = typeof leadTags.$inferSelect;
export type InsertLeadTag = typeof leadTags.$inferInsert;

/**
 * Internal notes for conversations (team-only)
 */
export const conversationNotes = mysqlTable("conversation_notes", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversationId").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  conversationIdx: index("idx_conversation_notes_conversation").on(table.conversationId),
  userIdx: index("idx_conversation_notes_user").on(table.userId),
  createdIdx: index("idx_conversation_notes_created").on(table.createdAt),
}));

export type ConversationNote = typeof conversationNotes.$inferSelect;
export type InsertConversationNote = typeof conversationNotes.$inferInsert;

/**
 * Saved filters for quick access
 */
export const savedFilters = mysqlTable("saved_filters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  entityType: varchar("entityType", { length: 50 }).notNull(), // 'leads', 'conversations', 'campaigns'
  filterCriteria: json("filterCriteria").$type<Record<string, any>>().notNull(),
  isDefault: boolean("isDefault").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  userIdx: index("idx_saved_filters_user").on(table.userId),
  entityIdx: index("idx_saved_filters_entity").on(table.entityType),
  defaultIdx: index("idx_saved_filters_default").on(table.isDefault),
}));

export type SavedFilter = typeof savedFilters.$inferSelect;
export type InsertSavedFilter = typeof savedFilters.$inferInsert;

/**
 * Follow-up automation rules
 */
export const followupRules = mysqlTable("followup_rules", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  isActive: boolean("isActive").default(true).notNull(),
  triggerType: varchar("triggerType", { length: 50 }).notNull(), // 'no_response', 'status_change', 'time_based', 'tag_added'
  triggerConfig: json("triggerConfig").$type<Record<string, any>>().notNull(),
  conditions: json("conditions").$type<Record<string, any>>(),
  actionType: varchar("actionType", { length: 50 }).notNull(), // 'send_message', 'assign_to', 'change_status', 'add_tag', 'create_task'
  actionConfig: json("actionConfig").$type<Record<string, any>>().notNull(),
  priority: int("priority").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  activeIdx: index("idx_followup_rules_active").on(table.isActive),
  triggerIdx: index("idx_followup_rules_trigger").on(table.triggerType),
}));

export type FollowupRule = typeof followupRules.$inferSelect;
export type InsertFollowupRule = typeof followupRules.$inferInsert;

/**
 * Follow-up execution audit log
 */
export const followupExecutions = mysqlTable("followup_executions", {
  id: int("id").autoincrement().primaryKey(),
  ruleId: int("ruleId").notNull().references(() => followupRules.id, { onDelete: "cascade" }),
  leadId: int("leadId").notNull().references(() => leads.id, { onDelete: "cascade" }),
  conversationId: int("conversationId"),
  executedAt: timestamp("executedAt").defaultNow().notNull(),
  success: boolean("success").notNull(),
  errorMessage: text("errorMessage"),
  actionResult: json("actionResult").$type<Record<string, any>>(),
}, (table) => ({
  ruleIdx: index("idx_followup_executions_rule").on(table.ruleId),
  leadIdx: index("idx_followup_executions_lead").on(table.leadId),
  timeIdx: index("idx_followup_executions_time").on(table.executedAt),
}));

export type FollowupExecution = typeof followupExecutions.$inferSelect;
export type InsertFollowupExecution = typeof followupExecutions.$inferInsert;
```

### Paso 3.2: Agregar Campo theme a la Tabla users

En el mismo archivo `drizzle/schema.ts`, busca la definición de la tabla `users` y agrega el campo `theme`:

```typescript
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  // ... otros campos existentes ...
  email: varchar("email", { length: 255 }).notNull().unique(),
  theme: varchar("theme", { length: 20 }).default("system"), // AGREGAR ESTA LÍNEA
  // ... resto de campos ...
});
```

---

## VERIFICACIÓN DE FASE 1-3

Antes de continuar, verifica:

✅ Todas las dependencias instaladas correctamente  
✅ Todas las migraciones SQL ejecutadas sin errores  
✅ Schema de Drizzle actualizado con nuevas tablas  
✅ Campo `theme` agregado a tabla `users`  
✅ No hay errores de TypeScript al compilar

Si todo está correcto, continúa con la Parte 2 de la guía.

---

**Fin de Parte 1**
