# Guía de Implementación del Paquete D Enterprise - Parte 7

## Instrucciones para IA: Checklist de Validación, Testing y Despliegue

---

## FASE 19: CHECKLIST DE VALIDACIÓN PRE-PRODUCCIÓN

### Paso 19.1: Verificación de Base de Datos

Ejecuta las siguientes queries para verificar que todas las tablas fueron creadas correctamente:

```sql
-- Verificar que todas las nuevas tablas existen
SHOW TABLES LIKE 'tags';
SHOW TABLES LIKE 'lead_tags';
SHOW TABLES LIKE 'conversation_notes';
SHOW TABLES LIKE 'saved_filters';
SHOW TABLES LIKE 'followup_rules';
SHOW TABLES LIKE 'followup_executions';

-- Verificar que el campo theme existe en users
DESCRIBE users;

-- Verificar índices
SHOW INDEX FROM tags;
SHOW INDEX FROM lead_tags;
SHOW INDEX FROM conversation_notes;
SHOW INDEX FROM saved_filters;
SHOW INDEX FROM followup_rules;
SHOW INDEX FROM followup_executions;
```

**Resultado esperado:** Todas las tablas deben existir con sus respectivos índices.

### Paso 19.2: Verificación de Compilación TypeScript

Ejecuta el comando de verificación de tipos:

```bash
npm run check
# o
pnpm check
```

**Resultado esperado:** No debe haber errores de TypeScript. Warnings son aceptables pero deben ser revisados.

### Paso 19.3: Verificación de Dependencias

Verifica que todas las dependencias se instalaron correctamente:

```bash
pnpm list ws @types/ws @fullcalendar/react cmdk
```

**Resultado esperado:** Todas las dependencias deben estar listadas con sus versiones.

### Paso 19.4: Verificación de Archivos Creados

Ejecuta el siguiente comando para verificar que todos los archivos fueron creados:

```bash
# Backend
ls -la server/_core/websocket.ts
ls -la server/services/cache.ts
ls -la server/services/followup-engine.ts
ls -la server/routers/tags.ts
ls -la server/routers/conversation-notes.ts
ls -la server/routers/ai.ts
ls -la server/routers/import.ts
ls -la server/routers/search.ts
ls -la server/routers/saved-filters.ts
ls -la server/routers/followup.ts

# Frontend
ls -la client/src/_core/hooks/useWebSocket.ts
ls -la client/src/components/GlobalSearch.tsx
ls -la client/src/components/CalendarView.tsx
ls -la client/src/components/ThemeSelector.tsx

# Migraciones
ls -la drizzle/migrations/add_user_theme.sql
ls -la drizzle/migrations/add_tags_system.sql
ls -la drizzle/migrations/add_saved_filters.sql
ls -la drizzle/migrations/add_followup_rules.sql
```

**Resultado esperado:** Todos los archivos deben existir.

---

## FASE 20: TESTING FUNCIONAL

### Paso 20.1: Test de WebSocket

**Objetivo:** Verificar que el servidor WebSocket se inicia correctamente y acepta conexiones.

**Procedimiento:**

1. Inicia el servidor en modo desarrollo:
   ```bash
   npm run dev
   ```

2. Verifica en los logs del servidor que aparezca:
   ```
   [WebSocket] Server initialized
   ```

3. Abre la aplicación en el navegador y verifica en la consola del navegador que aparezca:
   ```
   [WebSocket] Connected
   ```

**Resultado esperado:** Conexión WebSocket establecida sin errores.

### Paso 20.2: Test de Búsqueda Global

**Objetivo:** Verificar que la búsqueda global funciona correctamente.

**Procedimiento:**

1. Abre la aplicación en el navegador
2. Presiona `Cmd+K` (Mac) o `Ctrl+K` (Windows/Linux)
3. Verifica que se abre el diálogo de búsqueda
4. Escribe "test" en el campo de búsqueda
5. Verifica que aparecen resultados o el mensaje "Buscando..."

**Resultado esperado:** El diálogo se abre y la búsqueda funciona sin errores en la consola.

### Paso 20.3: Test de Modo Oscuro

**Objetivo:** Verificar que el cambio de tema funciona correctamente.

**Procedimiento:**

