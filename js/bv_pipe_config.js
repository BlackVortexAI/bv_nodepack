// bv_pipe_config.js
import { app } from "../../scripts/app.js";
import { defer, propagateFrom } from "./bv_pipe_shared.js";

app.registerExtension({
  name: "bv_nodepack.bv_pipe_config",
  async nodeCreated(node) {
    if (node.comfyClass !== "BV Pipe Config") return;

    const hook = (w) => {
      const orig = w.callback;
      w.callback = function (v) {
        orig?.call(this, v);
        defer(() => propagateFrom(node));
      };
    };

    node.widgets?.forEach(hook);

    // initial propagate after load
    defer(() => propagateFrom(node));
  },
});
