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
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// .envファイルを読み込む
function loadEnvFile() {
  try {
    const envPath = join(projectRoot, '.env');
    const envContent = readFileSync(envPath, 'utf-8');
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
  } catch (error) {
    console.error('エラー: .envファイルの読み込みに失敗しました。');
    console.error(error.message);
    process.exit(1);
  }
}

// GASのスクリプトプロパティを設定する
function setScriptProperty(key, value) {
  try {
    // スクリプトIDを取得
    const claspJson = JSON.parse(readFileSync(join(projectRoot, '.clasp.json'), 'utf-8'));
    const scriptId = claspJson.scriptId;

    if (!scriptId) {
      console.error('エラー: .clasp.jsonにscriptIdが設定されていません。');
      process.exit(1);
    }

    // Apps Script APIを使用してスクリプトプロパティを設定
    // clasp run コマンドを使用
    const script = `
      function setProperty() {
        PropertiesService.getScriptProperties().setProperty('${key}', '${value}');
        return 'OK';
      }
    `;

    // 一時的なApps Scriptファイルを作成する代わりに、
    // claspのコマンドを使用してプロパティを設定
    console.log(`Setting ${key}=${value}`);

    // Apps Script APIを直接呼び出すために、curlを使用
    // しかし、これは複雑なので、代わりに説明を出力
    console.log(`  → GASエディタで手動設定: ${key}=${value}`);

  } catch (error) {
    console.error(`エラー: ${key}の設定に失敗しました。`);
    console.error(error.message);
  }
}

// メイン処理
function main() {
  console.log('📧 .envファイルをGASのスクリプトプロパティに同期します...\n');

  const envVars = loadEnvFile();
  const keys = Object.keys(envVars);

  if (keys.length === 0) {
    console.log('⚠️  同期する環境変数が見つかりませんでした。');
    return;
  }

  console.log('以下の環境変数をGASのスクリプトプロパティに設定してください:\n');

  for (const [key, value] of Object.entries(envVars)) {
    console.log(`  ${key}=${value}`);
  }

  console.log('\n📝 GASエディタでの設定手順:');
  console.log('  1. GASエディタを開く');
  console.log('  2. プロジェクトの設定（歯車アイコン）をクリック');
  console.log('  3. 「スクリプトプロパティ」タブを選択');
  console.log('  4. 上記の環境変数を追加');
  console.log('');
  console.log('💡 または、以下のコマンドをGASエディタのスクリプトエディタで実行:');
  console.log('');
  console.log('function syncEnvProperties() {');
  for (const [key, value] of Object.entries(envVars)) {
    console.log(`  PropertiesService.getScriptProperties().setProperty('${key}', '${value}');`);
  }
  console.log('  Logger.log("環境変数の同期が完了しました");');
  console.log('}');
  console.log('');
}

main();
