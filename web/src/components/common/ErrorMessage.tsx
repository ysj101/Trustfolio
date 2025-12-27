/**
 * エラーメッセージコンポーネント
 */

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorMessage({ message, onRetry }: Props) {
  return (
    <div className="bg-red-50 border border-red-200 rounded p-4">
      <p className="text-red-700">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 text-red-600 underline hover:text-red-800"
        >
          再試行
        </button>
      )}
    </div>
  );
}
