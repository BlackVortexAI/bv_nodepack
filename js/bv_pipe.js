// bv_pipe.js
import { app } from "../../scripts/app.js";
import {
  defer,
  refreshPipeNodeFromUpstream,
  resolveCfgByPipeLinksNoCache,
  getCfgFromNodeWithFallback,
  updatePipeNodeUI,
} from "./bv_pipe_shared.js";

/**
 * Returns true if the node has NO connections at all.
 * We use this to "collapse" new nodes to only the pipe input/output,
 * but do NOT touch nodes loaded from a workflow that already have links.
 */
function isCompletelyUnconnected(node) {
  // Any input linked?
  const hasInputLinks = (node.inputs || []).some((inp) => inp?.link != null);

  // Any output linked?
  const hasOutputLinks = (node.outputs || []).some((out) => (out?.links?.length || 0) > 0);

  return !hasInputLinks && !hasOutputLinks;
}

app.registerExtension({
  name: "bv_nodepack.bv_pipe",
  async nodeCreated(node) {
    if (node.comfyClass !== "BV Pipe") return;

    // 1) Immediately collapse NEW nodes (no connections) to only show pipe in/out
    //    This runs after the node is created so we can inspect connections safely.
    defer(() => {
      if (isCompletelyUnconnected(node)) {
        // shrink to 0 dynamic slots -> leaves only "pipe" input/output
        updatePipeNodeUI(node, { namesRaw: "", names: [], count: 0 });
      }
    });

    // 2) Initial apply on workflow load:
    //    - If connected, prefer resolving upstream config.
    //    - If disconnected but cached, use fallback.
    defer(async () => {
      const cfg = resolveCfgByPipeLinksNoCache(node) || getCfgFromNodeWithFallback(node);
      if (cfg) updatePipeNodeUI(node, cfg);
    });

    // 3) Refresh on pipe connect
    const orig = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
      orig?.call(this, type, index, connected, link_info);

      // pipe input is index 0
      if (type === 1 && index === 0 && connected) {
        defer(() => refreshPipeNodeFromUpstream(node));
      }
    };
  },
});