1. Navega a Settings > General
2. Verifica que aparece el selector de tema con 3 opciones: Claro, Oscuro, Sistema
3. Selecciona "Oscuro"
4. Verifica que la interfaz cambia a modo oscuro
5. Recarga la página
6. Verifica que el tema se mantiene en oscuro

**Resultado esperado:** El tema cambia correctamente y persiste después de recargar.

### Paso 20.4: Test de Calendario

**Objetivo:** Verificar que la vista de calendario funciona correctamente.

**Procedimiento:**

1. Navega a la página de Agendamiento
2. Verifica que aparecen los botones "Cuadrícula" y "Calendario"
3. Haz clic en "Calendario"
4. Verifica que se muestra el calendario de FullCalendar
5. Verifica que las citas existentes aparecen en el calendario

**Resultado esperado:** El calendario se renderiza correctamente con las citas.

### Paso 20.5: Test de Drag & Drop

**Objetivo:** Verificar que el drag & drop de archivos funciona en el chat.

**Procedimiento:**

1. Navega a la página de Chat
2. Selecciona una conversación
3. Arrastra un archivo desde tu sistema operativo hacia el área de chat
4. Verifica que aparece el overlay "Suelta los archivos aquí"
5. Suelta el archivo
6. Verifica que el archivo se procesa (aunque aún no se suba, no debe haber errores)

**Resultado esperado:** El overlay aparece y desaparece correctamente sin errores.

### Paso 20.6: Test de Indicadores de Tipeo

**Objetivo:** Verificar que los indicadores de tipeo funcionan.

**Procedimiento:**

1. Abre la aplicación en dos pestañas diferentes del navegador
2. Inicia sesión con dos usuarios diferentes (o simula dos sesiones)
3. En la primera pestaña, comienza a escribir en una conversación
4. En la segunda pestaña, verifica que aparece el indicador "Escribiendo..." con los 3 puntos animados

**Resultado esperado:** El indicador de tipeo aparece en tiempo real.

### Paso 20.7: Test de Tags

**Objetivo:** Verificar que el sistema de tags funciona correctamente.

**Procedimiento:**

1. Usa una herramienta como Postman o curl para crear un tag:
   ```bash
   curl -X POST http://localhost:3000/api/trpc/tags.create \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"name":"VIP","color":"#ff0000"}'
   ```

2. Verifica en la base de datos que el tag fue creado:
   ```sql
   SELECT * FROM tags;
   ```

**Resultado esperado:** El tag se crea correctamente en la base de datos.

### Paso 20.8: Test de Follow-up Engine

**Objetivo:** Verificar que el motor de follow-up se inicia correctamente.

**Procedimiento:**

1. Inicia el servidor
2. Verifica en los logs que aparezca:
   ```
   [FollowupEngine] Starting...
   [FollowupEngine] Evaluating X rules
   ```

3. Crea una regla de follow-up simple en la base de datos:
   ```sql
   INSERT INTO followup_rules (name, description, is_active, trigger_type, trigger_config, action_type, action_config, priority)
   VALUES (
     'Test Rule',
     'Regla de prueba',
     TRUE,
     'time_based',
     '{"days": 7, "field": "createdAt"}',
     'send_message',
     '{"template": "Mensaje de prueba"}',
     0
   );
   ```

4. Espera 5 minutos y verifica en los logs que la regla fue evaluada

**Resultado esperado:** El motor evalúa las reglas sin errores.

### Paso 20.9: Test de Caché

**Objetivo:** Verificar que el sistema de caché funciona correctamente.

**Procedimiento:**

1. Navega al Dashboard
2. Abre las herramientas de desarrollo del navegador (Network tab)
3. Recarga la página
4. Verifica el tiempo de respuesta del endpoint `dashboard.getStats`
5. Recarga la página nuevamente dentro de 30 segundos
6. Verifica que el segundo request es más rápido (datos en caché)

**Resultado esperado:** El segundo request es significativamente más rápido.

### Paso 20.10: Test de Paginación Infinita

**Objetivo:** Verificar que la paginación infinita funciona correctamente.

**Procedimiento:**

