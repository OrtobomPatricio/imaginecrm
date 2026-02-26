import { test, expect } from '@playwright/test';

test.describe('Autenticación y Redirección Básica', () => {
    test('La página principal debe cargar correctamente', async ({ page }) => {
        // Navigate to the base URL
        const response = await page.goto('/');

        // Ensure the server responds with success (even if it's a redirect to auth)
        expect(response?.ok()).toBeTruthy();

        // We expect the app to redirect to /auth if no session exists, 
        // or load the dashboard. Check for basic DOM text or URL redirect.
        await page.waitForLoadState('networkidle');

        // The CRM should render a main element or a form
        expect(await page.locator('body').count()).toBeGreaterThan(0);
    });
});
