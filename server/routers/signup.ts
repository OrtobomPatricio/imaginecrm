import { z } from "zod";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { tenants, users, appSettings, termsAcceptance } from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure, router } from "../_core/trpc";
import { sdk } from "../_core/sdk";
import { getSessionCookieOptions } from "../_core/cookies";
import { getClientIp } from "../services/security";
import { authRateLimit, clearRateLimit } from "../_core/trpc-rate-limit";
import { logger } from "../_core/logger";

/**
 * Signup Router
 * 
 * Handles public registration of new companies/tenants.
 * Creates a new tenant, owner user, default settings, and logs them in.
 */

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{2,48}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
    "www", "app", "api", "admin", "superadmin", "platform", "system",
    "support", "help", "billing", "mail", "ftp", "ssh", "test",
    "staging", "dev", "demo", "status", "docs", "blog", "cdn",
]);

/**
 * Default permissions matrix for new tenants (same as server/_core/trpc.ts)
 */
const DEFAULT_PERMISSIONS_MATRIX: Record<string, string[]> = {
    owner: ["*"],
    admin: [
        "dashboard.*", "leads.*", "kanban.*", "campaigns.*", "chat.*",
        "helpdesk.*", "scheduling.*", "monitoring.*", "analytics.*",
        "reports.*", "integrations.*", "settings.*", "users.*", "backups.*",
    ],
    supervisor: [
        "dashboard.view", "leads.view", "leads.update", "leads.create",
        "kanban.view", "kanban.update", "chat.*", "helpdesk.*",
        "monitoring.*", "analytics.view", "reports.view", "scheduling.view",
    ],
    agent: [
        "dashboard.view", "leads.view", "leads.create", "leads.update",
        "leads.edit", "kanban.view", "kanban.update", "chat.view",
        "chat.send", "helpdesk.view", "scheduling.*",
    ],
    viewer: [
        "dashboard.view", "leads.view", "kanban.view",
        "analytics.view", "reports.view", "helpdesk.view",
    ],
};

export const signupRouter = router({
    /**
     * Check if a slug is available for registration
     */
    checkSlug: publicProcedure
        .input(z.object({ slug: z.string().min(3).max(50) }))
        .query(async ({ input }) => {
            const slug = input.slug.toLowerCase().trim();

            if (!SLUG_REGEX.test(slug)) {
                return { available: false, reason: "El slug solo puede contener letras minúsculas, números y guiones." };
            }

            if (RESERVED_SLUGS.has(slug)) {
                return { available: false, reason: "Este nombre está reservado." };
            }

            const db = await getDb();
            if (!db) return { available: false, reason: "Error de base de datos." };

            const existing = await db.select({ id: tenants.id })
                .from(tenants)
                .where(eq(tenants.slug, slug))
                .limit(1);

            if (existing.length > 0) {
                return { available: false, reason: "Este nombre ya está en uso." };
            }

            return { available: true, reason: null };
        }),

    /**
     * Register a new company (tenant) with an owner account.
     * This is the main public signup endpoint.
     */
    register: publicProcedure
        .input(z.object({
            companyName: z.string().min(2).max(200),
            slug: z.string().min(3).max(50),
            ownerName: z.string().min(2).max(100),
            email: z.string().email(),
            password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
            timezone: z.string().default("America/Asuncion"),
            language: z.string().default("es"),
            currency: z.string().default("USD"),
            termsVersion: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
            const db = await getDb();
            if (!db) throw new Error("Database not available");

            // Rate limiting
            const ip = getClientIp(ctx.req);
            const rateLimitKey = `signup:${ip}`;
            try {
                await authRateLimit(rateLimitKey);
            } catch (e: any) {
                return { success: false, error: e.message };
            }

            // Validate slug
            const slug = input.slug.toLowerCase().trim();
            if (!SLUG_REGEX.test(slug)) {
                return { success: false, error: "Slug inválido. Solo letras minúsculas, números y guiones." };
            }
            if (RESERVED_SLUGS.has(slug)) {
                return { success: false, error: "Este nombre está reservado." };
            }

            // Check slug uniqueness
            const existingTenant = await db.select({ id: tenants.id })
                .from(tenants)
                .where(eq(tenants.slug, slug))
                .limit(1);
            if (existingTenant.length > 0) {
                return { success: false, error: "Este nombre de empresa ya está registrado." };
            }

            // Check email uniqueness globally (prevent duplicate owners)
            const existingUser = await db.select({ id: users.id })
                .from(users)
                .where(eq(users.email, input.email))
                .limit(1);
            if (existingUser.length > 0) {
                return { success: false, error: "Este email ya está registrado. Inicia sesión o usa otro email." };
            }

            // Hash password
            const hashedPassword = await bcrypt.hash(input.password, 12);
            const openId = nanoid(32);

            try {
                // Use transaction for atomicity
                let tenantId: number = 0;
                let userId: number = 0;

                await db.transaction(async (tx) => {
                    // 1. Create tenant
                    const tenantResult = await tx.insert(tenants).values({
                        name: input.companyName,
                        slug,
                        plan: "free",
                        status: "active",
                    });
                    tenantId = tenantResult[0].insertId;

                    // 2. Create owner user
                    const userResult = await tx.insert(users).values({
                        tenantId,
                        openId,
                        name: input.ownerName,
                        email: input.email,
                        password: hashedPassword,
                        loginMethod: "credentials",
                        role: "owner",
                        isActive: true,
                        hasSeenTour: false,
                    });
                    userId = userResult[0].insertId;

                    // 3. Create default app settings
                    await tx.insert(appSettings).values({
                        tenantId,
                        companyName: input.companyName,
                        timezone: input.timezone,
                        language: input.language,
                        currency: input.currency,
                        permissionsMatrix: DEFAULT_PERMISSIONS_MATRIX,
                        scheduling: { slotMinutes: 15, maxPerSlot: 6, allowCustomTime: true },
                    });

                    // 4. Record terms acceptance if provided
                    if (input.termsVersion) {
                        await tx.insert(termsAcceptance).values({
                            tenantId,
                            userId,
                            termsVersion: input.termsVersion,
                            ipAddress: ip,
                            userAgent: ctx.req.headers["user-agent"] as string,
                        });
                    }
                });

                logger.info(
                    { tenantId, userId, slug, email: input.email },
                    "[Signup] New tenant registered successfully"
                );

                // Clear rate limit after successful registration
                clearRateLimit(rateLimitKey, 'auth');

                // Auto-login: create session token
                const sessionToken = await sdk.createSessionToken(openId, {
                    name: input.ownerName,
                    expiresInMs: ONE_YEAR_MS,
                    ipAddress: ip,
                    userAgent: ctx.req.headers["user-agent"] as string,
                });

                const cookieOptions = getSessionCookieOptions(ctx.req);
                ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

                return {
                    success: true,
                    tenantId,
                    slug,
                    message: "Empresa registrada exitosamente. Bienvenido a Imagine CRM.",
                };
            } catch (error: any) {
                logger.error({ err: error, slug, email: input.email }, "[Signup] Registration failed");

                if (error.code === "ER_DUP_ENTRY") {
                    return { success: false, error: "Este nombre de empresa o email ya está en uso." };
                }

                return { success: false, error: "Error al crear la cuenta. Intenta nuevamente." };
            }
        }),
});
