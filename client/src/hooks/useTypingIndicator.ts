import { useState, useCallback, useEffect } from "react";
import { useWebSocket } from "./useWebSocket";

interface TypingUser {
    userId: number;
    userName: string;
}

export function useTypingIndicator(conversationId: number | null) {
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const { on, off } = useWebSocket();

    const handleTyping = useCallback((data: { conversationId: number; userId: number; userName: string; isTyping: boolean }) => {
        if (data.conversationId !== conversationId) return;

        setTypingUsers((prev) => {
            if (data.isTyping) {
                if (!prev.find(u => u.userId === data.userId)) {
                    return [...prev, { userId: data.userId, userName: data.userName }];
                }
                return prev;
            } else {
                return prev.filter(u => u.userId !== data.userId);
            }
        });
    }, [conversationId]);

    useEffect(() => {
        on("conversation:typing", handleTyping);
        return () => off("conversation:typing", handleTyping);
    }, [on, off, handleTyping]);

    useEffect(() => {
        // Clear typing users when conversation changes
        setTypingUsers([]);
    }, [conversationId]);

    // Clean stale typing states after 5 seconds just in case we miss a stop-typing event
    useEffect(() => {
        if (typingUsers.length === 0) return;

        const timeout = setTimeout(() => {
            setTypingUsers([]);
        }, 5000);

        return () => clearTimeout(timeout);
    }, [typingUsers]);

    return {
        typingUsers,
        isTyping: typingUsers.length > 0,
        typingText: typingUsers.length > 0
            ? typingUsers.length === 1
                ? `${typingUsers[0].userName} está escribiendo...`
                : "Varias personas están escribiendo..."
            : null
    };
}
