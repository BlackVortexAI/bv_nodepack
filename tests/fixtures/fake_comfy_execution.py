import sys
from types import ModuleType


class DynamicPrompt:
    def __init__(self, prompt):
        self.prompt = prompt

    def get_node(self, node_id):
        return self.prompt[str(node_id)]


class ExecutionBlocker:
    def __init__(self, value):
        self.value = value


def is_link(value):
    return isinstance(value, (tuple, list)) and len(value) == 2 and isinstance(value[0], str)


class _GraphNode:
    def __init__(self, graph, node_id, class_type, inputs):
        self.graph = graph
        self.node_id = node_id
        self.class_type = class_type
        self.inputs = dict(inputs)

    def out(self, index):
        return [self.node_id, index]

    def set_input(self, key, value):
        self.inputs[key] = value

    def set_override_display_id(self, _node_id):
        return None


class GraphBuilder:
    def __init__(self):
        self.nodes = {}
        self.next_id = 1

    def node(self, class_type, node_id=None, **inputs):
        node_id = str(node_id or self.next_id)
        self.next_id += 1
        node = _GraphNode(self, node_id, class_type, inputs)
        self.nodes[node_id] = node
        return node

    def lookup_node(self, node_id):
        return self.nodes[str(node_id)]

    def finalize(self):
        return {
            node_id: {"class_type": node.class_type, "inputs": node.inputs}
            for node_id, node in self.nodes.items()
        }


def install():
    package = ModuleType("comfy_execution")
    package.__path__ = []
    graph = ModuleType("comfy_execution.graph")
    graph.DynamicPrompt = DynamicPrompt
    graph_utils = ModuleType("comfy_execution.graph_utils")
    graph_utils.DynamicPrompt = DynamicPrompt
    graph_utils.ExecutionBlocker = ExecutionBlocker
    graph_utils.GraphBuilder = GraphBuilder
    graph_utils.is_link = is_link
    package.graph = graph
    package.graph_utils = graph_utils
    sys.modules["comfy_execution"] = package
    sys.modules["comfy_execution.graph"] = graph
    sys.modules["comfy_execution.graph_utils"] = graph_utils
