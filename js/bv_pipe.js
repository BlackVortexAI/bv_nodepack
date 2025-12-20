// bv_pipe.js
import { app } from "../../scripts/app.js";
import {
  defer,
  refreshPipeNodeFromUpstream,
  resolveCfgByPipeLinksNoCache,
  getCfgFromNodeWithFallback,
  updatePipeNodeUI,
} from "./bv_pipe_shared.js";

function hasAnyRealConfig(node) {
  const cfg = resolveCfgByPipeLinksNoCache(node) || getCfgFromNodeWithFallback(node);
  return !!cfg && (cfg.count ?? 0) > 0;
}

app.registerExtension({
  name: "bv_nodepack.bv_pipe",
  async nodeCreated(node) {
    if (node.comfyClass !== "BV Pipe") return;

    // Collapse if we cannot resolve a config (important for subgraphs where pipe is connected to a bridge)
    defer(() => {
      const cfg = resolveCfgByPipeLinksNoCache(node) || getCfgFromNodeWithFallback(node);

      if (!cfg) {
        // no cfg resolved yet -> collapse to only pipe in/out
        updatePipeNodeUI(node, { namesRaw: "", names: [], count: 0 });
      } else {
        updatePipeNodeUI(node, cfg);
      }
    });

    // refresh on pipe connect / changes (still useful outside subgraphs)
    const orig = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
      orig?.call(this, type, index, connected, link_info);

      // pipe input is index 0
      if (type === 1 && index === 0) {
        defer(() => refreshPipeNodeFromUpstream(node));
      }
    };
  },
});
