import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
// typescript@7（ネイティブ実装）は従来の JS コンパイラ API（ts.sys / ts.createSourceFile 等）を
// 同梱しない（提供されるのは明示的に不安定な typescript/unstable/* のみ）。
// 本スクリプトが必要とする安定 API のため、typescript@6 系をエイリアス
// devDependency「typescript-js-api」として併存させて利用する。
// 詳細は docs/UPGRADE_STRATEGY.md の
// 「TypeScript 7（ネイティブ実装）と JS API の併存の記録」セクションを参照。
import ts from 'typescript-js-api';

/**
 * このスクリプトは、旧 ESLint 設定で実際に重要だった TypeScript 固有制約を fail-fast で検証する。
 * このスクリプトは、リポジトリの現状を基準にし、src 配下の本番コードだけを対象とする。
 * このスクリプトは、formatter や一般 lint が扱わない設計制約を明示的に落とすために存在する。
 */

const repositoryRoot = process.cwd();
const srcRoot = path.join(repositoryRoot, 'src');
const tsconfigPath = path.join(repositoryRoot, 'tsconfig.json');

const camelCasePattern = /^[a-z][a-zA-Z0-9]*$/u;
const upperCasePattern = /^[A-Z][A-Z0-9_]*$/u;
const pascalCasePattern = /^[A-Z][a-zA-Z0-9]*$/u;

/**
 * 対象となる TypeScript ファイルを列挙する。
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
 * tsconfig.json を読み込む。
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
 * ノード位置を `path:line` 形式へ変換する。
 *
 * @param {ts.SourceFile} sourceFile 位置情報の元となるソースファイル。
 * @param {ts.Node} node 対象ノード。
 * @returns {string} 相対パスと行番号。
 */
function formatLocation(sourceFile, node) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const relativePath = path.relative(repositoryRoot, sourceFile.fileName);
  return `${relativePath}:${position.line + 1}`;
}

/**
 * 識別子名が camelCase / UPPER_CASE のどちらかを満たすか判定する。
 *
 * @param {string} name 識別子名。
 * @returns {boolean} 許可される形式なら true。
 */
function isCamelOrUpperCase(name) {
  return camelCasePattern.test(name) || upperCasePattern.test(name);
}

/**
 * 条件式に使用して良い型かを判定する。
 * この関数は、boolean と nullable boolean だけを許可する。
 *
 * @param {ts.TypeChecker} checker 型チェッカー。
 * @param {ts.Type} type 判定対象の型。
 * @returns {boolean} 許可される型なら true。
 */
function isAllowedConditionType(checker, type) {
  if (type.isUnion()) {
    return type.types.every((unionType) => isAllowedConditionType(checker, unionType));
  }

  if (type.isIntersection()) {
    return type.types.every((intersectionType) =>
      isAllowedConditionType(checker, intersectionType)
    );
  }

  if ((type.flags & ts.TypeFlags.BooleanLike) !== 0) {
    return true;
  }

  if ((type.flags & ts.TypeFlags.Undefined) !== 0) {
    return true;
  }

  if ((type.flags & ts.TypeFlags.Null) !== 0) {
    return true;
  }

  if ((type.flags & ts.TypeFlags.Never) !== 0) {
    return true;
  }

  if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
    const baseConstraint = checker.getBaseConstraintOfType(type);
    if (baseConstraint !== undefined) {
      return isAllowedConditionType(checker, baseConstraint);
    }
  }

  return false;
}

/**
 * 関数宣言に明示的な戻り値型があるか判定する。
 *
 * @param {ts.FunctionDeclaration} node 判定対象。
 * @returns {boolean} 戻り値型があれば true。
 */
function hasExplicitReturnType(node) {
  return node.type !== undefined;
}

/**
 * 型ノードから括弧（{@link ts.ParenthesizedTypeNode}）を再帰的に剥がす。
 *
 * TypeScript では `failure as (Result<Foo>)` や `<(Result<Foo>)>failure` のように
 * 型注釈を括弧で囲む構文が有効であり、この場合キャスト式の `node.type` は
 * `TypeReferenceNode` ではなく括弧でラップされた `ParenthesizedTypeNode` になる。
 * 括弧を剥がさずに型名を判定すると、括弧で囲んだだけの迂回でキャスト禁止ルールを
 * すり抜けられてしまうため、本ヘルパーで内側の型ノードまで降りてから判定する。
 *
 * @param {ts.TypeNode} typeNode 判定対象の型ノード。
 * @returns {ts.TypeNode} 括弧を全て剥がした内側の型ノード。
 */
function unwrapParenthesizedType(typeNode) {
  let current = typeNode;
  while (ts.isParenthesizedTypeNode(current)) {
    current = current.type;
  }
  return current;
}

/**
 * 型ノードが `Result<...>`（修飾なしの型参照）かを判定する。
 * 括弧を剥がしたうえで、型名が単純識別子 `Result` であるかを確認する。
 *
 * @param {ts.TypeNode} typeNode 判定対象の型ノード。
 * @returns {boolean} `Result` 型への参照なら true。
 */
function isResultTypeReference(typeNode) {
  const unwrapped = unwrapParenthesizedType(typeNode);
  return (
    ts.isTypeReferenceNode(unwrapped) &&
    ts.isIdentifier(unwrapped.typeName) &&
    unwrapped.typeName.text === 'Result'
  );
}

const parsedTsconfig = loadTsconfig();
const sourceFiles = collectTypeScriptFiles(srcRoot);
const program = ts.createProgram(sourceFiles, parsedTsconfig.options);
const checker = program.getTypeChecker();

