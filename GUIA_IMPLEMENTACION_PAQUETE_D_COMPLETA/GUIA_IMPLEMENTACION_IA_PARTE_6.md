# Guía de Implementación del Paquete D Enterprise - Parte 6

## Instrucciones para IA: Componentes de Frontend Restantes y Actualizaciones

---

## FASE 14: ACTUALIZAR THEMECONTEXT

### Paso 14.1: Actualizar ThemeContext para Soporte de Tema 'system'

Abre el archivo `client/src/contexts/ThemeContext.tsx` y reemplaza TODO el contenido con:

```typescript
import { createContext, useContext, useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  actualTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  switchable = false,
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
  switchable?: boolean;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [actualTheme, setActualTheme] = useState<"light" | "dark">("light");

  const { data: user } = trpc.auth.me.useQuery();
  const updateThemeMutation = trpc.auth.updateTheme.useMutation();

  // Load user's saved theme preference
  useEffect(() => {
    if (user?.theme) {
      setThemeState(user.theme as Theme);
    }
  }, [user]);

  // Determine actual theme (resolve 'system' to 'light' or 'dark')
  useEffect(() => {
    const resolveTheme = () => {
      if (theme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        return systemTheme;
      }
      return theme;
    };

    const resolved = resolveTheme();
    setActualTheme(resolved);

    // Apply theme to document
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);

    // Listen for system theme changes
    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e: MediaQueryListEvent) => {
        const newTheme = e.matches ? "dark" : "light";
        setActualTheme(newTheme);
        root.classList.remove("light", "dark");
        root.classList.add(newTheme);
      };

      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);

    // Save to backend if user is logged in
    if (user) {
      updateThemeMutation.mutate({ theme: newTheme });
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
```

### Paso 14.2: Crear Componente ThemeSelector

Crear archivo: `client/src/components/ThemeSelector.tsx`

```typescript
import { useTheme } from "@/contexts/ThemeContext";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium">Tema de la Interfaz</h3>
        <p className="text-sm text-muted-foreground">
          Selecciona el tema de color para la aplicación
        </p>
      </div>

      <RadioGroup value={theme} onValueChange={(value) => setTheme(value as any)}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="light" id="light" />
          <Label htmlFor="light" className="flex items-center gap-2 cursor-pointer">
            <Sun className="h-4 w-4" />
            Claro
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <RadioGroupItem value="dark" id="dark" />
          <Label htmlFor="dark" className="flex items-center gap-2 cursor-pointer">
            <Moon className="h-4 w-4" />
            Oscuro
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <RadioGroupItem value="system" id="system" />
          <Label htmlFor="system" className="flex items-center gap-2 cursor-pointer">
            <Monitor className="h-4 w-4" />
            Sistema
          </Label>
        </div>
      </RadioGroup>
    </div>
  );
}
```

### Paso 14.3: Integrar ThemeSelector en Settings

Abre el archivo `client/src/pages/Settings.tsx` y realiza los siguientes cambios:

**1. Agregar import:**

```typescript
import { ThemeSelector } from "@/components/ThemeSelector";
```

**2. Buscar el tab "General" y agregar ThemeSelector:**

Busca la sección que renderiza el contenido del tab "General" y agrega:

```typescript
<div className="space-y-6">
  {/* ... contenido existente ... */}
  
  <ThemeSelector />  {/* AGREGAR ESTA LÍNEA */}
</div>
```

---

## FASE 15: ACTUALIZAR CHATTHREAD CON DRAG & DROP E INDICADORES DE TIPEO

### Paso 15.1: Actualizar ChatThread

Abre el archivo `client/src/components/chat/ChatThread.tsx` y realiza los siguientes cambios:

**1. Agregar imports:**

```typescript
import { useState, useCallback, useRef } from "react";
import { useWebSocket, useTypingIndicator } from "@/core/hooks/useWebSocket";
import { Upload } from "lucide-react";
```

**2. Agregar estados para drag & drop y WebSocket:**

Dentro del componente, después de los estados existentes, agregar:

```typescript
const [isDragging, setIsDragging] = useState(false);
const dragCounterRef = useRef(0);

// WebSocket connection
const { send: wsSend } = useWebSocket({
  url: `ws://${window.location.host}/ws`,
  token: localStorage.getItem("token") || "",
  onMessage: (data) => {
    if (data.type === "new_message" && data.conversationId === conversationId) {
      // Refetch messages
      refetchMessages();
    }
  },
});

// Typing indicator
const { typingUsers, handleTypingEvent } = useTypingIndicator(conversationId);

useEffect(() => {
  // Subscribe to typing events
  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      handleTypingEvent(data);
    } catch (error) {
      // Ignore parse errors
    }
  };

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}, [handleTypingEvent]);
```

**3. Agregar handlers de drag & drop:**

```typescript
const handleDragEnter = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounterRef.current++;
  if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
    setIsDragging(true);
  }
}, []);

