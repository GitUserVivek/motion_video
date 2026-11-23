import type { MatchedAsset } from './asset.library.js';

/**
 * Deterministic verification that an attached file represents the concept it is
 * assigned to. Downloaded artwork must name at least one scene key term; local
 * library artwork may be accepted by its icon/label match, but a backdrop or a
 * generic downloaded icon is rejected. This runs without a model, so it works
 * offline and is cheap enough for every tile.
 */
export interface AssetVerdict {
  accepted: boolean;
  reason: string;
  matchedTerms: string[];
}

const GENERIC_TOKENS = new Set([
  'icon', 'icons', 'image', 'images', 'img', 'picture', 'photo', 'clipart',
  'vector', 'flat', 'line', 'outline', 'color', 'colour', 'solid', 'filled',
  'asset', 'assets', 'resource', 'resources', 'download', 'downloaded', 'auto',
  'background', 'backgrounds', 'backdrop', 'backdrops',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function wordVariants(token: string): string[] {
  if (token.endsWith('ies') && token.length > 4) return [token, `${token.slice(0, -3)}y`];
  if (token.endsWith('ing') && token.length > 5) {
    const stem = token.slice(0, -3);
    return [token, stem, `${stem}e`];
  }
  if (token.endsWith('ed') && token.length > 5) {
    const stem = token.slice(0, -2);
    return [token, stem, `${stem}e`];
  }
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) {
    return [token, token.slice(0, -1)];
  }
  return [token, `${token}s`];
}

function hasToken(tokens: Set<string>, token: string): boolean {
  return wordVariants(token).some((variant) => tokens.has(variant));
}

export function verifyAssetMatch(
  match: MatchedAsset,
  keyTerms: string[],
): AssetVerdict {
  const keyTokens = new Set(keyTerms.flatMap(tokenize));
  const assetTokens = new Set(match.tokens.flatMap(tokenize));

  const path = match.id.toLowerCase();
  if (path.includes('/background') || path.startsWith('background') || path.includes('backdrop')) {
    return { accepted: false, reason: 'Backdrop images cannot be used as scene artwork.', matchedTerms: [] };
  }

  if (keyTokens.size === 0) {
    // Older storyboards may have no analysis key terms. A hand-placed library
    // asset that matched its icon/label can still be used; a downloaded file
    // cannot be justified without a concept to verify it against.
    if (match.id.startsWith('auto/')) {
      return {
        accepted: false,
        reason: 'Downloaded asset cannot be verified without scene key terms.',
        matchedTerms: [],
      };
    }
    return {
      accepted: true,
      reason: 'No scene key terms; library asset accepted on icon/label match.',
      matchedTerms: [],
    };
  }

  const matchedTerms = [...keyTokens].filter((token) => hasToken(assetTokens, token));
  if (matchedTerms.length === 0) {
    return {
      accepted: false,
      reason: `Asset tokens (${[...assetTokens].slice(0, 8).join(', ')}) do not name any key term (${[...keyTokens].join(', ')}).`,
      matchedTerms: [],
    };
  }

  // A downloaded file that only carries generic pack words is not evidence that
  // it depicts the concept.
  const specific = match.tokens.filter((token) => !GENERIC_TOKENS.has(token));
  if (match.id.startsWith('auto/') && specific.length === 0) {
    return {
      accepted: false,
      reason: 'Downloaded file has no concept-specific tokens.',
      matchedTerms,
    };
  }

  return {
    accepted: true,
    reason: `Matches scene term(s): ${matchedTerms.join(', ')}`,
    matchedTerms,
  };
}
