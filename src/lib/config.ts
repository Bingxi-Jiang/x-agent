import path from "node:path";

import type { CredentialStatus, Provider } from "@/lib/types";

export function databasePath(): string {
  return process.env.DATABASE_PATH?.trim() || path.join(process.cwd(), "data", "x-agent.db");
}

export function enabledProviders(settings: { useOpenAI: boolean; useClaude: boolean }): Provider[] {
  const providers: Provider[] = [];
  if (settings.useOpenAI) providers.push("openai");
  if (settings.useClaude) providers.push("claude");
  return providers;
}

export function credentialStatus(): CredentialStatus {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    claude: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    x: Boolean(process.env.X_BEARER_TOKEN?.trim()),
    fixtures: process.env.X_USE_FIXTURES === "true",
  };
}

export function assertProviderCredential(provider: Provider): void {
  const status = credentialStatus();
  if (!status[provider]) {
    const variable = provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    throw new Error(`${variable} is required while ${provider === "openai" ? "OpenAI" : "Claude"} is enabled.`);
  }
}

export function modelName(provider: Provider): string {
  if (provider === "openai") {
    return process.env.OPENAI_MODEL?.trim() || "gpt-5-mini";
  }
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5";
}
