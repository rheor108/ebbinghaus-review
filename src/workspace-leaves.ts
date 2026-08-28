export interface DetachableWorkspaceLeaf {
  detach(): void;
}

export function keepSingleWorkspaceLeaf<T extends DetachableWorkspaceLeaf>(
  leaves: readonly T[],
  preferredLeaf?: T | null,
): T | undefined {
  const primary = preferredLeaf && leaves.includes(preferredLeaf)
    ? preferredLeaf
    : leaves[0];

  if (!primary) return undefined;

  for (const leaf of leaves) {
    if (leaf !== primary) leaf.detach();
  }

  return primary;
}
