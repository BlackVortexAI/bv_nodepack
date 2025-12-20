// bv_pipe_config.js
import { app } from "../../scripts/app.js";
import { defer, propagateFrom, refreshAllPipesEverywhere } from "./bv_pipe_shared.js";

app.registerExtension({
  name: "bv_nodepack.bv_pipe_config",
  async nodeCreated(node) {
    if (node.comfyClass !== "BV Pipe Config") return;

    const runGlobal = () => {
      // propagate in same graph + refresh everywhere (subgraphs included)
      propagateFrom(node);
      refreshAllPipesEverywhere(app.graph);
    };

    // 1) Widget edit (names)
    const namesW = node.widgets?.find((w) => w.name === "names");
    if (namesW) {
      const orig = namesW.callback;
      namesW.callback = function (v) {
        orig?.call(this, v);
        defer(runGlobal);
      };
    }

    // 2) IMPORTANT: connection changes (when you connect a different config)
    const origConn = node.onConnectionsChange;
    node.onConnectionsChange = function (type, index, connected, link_info) {
      origConn?.call(this, type, index, connected, link_info);
      defer(runGlobal);
    };

    // initial
    defer(runGlobal);
  },
});
