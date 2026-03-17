import { vi } from 'vitest';

type ScriptProperties = {
  getProperty: (key: string) => string | null;
};

type ScriptPropertiesService = {
  getScriptProperties: () => ScriptProperties;
};

const globalAny = globalThis as typeof globalThis & {
  Utilities?: {
    formatDate: (date: Date, timeZone: string, format: string) => string;
  };
  PropertiesService?: ScriptPropertiesService;
  MailApp?: {
    sendEmail: (options: { to: string; subject: string; htmlBody?: string; body?: string }) => void;
  };
  UrlFetchApp?: {
    fetch: (url: string, options?: unknown) => unknown;
  };
  SpreadsheetApp?: {
    getActiveSpreadsheet: () => unknown;
    getUi: () => unknown;
  };
  HtmlService?: {
    createTemplateFromFile: (name: string) => { evaluate: () => unknown };
    createHtmlOutputFromFile: (name: string) => { getContent: () => string };
  };
  ContentService?: {
    createTextOutput: (text: string) => { setMimeType: (mimeType: string) => unknown };
    MimeType: { JSON: string };
  };
  ScriptApp?: {
    getProjectTriggers: () => unknown[];
    deleteTrigger: (trigger: unknown) => void;
    newTrigger: (name: string) => {
      timeBased: () => {
        everyDays: (days: number) => { atHour: (hour: number) => { create: () => void } };
        onWeekDay: (day: unknown) => { atHour: (hour: number) => { create: () => void } };
        atHour: (hour: number) => { nearMinute: (minute: number) => { create: () => void } };
      };
    };
    WeekDay: { SATURDAY: unknown };
  };
  Logger?: { log: (message: string) => void };
  console?: Console;
};

globalAny.Utilities = {
  formatDate: vi.fn(() => '2024-01-01 09:00:00'),
};

globalAny.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: vi.fn(() => null),
  }),
};

globalAny.MailApp = {
  sendEmail: vi.fn(),
};

globalAny.UrlFetchApp = {
  fetch: vi.fn(() => {
    throw new Error('UrlFetchApp.fetchはテストで明示的にスタブしてください。');
  }),
};

globalAny.SpreadsheetApp = {
  getActiveSpreadsheet: vi.fn(() => {
    throw new Error('SpreadsheetApp.getActiveSpreadsheetはテストで明示的にスタブしてください。');
  }),
  getUi: vi.fn(() => {
    throw new Error('SpreadsheetApp.getUiはテストで明示的にスタブしてください。');
  }),
};

globalAny.HtmlService = {
  createTemplateFromFile: vi.fn(() => ({
    evaluate: vi.fn(() => ({ setTitle: vi.fn() })),
  })),
  createHtmlOutputFromFile: vi.fn(() => ({ getContent: vi.fn(() => '<div></div>') })),
};

globalAny.ContentService = {
  createTextOutput: vi.fn((text: string) => ({
    setMimeType: vi.fn(() => ({ text })),
  })),
  MimeType: { JSON: 'application/json' },
};

globalAny.ScriptApp = {
  getProjectTriggers: vi.fn(() => []),
  deleteTrigger: vi.fn(),
  newTrigger: vi.fn(() => ({
    timeBased: () => ({
      everyDays: () => ({
        atHour: () => ({
          create: vi.fn(),
          nearMinute: () => ({ create: vi.fn() }),
        }),
      }),
      onWeekDay: () => ({ atHour: () => ({ create: vi.fn() }) }),
      atHour: () => ({ nearMinute: () => ({ create: vi.fn() }) }),
    }),
  })),
  WeekDay: { SATURDAY: Symbol('SATURDAY') },
};

globalAny.Logger = {
  log: vi.fn(),
};
