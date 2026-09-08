// Automatic content layout may grow a node, but must preserve its chosen width.
// The presentation bridge also preserves explicit user height when available.
export function resizeNodeToContent(node) {
  const size = node?.computeSize?.();
  if (!size) return;
  const next = [Math.max(Number(node.size?.[0] ?? 0), Number(size[0])), Number(size[1])];
  const bridge = globalThis.__bvNodePresentationBridge;
  if (bridge?.setAutomaticSize) bridge.setAutomaticSize(node, next);
  else node.setSize?.(next);
  return next;
}
