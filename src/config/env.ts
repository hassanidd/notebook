import { z } from "zod";

const envSchema = z.object({
  VITE_NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  VITE_BACKEND_URL: z.string().default("/api"),
});

export const env = envSchema.parse(import.meta.env);
