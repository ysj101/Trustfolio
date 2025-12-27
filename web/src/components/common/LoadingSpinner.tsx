/**
 * ローディングスピナーコンポーネント
 */

export function LoadingSpinner() {
  return (
    <div className="flex justify-center items-center p-4">
      <div className="animate-spin h-8 w-8 border-4 border-blue-500 rounded-full border-t-transparent" />
    </div>
  );
}
