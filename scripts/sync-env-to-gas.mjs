#!/usr/bin/env node

/**
 * .envファイルの内容をGASのスクリプトプロパティに同期するスクリプト。
 *
 * 使用方法:
 *   pnpm sync:env
 *
 * 注意:
 * - claspでログイン済みである必要があります
 * - .envファイルが存在する必要があります
 * - GAS_SCRIPT_IDは除外されます（claspの設定ファイルで管理されるため）
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// .envファイルを読み込む
export function parseEnvContent(envContent) {
  const envVars = {};
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    // コメント行と空行をスキップ
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue;
    }

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }

    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();

    // GAS_SCRIPT_IDは除外（claspの設定で管理されるため）
    if (key === 'GAS_SCRIPT_ID') {
      continue;
    }

    envVars[key] = value;
  }

  return envVars;
}

function loadEnvFile(readFile = readFileSync, envPath = join(projectRoot, '.env')) {
  try {
    const envContent = readFile(envPath, 'utf-8');
    return parseEnvContent(envContent);
  } catch (error) {
    console.error('エラー: .envファイルの読み込みに失敗しました。');
    console.error(error.message);
    process.exit(1);
  }
}

// メイン処理
export function main({ loadEnv = loadEnvFile, logger = console } = {}) {
  logger.log('📧 .envファイルをGASのスクリプトプロパティに同期します...\n');

  const envVars = loadEnv();
  const keys = Object.keys(envVars);

  if (keys.length === 0) {
    logger.log('⚠️  同期する環境変数が見つかりませんでした。');
    return;
  }

  logger.log('以下の環境変数をGASのスクリプトプロパティに設定してください:\n');

  for (const [key, value] of Object.entries(envVars)) {
    logger.log(`  ${key}=${value}`);
  }

  logger.log('\n📝 GASエディタでの設定手順:');
  logger.log('  1. GASエディタを開く');
  logger.log('  2. プロジェクトの設定（歯車アイコン）をクリック');
  logger.log('  3. 「スクリプトプロパティ」タブを選択');
  logger.log('  4. 上記の環境変数を追加');
  logger.log('');
  logger.log('💡 または、以下のコマンドをGASエディタのスクリプトエディタで実行:');
  logger.log('');
  logger.log('function syncEnvProperties() {');
  for (const [key, value] of Object.entries(envVars)) {
    logger.log(`  PropertiesService.getScriptProperties().setProperty('${key}', '${value}');`);
  }
  logger.log('  Logger.log("環境変数の同期が完了しました");');
  logger.log('}');
  logger.log('');
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main();
}
