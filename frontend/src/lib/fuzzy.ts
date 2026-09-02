/**
 * ControlPlane.ai — High-Performance Instant Fuzzy Search Engine
 * 
 * Provides fast, typo-tolerant token matching, subsequence scoring,
 * acronym expansion, and multi-field keyword search with match highlighting
 * for real-time audit log and system telemetry filtering.
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
    return { matches: true, score: 90 + (p.length / t.length) * 10, matchedIndices: indices };
  }

  // 3. Substring match (collect all occurrences)
  const subIdx = t.indexOf(p);
  if (subIdx !== -1) {
    const indices: number[] = [];
    let startPos = 0;
    while (true) {
      const idx = t.indexOf(p, startPos);
      if (idx === -1) break;
      for (let i = 0; i < p.length; i++) indices.push(idx + i);
      startPos = idx + p.length;
    }
    const isWordBoundary = subIdx === 0 || /[\s/_\-.:,[\]\"'()]/.test(t[subIdx - 1]);
    const score = (isWordBoundary ? 80 : 65) + (p.length / t.length) * 10;
    return { matches: true, score, matchedIndices: indices };
  }

  // 4. Word-prefix match
  const words = t.split(/[\s/_\-.:,[\]\"'()]+/).filter(Boolean);
  for (const word of words) {
    if (word.startsWith(p)) {
      const wordStart = t.indexOf(word);
      const indices = Array.from({ length: p.length }, (_, i) => wordStart + i);
      return { matches: true, score: 75 + (p.length / word.length) * 10, matchedIndices: indices };
    }
  }

  // 5. Acronym match (e.g. "cs" -> "Customer Support", "pi" -> "Prompt Injection")
  const acronym = words.map(w => w[0]).join('');
  if (p.length >= 2 && acronym.includes(p)) {
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
    return { matches: true, score: 70, matchedIndices: indices };
  }

  // 6. Proximity-Constrained Subsequence Match within individual words (for typos & abbreviations >= 4 chars)
  if (p.length >= 4) {
    for (const word of words) {
      if (word.length < p.length) continue;
      let pIdx = 0;
      let wIdx = 0;
      const wordMatchedIndices: number[] = [];

      while (pIdx < p.length && wIdx < word.length) {
        if (p[pIdx] === word[wIdx]) {
          wordMatchedIndices.push(wIdx);
          pIdx++;
        }
        wIdx++;
      }

      if (pIdx === p.length) {
        const span = wordMatchedIndices[wordMatchedIndices.length - 1] - wordMatchedIndices[0] + 1;
        if (span <= p.length + 2) {
          const wordStart = t.indexOf(word);
          const globalIndices = wordMatchedIndices.map(idx => wordStart + idx);
          const score = Math.max(30, Math.min(80, 50 + (p.length / span) * 20));
          return { matches: true, score, matchedIndices: globalIndices };
        }
      }
    }
  }

  return { matches: false, score: 0, matchedIndices: [] };
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
 * Multi-field tokenized fuzzy search over an array of items.
 * Returns sorted list of matching items with ranking scores and highlight indices.
 */
export function searchCollection<T>(
  collection: T[],
  query: string,
  fieldConfigs: SearchFieldConfig<T>[]
): SearchResult<T>[] {
  const q = query.trim();
  if (!q) {
    return collection.map(item => ({ item, score: 1, matchedIndices: [] }));
  }

  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return collection.map(item => ({ item, score: 1, matchedIndices: [] }));
  }

  const results: SearchResult<T>[] = [];

  for (const item of collection) {
    let totalScore = 0;
    let allTokensMatched = true;
    const combinedMatchedIndices: number[] = [];
    let topMatchedField: string | undefined;

    for (const tok of tokens) {
      let tokenBestScore = 0;
      let tokenBestField: string | undefined;
      let tokenBestIndices: number[] = [];

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
          const res = fuzzyScore(tok, text);

          if (res.matches) {
            const weightedScore = res.score * weight;
            if (weightedScore > tokenBestScore) {
              tokenBestScore = weightedScore;
              tokenBestField = String(config.key || 'custom');
              tokenBestIndices = res.matchedIndices;
            }
          }
        }
      }

      if (tokenBestScore > 0) {
        totalScore += tokenBestScore;
        if (!topMatchedField) topMatchedField = tokenBestField;
        combinedMatchedIndices.push(...tokenBestIndices);
      } else {
        allTokensMatched = false;
        break;
      }
    }

    if (allTokensMatched && totalScore > 0) {
      results.push({
        item,
        score: totalScore,
        matchedField: topMatchedField,
        matchedIndices: Array.from(new Set(combinedMatchedIndices)),
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
