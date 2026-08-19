from __future__ import annotations

import unittest

from app.agents.workflow_agent.policy import WorkflowPolicyGate
from app.agents.workflow_agent.schemas import WorkflowActionPlan


class WorkflowPolicyGateTest(unittest.TestCase):
    def setUp(self) -> None:
        self.gate = WorkflowPolicyGate()

    def test_selected_node_scope_rejects_other_node(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=["node-2"],
        )

        result = self.gate.assess_action(
            action,
            selected_node_id="node-1",
        )

        self.assertFalse(result.allowed)
        self.assertIn("selectedNodeId", result.reason)

    def test_low_risk_selected_node_update_is_allowed(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_selected_node",
            scope="selected_node_only",
            riskLevel="low",
            targetNodeIds=["node-1"],
        )

        result = self.gate.assess_action(
            action,
            selected_node_id="node-1",
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

        result = self.gate.assess_action(
            action,
            selected_node_id=None,
        )

        self.assertTrue(result.allowed)
        self.assertTrue(result.requiresConfirmation)

    def test_metadata_scope_allows_modify_action(self) -> None:
        action = WorkflowActionPlan(
            intent="modify_workflow",
            scope="workflow_metadata",
            riskLevel="low",
        )

        result = self.gate.assess_action(
            action,
            selected_node_id=None,
        )

        self.assertTrue(result.allowed)
        self.assertFalse(result.requiresConfirmation)


if __name__ == "__main__":
    unittest.main()
