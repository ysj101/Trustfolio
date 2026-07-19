import { describe, expect, it, vi } from 'vitest';
import { createAppContainer } from '../../src/usecase/appContainer';
import { openSheetRepository } from '../../src/repository/SheetRepository';
import { createStubSheetRepository, ok, fail } from '../fakes';

/**
 * DI コンテナ（createAppContainer）の検証。
 *
 * appContainer は composition root であり、仕様の中心は以下の2点である:
 * - スプレッドシート接続（openSheetRepository）成功時に、全ユースケース・サービスが
 *   漏れなく生成されていること（配線漏れの検知）。
 * - 接続失敗時に、そのエラーがそのまま伝播すること。
 *
 * 本テストは openSheetRepository のみをモックし、リポジトリ・サービス・ユースケースの
 * 生成は実物のファクトリを通す。これにより「ファクトリの引数不足・生成漏れ」といった
 * 配線ミスを実配線のまま検知できる（各ファクトリは生成時に I/O を行わないため安全）。
 */
vi.mock('../../src/repository/SheetRepository', () => ({
  openSheetRepository: vi.fn(),
}));

describe('createAppContainer', () => {
  it('シート接続に成功した場合は全ユースケース・サービスが生成される', () => {
    // 前提: スプレッドシートへの接続が成功する
    // 事前条件: openSheetRepository がスタブの SheetRepository を返す
    // 検証: AppContainer が公開する全ユースケース（11種）が
    //   定義されており、代表的なメソッドを持つ（配線漏れがないこと）
    vi.mocked(openSheetRepository).mockReturnValue(ok(createStubSheetRepository()));

    const result = createAppContainer();

    expect(result.success).toBe(true);
    if (result.success) {
      const container = result.value;

      // ユースケース層: 各ユースケースが生成され、公開メソッドを備えている
      expect(typeof container.sheetInitializationUseCase.initializeAllSheets).toBe('function');
      expect(typeof container.fundUseCase.createFund).toBe('function');
      expect(typeof container.navUseCase.getNavHistory).toBe('function');
      expect(typeof container.transactionUseCase.executeSpotPurchase).toBe('function');
      expect(typeof container.holdingUseCase.getHolding).toBe('function');
      expect(typeof container.portfolioUseCase.getPortfolioSummary).toBe('function');
      expect(typeof container.recurringUseCase.executeRecurringPurchases).toBe('function');
      expect(typeof container.navFetchUseCase.fetchAndRegisterAllNavs).toBe('function');
      expect(typeof container.weeklyReportUseCase.generateWeeklyReport).toBe('function');
      expect(typeof container.weeklyReportUseCase.sendReport).toBe('function');
      expect(typeof container.marketIndexFetchUseCase.fetchAndRecordLatestIndices).toBe('function');
      expect(typeof container.marketIndexAlertUseCase.checkAndNotify).toBe('function');

      // メール送信サービスは composition root 内部でユースケースへ注入されるのみで、
      // コンテナの公開プロパティとしては露出しない（H2 #148。router からの直接利用を防ぐ）。
      expect('emailService' in container).toBe(false);
    }
  });

  it('シート接続に失敗した場合はそのエラーをそのまま伝播する', () => {
    // 前提: スプレッドシートへの接続が失敗する（コンテナ未バインド等）
    // 事前条件: openSheetRepository が失敗 Result を返す
    // 検証: コンテナは生成されず、接続失敗のエラー情報（type/message）が保持される
    vi.mocked(openSheetRepository).mockReturnValue(
      fail('unexpected', 'スプレッドシートを開けませんでした。')
    );

    const result = createAppContainer();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe('unexpected');
      expect(result.error.message).toBe('スプレッドシートを開けませんでした。');
    }
  });
});
