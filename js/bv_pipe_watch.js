// bv_pipe_watch.js
import { app } from "../../scripts/app.js";
import { defer, refreshPipeNodeFromUpstream } from "./bv_pipe_shared.js";

function getAllNodes(graph) {
  return graph?._nodes || graph?.nodes || [];
}

function installGraphWatcher(graph) {
  if (!graph || graph.__bv_pipe_watch_installed) return;
  graph.__bv_pipe_watch_installed = true;

  let scheduled = false;

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;

    defer(() => {
      scheduled = false;

      // refresh all BV Pipe nodes in this graph
      for (const n of getAllNodes(graph)) {
        if (n?.comfyClass === "BV Pipe") {
          refreshPipeNodeFromUpstream(n);
        }
      }
    });
  };

  const origAfter = graph.onAfterChange;
  graph.onAfterChange = function (...args) {
    try { origAfter?.apply(this, args); } catch (e) {}
    schedule();
  };

  const origChange = graph.onChange;
  graph.onChange = function (...args) {
    try { origChange?.apply(this, args); } catch (e) {}
    schedule();
  };

  // run once
  schedule();
}

app.registerExtension({
  name: "bv_nodepack.bv_pipe_watch",
  async setup() {
    installGraphWatcher(app.graph);

    // `app.graph` changes when entering/leaving subgraphs -> hook the active graph too
    let lastGraph = app.graph;

    setInterval(() => {
      const g = app.graph;
      if (!g) return;

      if (g !== lastGraph) {
        lastGraph = g;
        installGraphWatcher(g);

        // immediate refresh when switching graphs
        defer(() => {
          for (const n of getAllNodes(g)) {
            if (n?.comfyClass === "BV Pipe") {
              refreshPipeNodeFromUpstream(n);
            }
          }
        });
      } else {
        installGraphWatcher(g);
      }
    }, 500);
  },
});
