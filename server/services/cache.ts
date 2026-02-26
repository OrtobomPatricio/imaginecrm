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
