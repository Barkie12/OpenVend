import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  APP_SECRET: z
    .string()
    .min(16, "APP_SECRET must be at least 16 characters; generate one with `openssl rand -base64 32`"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATA_DIR: z.string().default("./data"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/** Validated process environment. Parsed lazily so importing modules never throws at build time. */
export function env(): Env {
  if (cachedEnv === null) {
    cachedEnv = envSchema.parse(process.env);
  }
  return cachedEnv;
}
