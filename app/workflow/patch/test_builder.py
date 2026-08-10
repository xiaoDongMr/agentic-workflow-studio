from __future__ import annotations

import unittest

from app.schemas.workflow import WorkflowDocument
from app.workflow.patch.builder import apply_workflow_patch, build_workflow_patch


class WorkflowPatchTest(unittest.TestCase):
    def test_add_node_normalizes_defaults_and_adds_edge(self) -> None:
        workflow = WorkflowDocument(id="workflow-1", name="Test", nodes=[], edges=[])
        start_patch = build_workflow_patch(
            [
                {
                    "op": "add_node",
                    "node": {
                        "id": "start",
                        "type": "start",
                        "title": "开始",
                        "outputs": [
                            {
                                "name": "query",
                                "type": "String",
                                "description": "查询",
                            }
                        ],
                    },
                }
            ],
            1,
        )
        with_start = apply_workflow_patch(workflow, start_patch)
        self.assertEqual(with_start.nodes[0].config.outputKey, "query")

        llm_patch = build_workflow_patch(
            [
                {
                    "op": "add_node",
                    "node": {
                        "id": "answer",
                        "type": "llm",
                        "title": "回答",
                        "config": {
                            "outputKey": "answer",
                            "inputMappings": [
                                {
                                    "field": "input",
                                    "sourceType": "node",
                                    "source": "start.query",
                                }
                            ],
                        },
                    },
                },
                {
                    "op": "add_edge",
                    "edge": {"source": "start", "target": "answer"},
                },
            ],
            2,
        )
        result = apply_workflow_patch(with_start, llm_patch)
        self.assertEqual([node.id for node in result.nodes], ["start", "answer"])
        self.assertEqual(result.nodes[1].outputs[1].name, "answer")
        self.assertEqual(result.edges[0].id, "edge-start-answer")

    def test_add_edge_rejects_missing_target(self) -> None:
        workflow = WorkflowDocument(id="workflow-1", name="Test", nodes=[], edges=[])
        patch = build_workflow_patch(
            [
                {
                    "op": "add_edge",
                    "edge": {"source": "missing", "target": "also-missing"},
                }
            ],
            1,
        )
        with self.assertRaisesRegex(ValueError, "edge source does not exist"):
            apply_workflow_patch(workflow, patch)

    def test_update_metadata_preserves_graph(self) -> None:
        workflow = WorkflowDocument(
            id="workflow-1",
            name="Old name",
            description="Old description",
            nodes=[],
            edges=[],
        )
        patch = build_workflow_patch(
            [
                {
                    "op": "update_metadata",
                    "name": "New name",
                    "description": "New description",
                }
            ],
            1,
        )

        result = apply_workflow_patch(workflow, patch)

        self.assertEqual(result.name, "New name")
        self.assertEqual(result.description, "New description")
        self.assertEqual(result.nodes, workflow.nodes)
        self.assertEqual(result.edges, workflow.edges)


if __name__ == "__main__":
    unittest.main()
