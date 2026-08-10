from __future__ import annotations

import unittest

from app.agents.workflow_agent.policy import WorkflowPolicyGate
from app.agents.workflow_agent.schemas import WorkflowActionPlan
from app.workflow.patch.schemas import WorkflowPatch


class WorkflowPolicyGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = WorkflowPolicyGate()

    def test_selected_node_scope_rejects_other_node(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=["node-1"],
        )
        patch = WorkflowPatch.model_validate(
            {
                "operations": [
                    {
                        "op": "update_node",
                        "nodeId": "node-2",
                        "partial": {"title": "越界修改"},
                    }
                ]
            }
        )

        result = self.gate.validate_patch(
            action,
            patch,
            selected_node_id="node-1",
            confirmed=False,
        )

        self.assertFalse(result.allowed)
        self.assertIn("outside scope", result.reason)

    def test_low_risk_selected_node_update_is_allowed(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=["node-1"],
        )
        patch = WorkflowPatch.model_validate(
            {
                "operations": [
                    {
                        "op": "update_node",
                        "nodeId": "node-1",
                        "partial": {"title": "新标题"},
                    }
                ]
            }
        )

        result = self.gate.validate_patch(
            action,
            patch,
            selected_node_id="node-1",
            confirmed=False,
        )

        self.assertTrue(result.allowed)
        self.assertFalse(result.requiresConfirmation)

    def test_high_risk_change_requires_confirmation(self) -> None:
        action = WorkflowActionPlan(
            intent="create_workflow",
            scope="full_workflow",
            riskLevel="high",
            requiresConfirmation=True,
        )
        patch = WorkflowPatch.model_validate({"operations": []})

        result = self.gate.validate_patch(
            action,
            patch,
            selected_node_id=None,
            confirmed=False,
        )

        self.assertFalse(result.allowed)
        self.assertTrue(result.requiresConfirmation)

    def test_metadata_scope_only_allows_metadata_patch(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_workflow",
            scope="workflow_metadata",
            riskLevel="low",
        )
        patch = WorkflowPatch.model_validate(
            {
                "operations": [
                    {
                        "op": "update_metadata",
                        "name": "New workflow name",
                        "description": "New workflow description",
                    }
                ]
            }
        )

        result = self.gate.validate_patch(
            action,
            patch,
            selected_node_id=None,
            confirmed=False,
        )

        self.assertTrue(result.allowed)
        self.assertFalse(result.requiresConfirmation)


if __name__ == "__main__":
    unittest.main()
