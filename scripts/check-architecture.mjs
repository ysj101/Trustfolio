import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

/**
 * このスクリプトは、現行リポジトリで実際に運用しているレイヤー依存だけを fail-fast で検証する。
 * このスクリプトは、旧 eslint-plugin-boundaries の全面代替を目指さない。
 * このスクリプトは、src/domain・src/usecase・src/repository・src/api・src/ui・src/utils の相互依存だけを明示的に判定する。
 */

const repositoryRoot = process.cwd();
const srcRoot = path.join(repositoryRoot, 'src');
const tsconfigPath = path.join(repositoryRoot, 'tsconfig.json');

const layerPatterns = [
  { layer: 'domain', segment: `${path.sep}src${path.sep}domain${path.sep}` },
  { layer: 'usecase', segment: `${path.sep}src${path.sep}usecase${path.sep}` },
  { layer: 'repository', segment: `${path.sep}src${path.sep}repository${path.sep}` },
  { layer: 'api', segment: `${path.sep}src${path.sep}api${path.sep}` },
  { layer: 'ui', segment: `${path.sep}src${path.sep}ui${path.sep}` },
  { layer: 'utils', segment: `${path.sep}src${path.sep}utils${path.sep}` },
];

const allowedDependencies = {
  domain: new Set(['domain', 'utils']),
  usecase: new Set(['usecase', 'domain', 'repository', 'utils']),
  repository: new Set(['repository', 'domain', 'utils']),
  // api（router）は usecase への委譲に限定し、repository への直接依存は禁止する。
  // DI 配線（リポジトリ生成）は composition root（src/usecase/appContainer.ts）へ集約し、
  // ビジネスロジックが usecase をバイパスして router に書かれることを機械的に防ぐ。
  api: new Set(['api', 'usecase', 'domain', 'utils']),
  ui: new Set(['ui', 'api']),
  utils: new Set(['utils']),
};

/**
 * 対象となる TypeScript ファイルを列挙する。
 * この関数は、宣言ファイルを除外し、チェック対象を src 配下に限定する。
 *
 * @param {string} directory 列挙を開始するディレクトリ。
 * @returns {string[]} 検査対象ファイルの絶対パス一覧。
 */
function collectTypeScriptFiles(directory) {
  /** @type {string[]} */
  const files = [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(absolutePath));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!absolutePath.endsWith('.ts') || absolutePath.endsWith('.d.ts')) {
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

/**
 * ファイルパスからレイヤー名を取得する。
 * この関数は、管理対象外のディレクトリを null として扱う。
 *
 * @param {string} filePath 判定対象ファイルの絶対パス。
 * @returns {keyof typeof allowedDependencies | null} レイヤー名。
 */
function detectLayer(filePath) {
  for (const definition of layerPatterns) {
    if (filePath.includes(definition.segment)) {
      return definition.layer;
    }
  }

  return null;
}

/**
 * TypeScript の設定を読み込む。
 * この関数は、モジュール解決を実コードに合わせるため、tsconfig.json の値を必ず使用する。
 *
 * @returns {ts.ParsedCommandLine} 解析済み tsconfig。
 */
function loadTsconfig() {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error !== undefined) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext([configFile.error], {
        getCanonicalFileName: (fileName) => fileName,
        getCurrentDirectory: () => repositoryRoot,
        getNewLine: () => '\n',
      })
    );
  }

  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, repositoryRoot);
}

/**
 * import 文字列を実ファイルへ解決する。
 * この関数は、相対 import と tsconfig に基づく解決だけを対象とする。
 *
 * @param {string} specifier import 文字列。
 * @param {string} containingFile import 元ファイル。
 * @param {ts.CompilerOptions} compilerOptions TypeScript のコンパイラ設定。
 * @returns {string | null} 解決できた絶対パス。解決不能時は null。
 */
function resolveModule(specifier, containingFile, compilerOptions) {
  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys);
  const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
  if (resolvedFileName === undefined) {
    return null;
  }

  return path.normalize(resolvedFileName);
}

/**
 * エラー表示用の位置情報を作る。
 *
 * @param {ts.SourceFile} sourceFile 対象ソースファイル。
 * @param {ts.Node} node 対象ノード。
 * @returns {string} 相対パスと行番号。
 */
function formatLocation(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const relativePath = path.relative(repositoryRoot, sourceFile.fileName);
  return `${relativePath}:${position.line + 1}`;
}

const parsedTsconfig = loadTsconfig();
const sourceFiles = collectTypeScriptFiles(srcRoot);

/** @type {string[]} */
const errors = [];

for (const filePath of sourceFiles) {
  const sourceLayer = detectLayer(filePath);
  if (sourceLayer === null) {
    continue;
  }

  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true);

  ts.forEachChild(sourceFile, (node) => {
    if (
      !ts.isImportDeclaration(node) &&
      !ts.isExportDeclaration(node) &&
      !ts.isImportEqualsDeclaration(node)
    ) {
      return;
    }

    if (ts.isImportEqualsDeclaration(node)) {
      return;
    }

    const specifierText = node.moduleSpecifier?.getText(sourceFile).slice(1, -1) ?? '';
    if (!specifierText.startsWith('.')) {
      return;
    }

    const resolvedPath = resolveModule(specifierText, filePath, parsedTsconfig.options);
    if (resolvedPath === null || !resolvedPath.startsWith(srcRoot)) {
      return;
    }

    const targetLayer = detectLayer(resolvedPath);
    if (targetLayer === null) {
      return;
    }

    if (allowedDependencies[sourceLayer].has(targetLayer)) {
      return;
    }

    errors.push(
      `${formatLocation(sourceFile, node)}(${sourceLayer} から ${targetLayer} への依存は禁止です)`
    );
  });
}

if (errors.length > 0) {
  console.error('レイヤー依存チェックで違反を検出しました。');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('レイヤー依存チェックに成功しました。');
