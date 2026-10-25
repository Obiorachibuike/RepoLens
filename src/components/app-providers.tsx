"use client";

import * as React from "react";
import { ThemeProvider } from "./theme-provider";
import { SavedProvider } from "./saved/saved-provider";
import { HistoryProvider } from "./history/history-provider";

export interface AppConfig {
  github: { authenticated: boolean };
  database: boolean;
  ai: boolean;
  codeSearch: boolean;
}

const ConfigContext = React.createContext<AppConfig>({
  github: { authenticated: false },
  database: false,
  ai: false,
  codeSearch: false,
});

export function AppProviders({
  config,
  children,
}: {
  config: AppConfig;
  children: React.ReactNode;
}) {
  return (
    <ConfigContext.Provider value={config}>
      <ThemeProvider>
        <SavedProvider databaseConfigured={config.database}>
          <HistoryProvider databaseConfigured={config.database}>{children}</HistoryProvider>
        </SavedProvider>
      </ThemeProvider>
    </ConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfig {
  return React.useContext(ConfigContext);
}
