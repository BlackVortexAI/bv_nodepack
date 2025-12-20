// bv_pipe.js
import { app } from "../../scripts/app.js";
import {
  defer,
  refreshPipeNodeFromUpstream,
  resolveCfgByPipeLinksNoCache,
  getCfgFromNodeWithFallback,
  updatePipeNodeUI,
} from "./bv_pipe_shared.js";

app.registerExtension({
  name: "bv_nodepack.bv_pipe",
  async nodeCreated(node) {
    if (node.comfyClass !== "BV Pipe") return;

    // Apply config (or collapse if none) on creation
    defer(() => {
      const cfg = resolveCfgByPipeLinksNoCache(node) || getCfgFromNodeWithFallback(node);
      if (cfg) updatePipeNodeUI(node, cfg);
      else updatePipeNodeUI(node, { namesRaw: "", names: [], count: 0 });
    });

    // Refresh on any connection changes on this node
    const orig = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
      orig?.call(this, type, index, connected, link_info);
      defer(() => refreshPipeNodeFromUpstream(node));
    };
  },
});
