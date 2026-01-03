/* eslint-disable @typescript-eslint/naming-convention */
declare global {
  const Utilities: {
    formatDate: (date: Date, timeZone: string, format: string) => string;
  };
  const PropertiesService: {
    getScriptProperties: () => { getProperty: (key: string) => string | null };
  };
  const MailApp: {
    sendEmail: (options: { to: string; subject: string; htmlBody?: string; body?: string }) => void;
  };
  const UrlFetchApp: {
    fetch: (url: string, options?: unknown) => unknown;
  };
  const SpreadsheetApp: {
    getActiveSpreadsheet: () => unknown;
    getUi: () => { alert: (message: string) => void };
  };
  const HtmlService: {
    createTemplateFromFile: (name: string) => { evaluate: () => unknown };
    createHtmlOutputFromFile: (name: string) => { getContent: () => string };
  };
  const ContentService: {
    createTextOutput: (text: string) => { setMimeType: (mimeType: string) => unknown };
    MimeType: { JSON: string };
  };
  const ScriptApp: {
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
  const Logger: {
    log: (message: string) => void;
  };
}

export {};