1. Usa Postman o curl para llamar al endpoint de paginación:
   ```bash
   curl -X GET "http://localhost:3000/api/trpc/leads.listInfinite?input={\"limit\":10}" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. Verifica que la respuesta incluye:
   - `items`: Array de leads
   - `nextCursor`: ID del último lead o null

3. Si hay nextCursor, haz otra llamada con ese cursor:
   ```bash
   curl -X GET "http://localhost:3000/api/trpc/leads.listInfinite?input={\"limit\":10,\"cursor\":123}" \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

**Resultado esperado:** La paginación devuelve resultados correctos con cursores.

---

## FASE 21: OPTIMIZACIONES DE PRODUCCIÓN

### Paso 21.1: Configurar Variables de Entorno de Producción

Crea un archivo `.env.production` con las credenciales reales:

```env
DATABASE_URL=mysql://prod_user:secure_password@prod-db-host:3306/crm_prod
JWT_SECRET=super-secure-random-string-min-32-chars
OPENAI_API_KEY=sk-prod-key-if-available
PORT=3000
NODE_ENV=production
WHATSAPP_API_URL=https://graph.facebook.com/v17.0
WHATSAPP_ACCESS_TOKEN=prod-whatsapp-token
```

**IMPORTANTE:** Nunca commitees este archivo al repositorio. Agrega `.env.production` al `.gitignore`.

### Paso 21.2: Optimizar Build de Producción

Ejecuta el build de producción:

```bash
npm run build
```

Verifica que no hay errores y que se generan los siguientes archivos:

- `dist/public/` - Assets del frontend
- `dist/server/` - Código del servidor compilado

### Paso 21.3: Configurar PM2 para Producción

Instala PM2 globalmente:

```bash
npm install -g pm2
```

Crea un archivo `ecosystem.config.js` en la raíz del proyecto:

```javascript
module.exports = {
  apps: [{
    name: 'crm-pro',
    script: './dist/server/_core/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    watch: false
  }]
};
```

Inicia la aplicación con PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Paso 21.4: Configurar Nginx como Reverse Proxy

Crea un archivo de configuración de Nginx `/etc/nginx/sites-available/crm-pro`:

```nginx
upstream crm_backend {
    least_conn;
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/ssl/cert.pem;
    ssl_certificate_key /path/to/ssl/key.pem;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # WebSocket support
    location /ws {
        proxy_pass http://crm_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # API endpoints
    location /api {
        proxy_pass http://crm_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Static files
    location / {
        proxy_pass http://crm_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/json;
}
```

Habilita el sitio:

```bash
sudo ln -s /etc/nginx/sites-available/crm-pro /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Paso 21.5: Configurar Backups Automáticos de Base de Datos

Crea un script de backup `/opt/crm-backups/backup.sh`:

```bash
#!/bin/bash

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/crm-backups"
DB_NAME="crm_prod"
DB_USER="prod_user"
DB_PASS="secure_password"

# Create backup
mysqldump -u $DB_USER -p$DB_PASS $DB_NAME | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: backup_$DATE.sql.gz"
```

Hazlo ejecutable:

```bash
chmod +x /opt/crm-backups/backup.sh
```

Agrega un cron job para ejecutarlo diariamente:

```bash
crontab -e
```

Agrega la línea:

```
0 2 * * * /opt/crm-backups/backup.sh >> /opt/crm-backups/backup.log 2>&1
```

---

## FASE 22: MONITOREO Y MANTENIMIENTO

### Paso 22.1: Configurar Logs Centralizados

Instala Winston para logging estructurado:

```bash
pnpm add winston winston-daily-rotate-file
```

Crea un archivo `server/_core/logger.ts`:

```typescript
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d'
    })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

