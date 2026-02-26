import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import { logger } from '../_core/logger';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL;

// We only initialize Queues if Redis is provided
export const redisConnection = redisUrl ? new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
}) : null;

// ==========================================
// 1. Queue Definitions
// ==========================================
export const followupQueue = redisConnection ? new Queue('followup-tasks', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 1000 // Keep last 1000 failed jobs
    }
}) : null;

export const messageOutboundQueue = redisConnection ? new Queue('message-outbound', {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
    }
}) : null;

export const aiSuggestionsQueue = redisConnection ? new Queue('ai-suggestions', {
    connection: redisConnection,
}) : null;

// ==========================================
// 2. Queue Events (Monitoring)
// ==========================================
if (redisConnection) {
    const followupEvents = new QueueEvents('followup-tasks', { connection: redisConnection });
    followupEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error({ jobId, failedReason }, '[BullMQ] Followup Job Failed');
    });

    const messageEvents = new QueueEvents('message-outbound', { connection: redisConnection });
    messageEvents.on('failed', ({ jobId, failedReason }) => {
        logger.error({ jobId, failedReason }, '[BullMQ] Message Outbound Job Failed');
    });
}

// ==========================================
// 3. Worker Implementations
// ==========================================

/**
 * Initializes workers that consume the queues.
 * In a real Enterprise setup, you might run these in a completely separate Node process,
 * but for this Monolith-capable clustering, we run them here if Redis is active.
 */
export function startWorkers() {
    if (!redisConnection) {
        logger.warn('[BullMQ] REDIS_URL not set. Background Workers will NOT start.');
        return;
    }

    logger.info('[BullMQ] Starting Background Workers...');

    // Worker 1: Follow Up Engine
    const followupWorker = new Worker('followup-tasks', async (job: Job) => {
        // We dynamically import the engine to prevent circular dependencies at startup
        const { followupEngine } = await import('./followup-engine');

        if (job.name === 'evaluate-rules') {
            logger.info('[Worker] Running Follow-up Engine Cycle via BullMQ');
            // Instead of Cron Interval, the Engine triggers via Job
            await followupEngine.executeManualCycle();
            return { status: 'completed' };
        }
    }, { connection: redisConnection, concurrency: 1 });

    // Worker 2: Outbound Messages Dispatcher
    const messageWorker = new Worker('message-outbound', async (job: Job) => {
        const { tenantId, conversationId, messageId, content, externalId } = job.data;
        logger.info({ messageId, conversationId }, '[Worker] Dispatching Outbound Message');

        // Simulate HTTP Baileys/Meta API Request
        // await baileysService.sendMessage(...)

        // Example failure point for retries
        if (Math.random() < 0.05) throw new Error("Simulated Meta API Network Error");

        return { delivered: true, timestamp: Date.now() };
    }, { connection: redisConnection, concurrency: 5 });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        logger.info('[BullMQ] Closing workers gracefully...');
        await followupWorker.close();
        await messageWorker.close();
    });
}

/**
 * Helper to dispatch Follow-up evaluations periodically using BullMQ repeatable jobs.
 * Replaces our old setInterval.
 */
export async function scheduleFollowupCron() {
    if (!followupQueue) return;

    // Add a repeatable job: run every 5 minutes
    await followupQueue.add('evaluate-rules', {}, {
        repeat: {
            pattern: '*/5 * * * *', // Cron format
        },
        jobId: 'system-followup-cron' // ensure uniqueness
    });
    logger.info('[BullMQ] Scheduled Followup Engine Cron via Redis');
}
