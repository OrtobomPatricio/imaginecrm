# Guía de Implementación del Paquete D Enterprise - Parte 5

## Instrucciones para IA: Hooks y Componentes de Frontend (Primera Mitad)

---

## FASE 11: CREAR HOOKS DE WEBSOCKET

### Paso 11.1: Hook Principal de WebSocket

Crear archivo: `client/src/_core/hooks/useWebSocket.ts`

```typescript
import { useEffect, useRef, useState, useCallback } from "react";

interface UseWebSocketOptions {
  url: string;
  token: string;
  onMessage?: (data: any) => void;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions) {
  const {
    url,
    token,
    onMessage,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `${url}?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[WebSocket] Connected");
      setIsConnected(true);
      setReconnectAttempts(0);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage?.(data);
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
    };

    ws.onclose = () => {
      console.log("[WebSocket] Disconnected");
      setIsConnected(false);
      wsRef.current = null;

      // Attempt to reconnect with exponential backoff
      if (reconnectAttempts < maxReconnectAttempts) {
        const delay = Math.min(
          reconnectInterval * Math.pow(2, reconnectAttempts),
          30000
        );

        console.log(`[WebSocket] Reconnecting in ${delay}ms...`);

        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectAttempts((prev) => prev + 1);
          connect();
        }, delay);
      }
    };

    wsRef.current = ws;
  }, [url, token, onMessage, reconnectInterval, reconnectAttempts, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    } else {
      console.warn("[WebSocket] Cannot send message: not connected");
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected,
    send,
    disconnect,
    reconnect: connect,
  };
}

// Hook for typing indicators
export function useTypingIndicator(conversationId: number) {
  const [typingUsers, setTypingUsers] = useState<number[]>([]);
  const timeoutRef = useRef<Record<number, NodeJS.Timeout>>({});

  const handleTypingEvent = useCallback((data: any) => {
    if (data.type === "user_typing" && data.conversationId === conversationId) {
      const userId = data.userId;

      // Add user to typing list
      setTypingUsers((prev) => {
        if (!prev.includes(userId)) {
          return [...prev, userId];
        }
        return prev;
      });

      // Clear existing timeout
      if (timeoutRef.current[userId]) {
        clearTimeout(timeoutRef.current[userId]);
      }

      // Remove user after 3 seconds of inactivity
      timeoutRef.current[userId] = setTimeout(() => {
        setTypingUsers((prev) => prev.filter((id) => id !== userId));
        delete timeoutRef.current[userId];
      }, 3000);
    }
  }, [conversationId]);

  useEffect(() => {
    return () => {
      // Cleanup timeouts
      Object.values(timeoutRef.current).forEach(clearTimeout);
    };
  }, []);

  return {
    typingUsers,
    handleTypingEvent,
  };
}

