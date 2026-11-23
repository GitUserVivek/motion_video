/**
 * Pure matching rules for user-uploaded artwork.
 *
 * The renderer inlines artwork as data URLs, so a user's image is only useful
 * when it is attached to a scene whose narration, brief, or key terms it can
 * actually explain. These functions are deliberately deterministic and have no
 * filesystem/database dependencies so they can be unit tested cheaply.
 */

export interface UserAssetMatchInfo {
  id: string;
  fileName: string;
  caption?: string | null;
  keywords?: string[];
  label?: string | null;
}

export interface UserAssetMatchContext {
  text: string;
  brief?: string;
  keyTerms: string[];
  label?: string;
}

const GENERIC_TOKENS = new Set([
  'image', 'images', 'photo', 'photos', 'picture', 'pictures', 'img', 'dsc',
  'screenshot', 'screenshots', 'upload', 'uploaded', 'final', 'copy', 'new',
  'edited', 'graphic', 'graphics', 'illustration', 'illustrations', 'vector',
  'clipart', 'asset', 'assets', 'file', 'files', 'png', 'jpg', 'jpeg', 'webp',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'these', 'those',
  'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'is', 'are', 'be', 'it',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !GENERIC_TOKENS.has(token));
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

function assetTokens(asset: UserAssetMatchInfo): Set<string> {
  return new Set(
    tokenize([
      asset.fileName,
      asset.label ?? '',
      asset.caption ?? '',
      ...(asset.keywords ?? []),
    ].join(' ')),
  );
}

/**
 * A user image is only eligible when it shares a concrete key term or at least
 * two meaningful scene words. That prevents a generic upload from being forced
 * into every scene just because it is available.
 */
export function scoreUserAsset(
  asset: UserAssetMatchInfo,
  context: UserAssetMatchContext,
): number {
  const assetWords = assetTokens(asset);
  if (assetWords.size === 0) return 0;

  let score = 0;
  const keyTerms = context.keyTerms.map((term) => term.toLowerCase());
  for (const term of keyTerms) {
    for (const token of tokenize(term)) {
      if (hasToken(assetWords, token)) score += 3;
    }
  }

  const contextWords = new Set(tokenize(`${context.text} ${context.brief ?? ''} ${context.label ?? ''}`));
  let shared = 0;
  for (const word of contextWords) {
    if (hasToken(assetWords, word)) shared++;
  }
  score += Math.min(4, shared);

  // A label such as "cube" is stronger than an incidental narration word.
  if (context.label) {
    const labelWords = tokenize(context.label);
    if (labelWords.some((word) => hasToken(assetWords, word))) score += 2;
  }

  return score;
}

export function pickUserAsset<T extends UserAssetMatchInfo>(
  assets: T[],
  context: UserAssetMatchContext,
  used: Set<string>,
): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const asset of assets) {
    if (used.has(asset.id)) continue;
    const score = scoreUserAsset(asset, context);
    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }
  // A single generic overlap (for example "diagram") is not enough. Require a
  // key-term hit or two meaningful shared words.
  return best && bestScore >= 3 ? best : null;
}

export function userAssetKeywordList(
  caption: string | null | undefined,
  keywords: string[] | undefined,
): string[] {
  return [...new Set([
    ...(keywords ?? []).map((keyword) => keyword.trim()).filter(Boolean),
    ...tokenize(caption ?? ''),
  ])].slice(0, 16);
}
