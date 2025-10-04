export type NewRelicBrowserAgentConfig = {
  applicationId: string;
  licenseKey: string;
  loaderScriptUrl: string;
  accountId?: string | undefined;
  trustKey?: string | undefined;
  agentId?: string | undefined;
  xpid?: string | undefined;
  beacon?: string | undefined;
  errorBeacon?: string | undefined;
  init?: Record<string, unknown> | undefined;
};

export type BrowserVendorInitConfig = {
  apiKey: string;
  service: string;
  url?: string;
  consoleCapture?: boolean;
  debug?: boolean;
  newRelic?: NewRelicBrowserAgentConfig;
};

export type BrowserTelemetryAdapter = {
  init: (config: BrowserVendorInitConfig) => Promise<void> | void;
  addAction: (event: string, attributes?: Record<string, unknown>) => void;
  recordException: (error: unknown, attributes?: Record<string, unknown>) => void;
  setGlobalAttributes?: (attributes: Record<string, string>) => void;
  getSessionUrl?: () => string | undefined;
};

export type BrowserVendorLoader = () => Promise<BrowserTelemetryAdapter>;
