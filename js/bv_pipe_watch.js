// bv_pipe_watch.js
import { app } from "../../scripts/app.js";
import { defer, refreshAllPipesEverywhere, isGraphLike } from "./bv_pipe_shared.js";

app.registerExtension({
  name: "bv_nodepack.bv_pipe_watch",
  async setup() {
    const lastVer = new WeakMap();
    let lastGraph = null;

    setInterval(() => {
      const g = app.graph;
      if (!g) return;

      // On graph switch (enter/exit subgraph) do a global refresh once
      if (g !== lastGraph) {
        lastGraph = g;
        defer(() => refreshAllPipesEverywhere(g));
      }

      // Detect link changes even if onChange hooks are not reliable
      const v = typeof g._version === "number" ? g._version : null;
      const prev = lastVer.get(g);

      if (v != null && prev !== v) {
        lastVer.set(g, v);
        defer(() => refreshAllPipesEverywhere(g));
      } else if (v == null && prev == null) {
        // fallback if _version not present
        lastVer.set(g, 1);
        defer(() => refreshAllPipesEverywhere(g));
      }

      // Optional: if some builds store a root pointer, refresh that too
      const root = g?._root;
      if (root && isGraphLike(root)) {
        const vr = typeof root._version === "number" ? root._version : null;
        const pr = lastVer.get(root);
        if (vr != null && pr !== vr) {
          lastVer.set(root, vr);
          defer(() => refreshAllPipesEverywhere(root));
        }
      }
    }, 250);
  },
});
