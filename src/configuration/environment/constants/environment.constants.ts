export const ENVIRONMENT_CONSTANTS = {
  ROOT: "envs",
  BASE_FILE: ".env",
  SECRET_KEY_VAR_PREFIX: "SECRET_KEY",
} as const;

export const ENVIRONMENT_STAGES = ["dev", "qa", "uat", "preprod", "prod"] as const;

export type EnvironmentStage = (typeof ENVIRONMENT_STAGES)[number];