export default logger;
```

### Paso 22.2: Configurar Health Check Endpoint

Agrega un endpoint de health check en `server/_core/index.ts`:

```typescript
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const db = await getDb();
    if (!db) throw new Error('Database not available');

    // Check WebSocket
    const wsStats = wsManager.getStats();

    // Check cache
    const cacheStats = cache.getStats();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      websocket: wsStats,
      cache: cacheStats,
      memory: process.memoryUsage(),
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});
```

### Paso 22.3: Configurar Alertas

Instala un servicio de monitoreo como UptimeRobot o Pingdom para:

- Monitorear el endpoint `/health` cada 5 minutos
- Enviar alertas por email/SMS si el servicio está caído
- Monitorear el tiempo de respuesta

---

## FASE 23: CHECKLIST FINAL DE DESPLIEGUE

Antes de desplegar a producción, verifica:

### Base de Datos
- [ ] Todas las migraciones ejecutadas correctamente
- [ ] Índices creados en todas las tablas nuevas
- [ ] Backup automático configurado y testeado
- [ ] Credenciales de producción seguras

### Backend
- [ ] Todas las dependencias instaladas
- [ ] Variables de entorno de producción configuradas
- [ ] JWT_SECRET es un string aleatorio seguro (min 32 caracteres)
- [ ] WebSocket server se inicia correctamente
- [ ] Follow-up engine se inicia correctamente
- [ ] Cache service funciona correctamente
- [ ] Todos los routers tRPC funcionan sin errores
- [ ] Build de producción exitoso sin errores

### Frontend
- [ ] GlobalSearch funciona con Cmd+K
- [ ] Modo oscuro funciona y persiste
- [ ] Calendario se renderiza correctamente
- [ ] Drag & drop funciona en chat
- [ ] Indicadores de tipeo funcionan
- [ ] Build de producción exitoso sin errores

### Infraestructura
- [ ] PM2 configurado y corriendo
- [ ] Nginx configurado como reverse proxy
- [ ] SSL/TLS configurado correctamente
- [ ] WebSocket proxy configurado en Nginx
- [ ] Firewall configurado (solo puertos 80, 443, 22)
- [ ] Health check endpoint responde correctamente

### Seguridad
- [ ] Todas las contraseñas son seguras
- [ ] `.env` y `.env.production` en `.gitignore`
- [ ] CORS configurado correctamente
- [ ] Rate limiting configurado
- [ ] Headers de seguridad configurados en Nginx

### Monitoreo
- [ ] Logs centralizados configurados
- [ ] Rotación de logs configurada
- [ ] Servicio de uptime monitoring configurado
- [ ] Alertas configuradas

### Documentación
- [ ] README actualizado con instrucciones de despliegue
- [ ] Documentación de API actualizada
- [ ] Guía de usuario actualizada con nuevas features

---

## FASE 24: ROLLBACK PLAN

En caso de que algo salga mal en producción, sigue estos pasos:

### Paso 24.1: Rollback de Código

```bash
# Detener PM2
pm2 stop crm-pro

# Restaurar versión anterior desde git
git checkout <previous-commit-hash>

# Rebuild
npm run build

# Reiniciar PM2
pm2 restart crm-pro
```

### Paso 24.2: Rollback de Base de Datos

```bash
# Restaurar backup más reciente
gunzip < /opt/crm-backups/backup_YYYYMMDD_HHMMSS.sql.gz | mysql -u prod_user -p crm_prod
```

### Paso 24.3: Verificar Estado

```bash
# Verificar logs
pm2 logs crm-pro

# Verificar health check
curl https://your-domain.com/health
```

---

## RESUMEN DE IMPLEMENTACIÓN

Has completado la implementación del **Paquete D Enterprise** con las siguientes 15 mejoras:

1. ✅ Búsqueda global tipo Cmd+K
2. ✅ WebSockets en tiempo real
3. ✅ Vista de calendario con FullCalendar
4. ✅ Modo oscuro persistente
5. ✅ Drag & drop de archivos
6. ✅ Respuestas sugeridas con IA
7. ✅ Follow-up automático
8. ✅ Filtros guardados
9. ✅ Sistema de tags
10. ✅ Notas internas
11. ✅ Importar historial CSV/JSON
12. ✅ Paginación infinita
13. ✅ Sistema de caché
14. ✅ Indicadores de tipeo
15. ✅ Actualizaciones de dependencias

**Archivos creados:** 18 nuevos archivos  
**Archivos modificados:** 8 archivos existentes  
**Migraciones SQL:** 4 archivos  
**Líneas de código agregadas:** ~3,500 líneas

El sistema está listo para transformar la productividad del equipo de ventas con mejoras medibles en eficiencia, colaboración y automatización.

---

**Fin de Parte 7 - Guía Completa**
