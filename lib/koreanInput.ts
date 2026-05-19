/**
 * 영문 자판(두벌식)으로 입력된 문자열을 한글 자모로 변환 후
 * 완성형 한글 문자열로 조합합니다.
 * 예: "dkQk" → "아빠", "dkssud" → "아이유"
 */

const EN_TO_JAMO: Record<string, string> = {
  q:'ㅂ', w:'ㅈ', e:'ㄷ', r:'ㄱ', t:'ㅅ',
  y:'ㅛ', u:'ㅕ', i:'ㅑ', o:'ㅐ', p:'ㅔ',
  a:'ㅁ', s:'ㄴ', d:'ㅇ', f:'ㄹ', g:'ㅎ',
  h:'ㅗ', j:'ㅓ', k:'ㅏ', l:'ㅣ',
  z:'ㅋ', x:'ㅌ', c:'ㅊ', v:'ㅍ', b:'ㅠ', n:'ㅜ', m:'ㅡ',
  // 쌍자음/이중모음 (shift)
  Q:'ㅃ', W:'ㅉ', E:'ㄸ', R:'ㄲ', T:'ㅆ', O:'ㅒ', P:'ㅖ',
};

// 초성 목록 (인덱스 = 초성 코드)
const CHOSEONG = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
// 중성 목록
const JUNGSEONG = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
// 종성 목록 (0 = 없음)
const JONGSEONG = ['','ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

// 종성 → 초성 변환 가능 목록
const JONG_TO_CHO: Record<string, string> = {
  'ㄱ':'ㄱ','ㄲ':'ㄲ','ㄴ':'ㄴ','ㄷ':'ㄷ','ㄹ':'ㄹ','ㅁ':'ㅁ',
  'ㅂ':'ㅂ','ㅅ':'ㅅ','ㅆ':'ㅆ','ㅇ':'ㅇ','ㅈ':'ㅈ','ㅊ':'ㅊ',
  'ㅋ':'ㅋ','ㅌ':'ㅌ','ㅍ':'ㅍ','ㅎ':'ㅎ',
};

function isMoeum(j: string) { return JUNGSEONG.includes(j); }
function isJaeum(j: string) { return CHOSEONG.includes(j); }
function choIdx(j: string) { return CHOSEONG.indexOf(j); }
function jungIdx(j: string) { return JUNGSEONG.indexOf(j); }
function jongIdx(j: string) { return JONGSEONG.indexOf(j); }

function compose(cho: string, jung: string, jong = ''): string {
  const c = choIdx(cho), v = jungIdx(jung), f = jongIdx(jong);
  if (c < 0 || v < 0 || f < 0) return cho + jung + jong;
  return String.fromCharCode(0xAC00 + c * 21 * 28 + v * 28 + f);
}

/**
 * 일반 대문자(Caps Lock)는 소문자로 정규화하되,
 * 쌍자음·이중모음 shift 키(Q W E R T O P)는 원본 유지
 * 예: "DKQK" → "dkQk" → "아빠"
 *     "DKqK" → "dkqk" → "아바" (q=ㅂ, Q=ㅃ 구분)
 */
function normalizeInput(s: string): string {
  const SHIFT_KEYS = new Set(['Q','W','E','R','T','O','P']);
  return s.split('').map(c =>
    c >= 'A' && c <= 'Z' && !SHIFT_KEYS.has(c) ? c.toLowerCase() : c
  ).join('');
}

/** 영문 자판 입력 → 한글 완성형 변환 */
export function engToKorean(input: string): string {
  input = normalizeInput(input);
  // 1. 각 문자를 자모로 변환
  const jamos: string[] = [];
  for (const ch of input) {
    jamos.push(EN_TO_JAMO[ch] ?? ch);
  }

  // 2. 자모 → 음절 조합 (간단한 오토마타)
  let result = '';
  let i = 0;

  while (i < jamos.length) {
    const cur = jamos[i];

    // 자음
    if (isJaeum(cur)) {
      const next = jamos[i + 1];
      if (next && isMoeum(next)) {
        // 초성 + 중성
        const afterNext = jamos[i + 2];
        if (afterNext && isJaeum(afterNext)) {
          const afterAfterNext = jamos[i + 3];
          if (afterAfterNext && isMoeum(afterAfterNext)) {
            // (초성+중성) + (초성+중성...) → 종성 없음
            result += compose(cur, next);
            i += 2;
          } else {
            // 초성+중성+종성
            result += compose(cur, next, afterNext);
            i += 3;
          }
        } else {
          result += compose(cur, next);
          i += 2;
        }
      } else {
        result += cur;
        i++;
      }
    } else {
      result += cur;
      i++;
    }
  }

  return result;
}

/** 한글 완성형 → 자모 분해 (검색 대상 분해용) */
export function decomposeKorean(text: string): string {
  let result = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const offset = code - 0xAC00;
      const cho = Math.floor(offset / 588);
      const jung = Math.floor((offset % 588) / 28);
      const jong = offset % 28;
      result += CHOSEONG[cho] + JUNGSEONG[jung] + (jong ? JONGSEONG[jong] : '');
    } else {
      result += ch;
    }
  }
  return result;
}

/** 검색어가 영문 자판 입력인지 추정 (대소문자 원본 기준) */
export function looksLikeEngInput(s: string): boolean {
  return /^[a-zA-Z]+$/.test(s) && s.split('').some(c => EN_TO_JAMO[c] !== undefined);
}