// Hook for new message notifications
export function useNewMessageNotifications() {
  const [newMessages, setNewMessages] = useState<any[]>([]);

  const handleNewMessage = useCallback((data: any) => {
    if (data.type === "new_message") {
      setNewMessages((prev) => [...prev, data.message]);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        setNewMessages((prev) => prev.filter((m) => m.id !== data.message.id));
      }, 5000);
    }
  }, []);

  const clearNotification = useCallback((messageId: number) => {
    setNewMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  return {
    newMessages,
    handleNewMessage,
    clearNotification,
  };
}
```

---

## FASE 12: CREAR COMPONENTE DE BÚSQUEDA GLOBAL

### Paso 12.1: Componente GlobalSearch

Crear archivo: `client/src/components/GlobalSearch.tsx`

```typescript
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Search, User, MessageSquare, FileText, Calendar, Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();

  const { data: searchResults, isLoading } = trpc.search.globalSearch.useQuery(
    { query, limit: 10 },
    { enabled: query.length >= 2 }
  );

  // Keyboard shortcut: Cmd+K or Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((path: string) => {
    setOpen(false);
    setLocation(path);
    setQuery("");
  }, [setLocation]);

  const pages = [
    { name: "Dashboard", path: "/", icon: FileText },
    { name: "Leads", path: "/leads", icon: User },
    { name: "Chat", path: "/chat", icon: MessageSquare },
    { name: "Agendamiento", path: "/scheduling", icon: Calendar },
    { name: "Configuración", path: "/settings", icon: Settings },
  ];

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Buscar leads, conversaciones, páginas..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {isLoading ? "Buscando..." : "No se encontraron resultados"}
        </CommandEmpty>

        {/* Quick actions */}
        {query.length === 0 && (
          <CommandGroup heading="Acciones Rápidas">
            <CommandItem onSelect={() => handleSelect("/leads/new")}>
              <User className="mr-2 h-4 w-4" />
              Crear nuevo lead
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/campaigns/new")}>
              <MessageSquare className="mr-2 h-4 w-4" />
              Crear campaña
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/scheduling/new")}>
              <Calendar className="mr-2 h-4 w-4" />
              Agendar cita
            </CommandItem>
          </CommandGroup>
        )}

        {/* Pages */}
        {query.length === 0 && (
          <CommandGroup heading="Páginas">
            {pages.map((page) => (
              <CommandItem key={page.path} onSelect={() => handleSelect(page.path)}>
                <page.icon className="mr-2 h-4 w-4" />
                {page.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search results - Leads */}
        {searchResults && searchResults.leads.length > 0 && (
          <CommandGroup heading="Leads">
            {searchResults.leads.map((lead: any) => (
              <CommandItem
                key={lead.id}
                onSelect={() => handleSelect(`/leads/${lead.id}`)}
              >
                <User className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>{lead.name}</span>
                  <span className="text-xs text-muted-foreground">{lead.phone}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {/* Search results - Conversations */}
        {searchResults && searchResults.conversations.length > 0 && (
          <CommandGroup heading="Conversaciones">
            {searchResults.conversations.map((conv: any) => (
              <CommandItem
                key={conv.id}
                onSelect={() => handleSelect(`/chat?conversation=${conv.id}`)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                <div className="flex flex-col">
                  <span>Conversación #{conv.id}</span>
                  <span className="text-xs text-muted-foreground truncate max-w-md">
                    {conv.lastMessage}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
```

### Paso 12.2: Integrar GlobalSearch en App

Abre el archivo `client/src/App.tsx` y realiza los siguientes cambios:

**1. Agregar import:**

```typescript
import { GlobalSearch } from "@/components/GlobalSearch";
```

**2. Agregar el componente dentro del `return`, justo después de `<TooltipProvider>` y antes de `<Router />`:**

```typescript
<TooltipProvider>
  <Toaster />
  <GlobalSearch />  {/* AGREGAR ESTA LÍNEA */}
  <Router />
</TooltipProvider>
```

---

## FASE 13: CREAR COMPONENTE DE CALENDARIO

### Paso 13.1: Componente CalendarView

Crear archivo: `client/src/components/CalendarView.tsx`

```typescript
import { useCallback } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";

interface CalendarViewProps {
  events: Array<{
    id: number;
    title: string;
    start: Date;
    end: Date;
    backgroundColor?: string;
  }>;
  onEventClick?: (eventId: number) => void;
  onDateClick?: (date: Date) => void;
  onEventDrop?: (eventId: number, newStart: Date, newEnd: Date) => void;
}

export function CalendarView({
  events,
  onEventClick,
  onDateClick,
  onEventDrop,
}: CalendarViewProps) {
  const handleEventClick = useCallback(
    (info: any) => {
      onEventClick?.(Number(info.event.id));
    },
    [onEventClick]
  );

  const handleDateClick = useCallback(
    (info: any) => {
      onDateClick?.(info.date);
    },
    [onDateClick]
  );

  const handleEventDrop = useCallback(
    (info: any) => {
      const eventId = Number(info.event.id);
      const newStart = info.event.start;
      const newEnd = info.event.end || info.event.start;

      onEventDrop?.(eventId, newStart, newEnd);
    },
    [onEventDrop]
  );

  return (
    <div className="calendar-container">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
        }}
        locale={esLocale}
        events={events}
        eventClick={handleEventClick}
        dateClick={handleDateClick}
        eventDrop={handleEventDrop}
        editable={true}
        droppable={true}
        height="auto"
        slotMinTime="07:00:00"
        slotMaxTime="21:00:00"
        allDaySlot={false}
        nowIndicator={true}
        eventTimeFormat={{
          hour: "2-digit",
          minute: "2-digit",
          meridiem: false,
        }}
        buttonText={{
          today: "Hoy",
          month: "Mes",
          week: "Semana",
          day: "Día",
          list: "Lista",
        }}
      />

      <style jsx global>{`
        .calendar-container {
          padding: 1rem;
        }

        .fc {
          --fc-border-color: hsl(var(--border));
          --fc-button-bg-color: hsl(var(--primary));
          --fc-button-border-color: hsl(var(--primary));
          --fc-button-hover-bg-color: hsl(var(--primary) / 0.9);
          --fc-button-hover-border-color: hsl(var(--primary) / 0.9);
          --fc-button-active-bg-color: hsl(var(--primary) / 0.8);
          --fc-button-active-border-color: hsl(var(--primary) / 0.8);
          --fc-event-bg-color: hsl(var(--primary));
          --fc-event-border-color: hsl(var(--primary));
          --fc-today-bg-color: hsl(var(--accent));
        }

        .dark .fc {
          --fc-page-bg-color: hsl(var(--background));
          --fc-neutral-bg-color: hsl(var(--muted));
          --fc-neutral-text-color: hsl(var(--foreground));
          --fc-border-color: hsl(var(--border));
        }

        .fc-event {
          cursor: pointer;
        }

        .fc-event:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}
```

### Paso 13.2: Integrar CalendarView en Scheduling

Abre el archivo `client/src/pages/Scheduling.tsx` y realiza los siguientes cambios:

**1. Agregar imports:**

```typescript
import { useState } from "react";
import { CalendarView } from "@/components/CalendarView";
import { Button } from "@/components/ui/button";
import { Calendar, Grid } from "lucide-react";
```

**2. Agregar estado para toggle de vista:**

```typescript
const [viewMode, setViewMode] = useState<"grid" | "calendar">("grid");
```

**3. Agregar botones de toggle antes del contenido principal:**

```typescript
<div className="flex justify-end gap-2 mb-4">
  <Button
    variant={viewMode === "grid" ? "default" : "outline"}
    onClick={() => setViewMode("grid")}
  >
    <Grid className="h-4 w-4 mr-2" />
    Cuadrícula
  </Button>
  <Button
    variant={viewMode === "calendar" ? "default" : "outline"}
    onClick={() => setViewMode("calendar")}
  >
    <Calendar className="h-4 w-4 mr-2" />
    Calendario
  </Button>
</div>
```

**4. Agregar renderizado condicional:**

Busca donde se renderiza la cuadrícula de citas y envuélvela en:

```typescript
{viewMode === "grid" ? (
  // ... código existente de la cuadrícula ...
) : (
  <CalendarView
    events={appointments?.map((apt: any) => ({
      id: apt.id,
      title: `${apt.leadName} - ${apt.reasonName}`,
      start: new Date(apt.scheduledAt),
      end: new Date(new Date(apt.scheduledAt).getTime() + 60 * 60 * 1000), // 1 hour
      backgroundColor: apt.status === "completed" ? "#10b981" : "#3b82f6",
    })) || []}
    onEventClick={(eventId) => {
      // Handle event click
      console.log("Event clicked:", eventId);
    }}
    onDateClick={(date) => {
      // Handle date click - open new appointment form
      console.log("Date clicked:", date);
    }}
    onEventDrop={(eventId, newStart, newEnd) => {
      // Handle event drop - reschedule appointment
      console.log("Event dropped:", eventId, newStart, newEnd);
    }}
  />
)}
```

---

## VERIFICACIÓN DE FASE 11-13

Antes de continuar, verifica:

✅ Archivo `useWebSocket.ts` creado correctamente  
✅ Archivo `GlobalSearch.tsx` creado correctamente  
✅ GlobalSearch integrado en `App.tsx`  
✅ Archivo `CalendarView.tsx` creado correctamente  
✅ CalendarView integrado en `Scheduling.tsx`  
✅ No hay errores de TypeScript al compilar  
✅ Atajo Cmd+K abre búsqueda global

Si todo está correcto, continúa con la Parte 6 de la guía (componentes restantes).

---

**Fin de Parte 5**
