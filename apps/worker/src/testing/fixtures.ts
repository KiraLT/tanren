import type { EnvVars } from "../Env"

/** Plain-var fixture shared by the Node and workerd app tests. */
export const envVars: EnvVars = {
  ENVIRONMENT: "local",
  BETTER_AUTH_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-secret-0000000000000000000000000000",
  ALLOWED_ORIGINS: "http://localhost:8081",
  EMAIL_MODE: "console",
  EMAIL_FROM: "Tanren <dev@tanren.local>",
}
