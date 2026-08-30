/**
 * ControlPlane.ai — High-Performance Fuzzy Search Engine
 * 
 * Provides fast, typo-tolerant fuzzy matching, subsequence scoring,
 * acronym expansion, and match range highlighting for system-wide search
 * and audit log filtering.
 */

export interface FuzzyScoreResult {
  matches: boolean;
  score: number;
  matchedIndices: number[];
}

/**
 * Calculates a fuzzy match score between pattern and text.
 * Higher score = closer match. Returns 0 and matches=false if no match.
 */
export function fuzzyScore(pattern: string, text: string): FuzzyScoreResult {
  if (!pattern || !text) {
    return { matches: !pattern, score: !pattern ? 1 : 0, matchedIndices: [] };
  }

  const p = pattern.toLowerCase().trim();
  const t = text.toLowerCase();

  // 1. Exact string match
  if (t === p) {
    const indices = Array.from({ length: text.length }, (_, i) => i);
    return { matches: true, score: 100, matchedIndices: indices };
  }

  // 2. Starts with pattern
  if (t.startsWith(p)) {
    const indices = Array.from({ length: p.length }, (_, i) => i);
    return { matches: true, score: 85 + (p.length / t.length) * 10, matchedIndices: indices };
  }

  // 3. Substring match
  const subIdx = t.indexOf(p);
  if (subIdx !== -1) {
    const indices = Array.from({ length: p.length }, (_, i) => subIdx + i);
    // Bonus if it starts on a word boundary (after space, slash, underscore, hyphen, dot)
    const isWordBoundary = subIdx === 0 || /[\s/_\-.:]/.test(t[subIdx - 1]);
    const score = (isWordBoundary ? 75 : 60) + (p.length / t.length) * 10;
    return { matches: true, score, matchedIndices: indices };
  }

  // 4. Acronym match (e.g., "cs" -> "Customer Support", "pi" -> "Prompt Injection")
  const words = t.split(/[\s/_\-.:]+/).filter(Boolean);
  const acronym = words.map(w => w[0]).join('');
  if (acronym.includes(p)) {
    const acroIdx = acronym.indexOf(p);
    const indices: number[] = [];
    let curWord = 0;
    let curCharInT = 0;
    for (const w of words) {
      if (curWord >= acroIdx && curWord < acroIdx + p.length) {
        const found = t.indexOf(w, curCharInT);
        if (found !== -1) indices.push(found);
      }
      curWord++;
      curCharInT += w.length;
    }
    return { matches: true, score: 68, matchedIndices: indices };
  }

  // 5. Fuzzy Subsequence Search with Proximity Scoring
  let pIdx = 0;
  let tIdx = 0;
  let score = 0;
  let consecutiveMatches = 0;
  let prevMatchIdx = -2;
  const matchedIndices: number[] = [];

  while (pIdx < p.length && tIdx < t.length) {
    if (p[pIdx] === t[tIdx]) {
      matchedIndices.push(tIdx);

      // Word boundary bonus
      const isWordBoundary = tIdx === 0 || /[\s/_\-.:]/.test(t[tIdx - 1]);
      if (isWordBoundary) {
        score += 8;
      }

      // Consecutive character bonus
      if (tIdx === prevMatchIdx + 1) {
        consecutiveMatches++;
        score += 4 * consecutiveMatches;
      } else {
        consecutiveMatches = 0;
        // Distance penalty for scattered matches
        if (prevMatchIdx >= 0) {
          const gap = tIdx - prevMatchIdx;
          score -= Math.min(gap, 6);
        }
      }

      prevMatchIdx = tIdx;
      pIdx++;
      score += 5;
    }
    tIdx++;
  }

  // Check if entire pattern was matched as a subsequence
  if (pIdx === p.length) {
    // Length coverage ratio bonus
    const coverage = p.length / t.length;
    const finalScore = Math.max(20, Math.min(95, score + coverage * 20));
    return { matches: true, score: finalScore, matchedIndices };
  }

  // 6. Typo Tolerance via Levenshtein edit distance for tokens >= 4 chars
  if (p.length >= 4) {
    for (const word of words) {
      if (word.length >= 3 && Math.abs(word.length - p.length) <= 2) {
        const dist = levenshteinDistance(p, word);
        if (dist <= 1 || (p.length >= 6 && dist <= 2)) {
          const wordStart = t.indexOf(word);
          const indices = Array.from({ length: word.length }, (_, i) => wordStart + i);
          const finalScore = 45 - dist * 10;
          return { matches: true, score: finalScore, matchedIndices: indices };
        }
      }
    }
  }

  return { matches: false, score: 0, matchedIndices: [] };
}

/**
 * Standard Levenshtein distance calculation
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

export interface SearchFieldConfig<T> {
  key?: keyof T;
  getter?: (item: T) => string | string[] | number | null | undefined;
  weight?: number; // default 1.0
}

export interface SearchResult<T> {
  item: T;
  score: number;
  matchedField?: string;
  matchedIndices?: number[];
}

/**
 * Multi-field fuzzy search over an array of items.
 * Returns sorted list of matching items with ranking scores.
 */
export function searchCollection<T>(
  collection: T[],
  query: string,
  fieldConfigs: SearchFieldConfig<T>[]
): SearchResult<T>[] {
  const q = query.trim();
  if (!q) {
    return collection.map(item => ({ item, score: 1 }));
  }

  const results: SearchResult<T>[] = [];

  for (const item of collection) {
    let bestScore = 0;
    let bestField: string | undefined;
    let bestIndices: number[] = [];

    for (const config of fieldConfigs) {
      const weight = config.weight ?? 1.0;
      let rawVal: any;

      if (config.getter) {
        rawVal = config.getter(item);
      } else if (config.key) {
        rawVal = item[config.key];
      }

      if (rawVal == null) continue;

      const values = Array.isArray(rawVal) ? rawVal : [rawVal];

      for (const val of values) {
        const text = String(val);
        const res = fuzzyScore(q, text);

        if (res.matches) {
          const weightedScore = res.score * weight;
          if (weightedScore > bestScore) {
            bestScore = weightedScore;
            bestField = String(config.key || 'custom');
            bestIndices = res.matchedIndices;
          }
        }
      }
    }

    if (bestScore > 0) {
      results.push({
        item,
        score: bestScore,
        matchedField: bestField,
        matchedIndices: bestIndices,
      });
    }
  }

  // Sort descending by match score
  return results.sort((a, b) => b.score - a.score);
}

/**
 * Splits text into highlighted / unhighlighted segments for JSX rendering
 */
export function getHighlightSegments(
  text: string,
  matchedIndices: number[]
): Array<{ text: string; isHighlighted: boolean }> {
  if (!matchedIndices || matchedIndices.length === 0 || !text) {
    return [{ text, isHighlighted: false }];
  }

  const indexSet = new Set(matchedIndices);
  const segments: Array<{ text: string; isHighlighted: boolean }> = [];
  let currentSegment = '';
  let currentlyHighlighted = indexSet.has(0);

  for (let i = 0; i < text.length; i++) {
    const isMatch = indexSet.has(i);
    if (isMatch === currentlyHighlighted) {
      currentSegment += text[i];
    } else {
      if (currentSegment) {
        segments.push({ text: currentSegment, isHighlighted: currentlyHighlighted });
      }
      currentSegment = text[i];
      currentlyHighlighted = isMatch;
    }
  }

  if (currentSegment) {
    segments.push({ text: currentSegment, isHighlighted: currentlyHighlighted });
  }

  return segments;
}
