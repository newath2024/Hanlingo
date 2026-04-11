export const COMMON_VOCAB_CONFUSION_PAIRS = [
  ["먹다", "마시다"],
  ["어디", "누구"],
  ["어디", "언제"],
  ["누구", "무엇"],
  ["정류장", "역"],
  ["역", "터미널"],
  ["가다", "오다"],
  ["멀다", "가깝다"],
  ["있다", "없다"],
  ["집", "방"],
  ["친구", "가족"],
  ["세제", "휴지"],
] as const;

export const PARTICLE_CONFUSION_GROUPS = [
  ["은", "는"],
  ["이", "가"],
  ["을", "를"],
  ["에", "에서"],
  ["와", "과"],
  ["도", "만"],
  ["으로", "로"],
] as const;

export const TENSE_POLITENESS_ENDING_GROUPS = [
  ["아요", "어요", "여요"],
  ["습니다", "ㅂ니다"],
  ["습니까", "ㅂ니까"],
  ["었어요", "았어요", "했어요"],
  ["으십시오", "십시오"],
  ["고요", "아요", "어요"],
  ["아야 돼요", "어야 돼요", "여야 돼요"],
] as const;

export const SIMILAR_SOUNDING_PAIRS = [
  ["집들이", "집주인"],
  ["정류장", "주차장"],
  ["세제", "제지"],
  ["휴지", "유지"],
  ["어디", "오디"],
  ["누구", "구구"],
] as const;

function toPairLookup(pairs: readonly (readonly [string, string])[]) {
  const lookup = new Map<string, Set<string>>();

  for (const [left, right] of pairs) {
    const existingLeft = lookup.get(left) ?? new Set<string>();
    existingLeft.add(right);
    lookup.set(left, existingLeft);

    const existingRight = lookup.get(right) ?? new Set<string>();
    existingRight.add(left);
    lookup.set(right, existingRight);
  }

  return lookup;
}

export const VOCAB_CONFUSION_LOOKUP = toPairLookup(COMMON_VOCAB_CONFUSION_PAIRS);
export const PARTICLE_CONFUSION_LOOKUP = toPairLookup(PARTICLE_CONFUSION_GROUPS);
export const SIMILAR_SOUNDING_LOOKUP = toPairLookup(SIMILAR_SOUNDING_PAIRS);
