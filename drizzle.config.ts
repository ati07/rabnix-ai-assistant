import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next.js, so load env explicitly (.env.local first).
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // pgvector is provided by the `vector` extension.
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
