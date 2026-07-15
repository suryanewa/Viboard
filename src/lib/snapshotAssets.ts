const ASSET_REFERENCE_PREFIX = 'viboard-asset://';

export type CompactSnapshot = Record<string, unknown> & {
  version: 2;
  assets: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Moves inline data URLs into one lossless asset table before serialization.
 * Undo snapshots frequently point at the same immutable asset, so this avoids
 * writing the same multi-megabyte string once per history entry.
 */
export const compactSnapshotAssets = (snapshot: Record<string, unknown>): CompactSnapshot => {
  const assets: Record<string, string> = {};
  const assetIds = new Map<string, string>();

  const compact = (value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('data:')) {
      let assetId = assetIds.get(value);
      if (!assetId) {
        assetId = `asset-${assetIds.size + 1}`;
        assetIds.set(value, assetId);
        assets[assetId] = value;
      }
      return `${ASSET_REFERENCE_PREFIX}${assetId}`;
    }

    if (Array.isArray(value)) return value.map(compact);
    if (!isRecord(value)) return value;

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, compact(item)])
    );
  };

  const compacted = compact(snapshot) as Record<string, unknown>;
  return { ...compacted, version: 2, assets } as CompactSnapshot;
};

/** Expands v2 asset references while leaving every v1 board untouched. */
export const expandSnapshotAssets = (value: unknown): unknown => {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.assets)) return value;

  const assets = value.assets;
  const expand = (item: unknown): unknown => {
    if (typeof item === 'string' && item.startsWith(ASSET_REFERENCE_PREFIX)) {
      const assetId = item.slice(ASSET_REFERENCE_PREFIX.length);
      return typeof assets[assetId] === 'string' ? assets[assetId] : item;
    }
    if (Array.isArray(item)) return item.map(expand);
    if (!isRecord(item)) return item;
    return Object.fromEntries(
      Object.entries(item).map(([key, nested]) => [key, expand(nested)])
    );
  };

  return expand(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'assets'))
  );
};
