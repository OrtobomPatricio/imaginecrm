import { validateEnvironment } from "../_core/env-validation";

const originalNodeEnv = process.env.NODE_ENV;

try {
  process.env.NODE_ENV = "production";
  validateEnvironment();
  console.log("[ProdConfig] OK: production configuration validation passed");
} catch (error) {
  console.error("[ProdConfig] FAILED: production configuration is invalid");
  throw error;
} finally {
  process.env.NODE_ENV = originalNodeEnv;
}