/** @type {string[]} */
const errors = [];

for (const sourceFile of program.getSourceFiles()) {
  if (!sourceFile.fileName.startsWith(srcRoot)) {
    continue;
  }

  if (sourceFile.isDeclarationFile) {
    continue;
  }

  /**
   * ノードを再帰的に検査する。
   *
   * @param {ts.Node} node 検査対象ノード。
   */
  function visit(node) {
    if (ts.isEnumDeclaration(node)) {
      errors.push(
        `${formatLocation(sourceFile, node)}(enum は禁止です。as const を使用してください)`
      );
    }

    if (ts.isClassDeclaration(node)) {
      errors.push(
        `${formatLocation(sourceFile, node)}(class は禁止です。関数とオブジェクトを使用してください)`
      );
    }

    if (ts.isThrowStatement(node)) {
      errors.push(
        `${formatLocation(sourceFile, node)}(throw 文は禁止です。Result 型を使用してください)`
      );
    }

    if (ts.isTryStatement(node)) {
      const normalizedPath = path.normalize(sourceFile.fileName);
      const isServiceLayer = normalizedPath.includes(`${path.sep}src${path.sep}service${path.sep}`);
      if (!isServiceLayer) {
        errors.push(
          `${formatLocation(sourceFile, node)}(try/catch は腐敗防止層である src/service 配下でのみ許可します)`
        );
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name !== undefined && !hasExplicitReturnType(node)) {
      errors.push(
        `${formatLocation(sourceFile, node.name)}(関数宣言には明示的な戻り値型が必要です)`
      );
    }

    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) {
      if (!pascalCasePattern.test(node.name.text)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(型名は PascalCase で定義してください: ${node.name.text})`
        );
      }
    }

    if (ts.isTypeParameterDeclaration(node)) {
      if (!pascalCasePattern.test(node.name.text)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(型パラメータ名は PascalCase で定義してください: ${node.name.text})`
        );
      }
    }

    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      const parameterName = node.name.text;
      const normalizedName = parameterName.startsWith('_') ? parameterName.slice(1) : parameterName;
      if (normalizedName !== '' && !camelCasePattern.test(normalizedName)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(引数名は camelCase で定義してください: ${parameterName})`
        );
      }
    }

    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      const variableName = node.name.text;
      const normalizedName = variableName.startsWith('_') ? variableName.slice(1) : variableName;
      if (normalizedName !== '' && !isCamelOrUpperCase(normalizedName)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(変数名は camelCase または UPPER_CASE で定義してください: ${variableName})`
        );
      }
    }

    if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
      if (!camelCasePattern.test(node.name.text)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(関数名は camelCase で定義してください: ${node.name.text})`
        );
      }
    }

    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name)) {
      const propertyName = node.name.text;
      if (!isCamelOrUpperCase(propertyName)) {
        errors.push(
          `${formatLocation(sourceFile, node.name)}(オブジェクトプロパティ名は camelCase または UPPER_CASE で定義してください: ${propertyName})`
        );
      }
    }

    if (ts.isTypeNode(node) && node.kind === ts.SyntaxKind.AnyKeyword) {
      errors.push(`${formatLocation(sourceFile, node)}(explicit any は禁止です)`);
    }

    // Result 型への強制キャストを禁止する。
    // Result の失敗ブランチは型パラメータに依存しないため、エラー伝播時にこの
    // キャストが多用されていたが、本来のエラー型変更ミスをコンパイラが検出できなくなる。
    // 失敗の付け替えには src/domain/result.ts の propagateFailure を使用すること。
    // `as Result<...>`（AsExpression）と `<Result<...>>expr`（TypeAssertionExpression）の
    // 両構文を対象とし、さらに `as (Result<...>)` のような括弧付きの迂回も
    // isResultTypeReference 経由で剥がして検出する。
    // 補足: `<Result<...>>expr` の山括弧記法は TSX では JSX と構文衝突しコンパイル不可だが、
    // 本プロジェクトは GAS 向けの .ts のみ（TSX 不使用）のため両構文を対象として問題ない。
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      if (isResultTypeReference(node.type)) {
        errors.push(
          `${formatLocation(sourceFile, node)}(Result 型への強制キャスト（as Result<...> / <Result<...>>）は禁止です。propagateFailure を使用してください)`
        );
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'require'
    ) {
      errors.push(`${formatLocation(sourceFile, node.expression)}(require の使用は禁止です)`);
    }

    if (
      ts.isIfStatement(node) ||
      ts.isWhileStatement(node) ||
      ts.isDoStatement(node) ||
      ts.isForStatement(node)
    ) {
      const condition = node.condition;
      if (condition !== undefined) {
        const conditionType = checker.getTypeAtLocation(condition);
        if (!isAllowedConditionType(checker, conditionType)) {
          errors.push(
            `${formatLocation(sourceFile, condition)}(条件式は boolean または nullable boolean にしてください)`
          );
        }
      }
    }

    if (ts.isConditionalExpression(node)) {
      const conditionType = checker.getTypeAtLocation(node.condition);
      if (!isAllowedConditionType(checker, conditionType)) {
        errors.push(
          `${formatLocation(sourceFile, node.condition)}(三項演算子の条件式は boolean または nullable boolean にしてください)`
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (errors.length > 0) {
  console.error('TypeScript ルールチェックで違反を検出しました。');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('TypeScript ルールチェックに成功しました。');
