const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULIDを生成する。
 * 1ミリ秒内での衝突回避は乱数に依存するため、強い一意性が必要な場合は用途を再検討すること。
 */
export function generateUlid(): string {
  const time = Date.now();
  return encodeTime(time, 10) + encodeRandom(16);
}

function encodeTime(time: number, length: number): string {
  let value = time;
  let result = '';

  for (let i = 0; i < length; i += 1) {
    const mod = value % 32;
    result = CROCKFORD_BASE32.charAt(mod) + result;
    value = Math.floor(value / 32);
  }

  return result;
}

function encodeRandom(length: number): string {
  let result = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * 32);
    result += CROCKFORD_BASE32.charAt(randomIndex);
  }

  return result;
}
