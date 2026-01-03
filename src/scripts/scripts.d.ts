declare module '../../scripts/nav-fetch-test.mjs' {
  export type NavData = { date: string; value: number };
  export type FetchNavResult = {
    fundId: string;
    url: string;
    statusCode: number | null;
    nav: NavData | null;
    success: boolean;
    error: string | null;
  };
  export function parseNavFromRakutenHtml(html: string): NavData | null;
  export function fetchNav(
    fundId: string,
    fetchFn?: (
      url: string,
      init?: RequestInit
    ) => Promise<{ status: number; text: () => Promise<string> }>
  ): Promise<FetchNavResult>;
  export function run(): Promise<void>;
}

declare module '../../scripts/rakuten-integration-test.mjs' {
  export type NavData = { date: string; value: number };
  export function parseNavFromRakutenHtml(html: string): NavData | null;
  export function run(
    fetchFn?: (
      url: string,
      init?: RequestInit
    ) => Promise<{ status: number; text: () => Promise<string> }>
  ): Promise<void>;
}

declare module '../../scripts/sync-env-to-gas.mjs' {
  export function parseEnvContent(content: string): Record<string, string>;
  export function main(options?: {
    loadEnv?: () => Record<string, string>;
    logger?: { log: (message: string) => void };
  }): void;
}