const handleDragLeave = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  dragCounterRef.current--;
  if (dragCounterRef.current === 0) {
    setIsDragging(false);
  }
}, []);

const handleDragOver = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
}, []);

const handleDrop = useCallback((e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
  setIsDragging(false);
  dragCounterRef.current = 0;

  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const files = Array.from(e.dataTransfer.files);
    handleFiles(files);
    e.dataTransfer.clearData();
  }
}, []);

const handleFiles = useCallback((files: File[]) => {
  // Reuse existing file upload logic
  files.forEach((file) => {
    // Call existing handleFileSelect or similar function
    console.log("Uploading file:", file.name);
    // TODO: Implement actual upload logic
  });
}, []);
```

**4. Agregar handler de tipeo:**

```typescript
const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const value = e.target.value;
  setMessage(value);

  // Send typing indicator
  if (value.length > 0) {
    wsSend({
      type: "typing",
      conversationId,
    });
  }
}, [conversationId, wsSend]);
```

**5. Actualizar el return del componente:**

Busca el `return` principal del componente y agrega los event handlers al contenedor principal:

```typescript
return (
  <div
    className="flex flex-col h-full relative"
    onDragEnter={handleDragEnter}
    onDragLeave={handleDragLeave}
    onDragOver={handleDragOver}
    onDrop={handleDrop}
  >
    {/* Drag overlay */}
    {isDragging && (
      <div className="absolute inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
        <div className="text-center">
          <Upload className="h-12 w-12 mx-auto mb-2 text-primary" />
          <p className="text-lg font-medium">Suelta los archivos aquí</p>
        </div>
      </div>
    )}

    {/* Messages area */}
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {/* ... existing messages rendering ... */}

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span>Escribiendo...</span>
        </div>
      )}
    </div>

    {/* Input area */}
    <div className="border-t p-4">
      <input
        type="text"
        value={message}
        onChange={handleInputChange}  {/* USAR EL NUEVO HANDLER */}
        placeholder="Escribe un mensaje..."
        className="w-full"
      />
    </div>
  </div>
);
```

---

## FASE 16: ACTUALIZAR APP.TSX

### Paso 16.1: Actualizar Configuración de Tema en App.tsx

Abre el archivo `client/src/App.tsx` y asegúrate de que el ThemeProvider esté configurado correctamente:

```typescript
<ThemeProvider
  defaultTheme="system"  // Cambiar a 'system' si no lo está
  switchable  // Habilitar cambio de tema
>
  <TooltipProvider>
    <Toaster />
    <GlobalSearch />
    <Router />
  </TooltipProvider>
</ThemeProvider>
```

---

## FASE 17: AGREGAR VARIABLES DE ENTORNO

### Paso 17.1: Actualizar .env.example

Crear o actualizar el archivo `.env.example` en la raíz del proyecto:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/crm_db

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this

# OpenAI (Optional - for AI-powered features)
OPENAI_API_KEY=sk-...

# Server
PORT=3000
NODE_ENV=development

# WhatsApp Integration
WHATSAPP_API_URL=https://graph.facebook.com/v17.0
WHATSAPP_ACCESS_TOKEN=your-whatsapp-token

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### Paso 17.2: Actualizar server/_core/env.ts

Abre el archivo `server/_core/env.ts` y asegúrate de que incluya:

```typescript
export const env = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "default-secret-change-this",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
  PORT: parseInt(process.env.PORT || "3000"),
  NODE_ENV: process.env.NODE_ENV || "development",
  WHATSAPP_API_URL: process.env.WHATSAPP_API_URL || "",
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN || "",
};
```

---

## FASE 18: ACTUALIZAR PACKAGE.JSON SCRIPTS

### Paso 18.1: Verificar Scripts de Build y Start

Abre el archivo `package.json` y asegúrate de que los scripts estén correctos:

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"tsx watch server/_core/index.ts\"",
    "build": "vite build && tsc --project tsconfig.server.json && tsc-alias -p tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/_core/index.js",
    "preview": "vite preview",
    "db:migrate": "tsx server/scripts/migrate.ts",
    "db:seed": "tsx server/scripts/seed.ts",
    "check": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```

Si falta `concurrently`, instálalo:

```bash
pnpm add -D concurrently
```

---

## VERIFICACIÓN DE FASE 14-18

Antes de continuar, verifica:

✅ ThemeContext actualizado con soporte 'system'  
✅ ThemeSelector creado e integrado en Settings  
✅ ChatThread actualizado con drag & drop  
✅ ChatThread actualizado con indicadores de tipeo  
✅ App.tsx configurado correctamente  
✅ Variables de entorno documentadas  
✅ Scripts de package.json correctos  
✅ No hay errores de TypeScript al compilar

Si todo está correcto, continúa con la Parte 7 (checklist final y testing).

---

**Fin de Parte 6**
