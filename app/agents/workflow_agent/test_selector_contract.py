from __future__ import annotations

import unittest

from app.schemas.workflow import WorkflowEdge, WorkflowNode
from app.workflow.engine.routing import make_selector_router
from app.workflow.nodes.capabilities import normalize_node_payload
from app.workflow.nodes.selector import SelectorNodeExecutor
from app.workflow.services.input_mapping import build_node_input


def _selector_node() -> WorkflowNode:
    return WorkflowNode.model_validate(
        {
            "id": "selector-1",
            "title": "选择器节点",
            "type": "selector",
            "inputs": [
                {
                    "name": "start.input",
                    "type": "String",
                    "description": "兼容旧节点输入声明",
                }
            ],
            "outputs": [],
            "config": {
                "inputMappings": [
                    {
                        "field": "start.input",
                        "sourceType": "context",
                        "source": "start.input",
                        "valueType": "String",
                    }
                ],
                "outputKey": "branch",
                "selectorElseBranch": "else",
                "selectorBranches": [
                    {
                        "id": "selector_branch_1",
                        "label": "命中",
                        "conditions": [
                            {
                                "id": "selector_condition_1_1",
                                "operator": "equals",
                                "left": {
                                    "sourceType": "node",
                                    "source": "start.input",
                                    "nodeId": "start",
                                    "fieldPath": "input",
                                    "displayLabel": "开始节点.input",
                                    "valueType": "String",
                                },
                                "right": {
                                    "sourceType": "literal",
                                    "source": "input",
                                    "literalValue": "input",
                                    "valueType": "String",
                                },
                            }
                        ],
                    }
                ],
            },
        }
    )


def _end_node(node_id: str, title: str) -> WorkflowNode:
    return WorkflowNode.model_validate(
        {
            "id": node_id,
            "title": title,
            "type": "end",
            "config": {},
        }
    )


class SelectorContractTest(unittest.IsolatedAsyncioTestCase):
    def test_backend_selector_defaults_match_frontend_contract(self) -> None:
        node = normalize_node_payload(
            {
                "id": "selector-1",
                "type": "selector",
            },
            sequence=1,
        )

        self.assertEqual(node["title"], "选择器节点")
        self.assertEqual(node["inputs"], [])
        self.assertEqual(node["outputs"], [])
        self.assertEqual(node["config"]["inputMappings"], [])
        self.assertEqual(node["config"]["selectorElseBranch"], "else")

    async def test_legacy_mapping_does_not_hide_structured_node_operand(
        self,
    ) -> None:
        node = _selector_node()
        state = {
            "input": {},
            "variables": {
                "start": {"input": "input"},
            },
        }

        node_input = build_node_input(node, state)  # type: ignore[arg-type]
        output = await SelectorNodeExecutor().run(
            node,
            node_input,
            state,  # type: ignore[arg-type]
        )

        self.assertEqual(node_input["start.input"], "input")
        self.assertEqual(output["branch"], "命中")

    async def test_branch_and_else_outputs_route_to_canonical_ports(self) -> None:
        node = _selector_node()
        matched_end = _end_node("end-matched", "命中结束")
        else_end = _end_node("end-else", "否则结束")
        edges = [
            WorkflowEdge(
                source=node.id,
                target=matched_end.id,
                sourcePortID="selector-branch-0",
            ),
            WorkflowEdge(
                source=node.id,
                target=else_end.id,
                sourcePortID="selector-else",
            ),
        ]
        route = make_selector_router(
            node,
            edges,
            {
                matched_end.id: matched_end,
                else_end.id: else_end,
            },
        )

        matched_state = {
            "variables": {node.id: {"branch": "命中"}},
        }
        else_state = {
            "variables": {node.id: {"branch": "否则"}},
        }

        self.assertEqual(
            route(matched_state),  # type: ignore[arg-type]
            matched_end.id,
        )
        self.assertEqual(
            route(else_state),  # type: ignore[arg-type]
            else_end.id,
        )


if __name__ == "__main__":
    unittest.main()
