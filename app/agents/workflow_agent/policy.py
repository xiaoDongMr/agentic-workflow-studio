from __future__ import annotations

from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowPolicyDecision,
)


class WorkflowPolicyGate:
    def assess_action(
        self,
        action: WorkflowActionPlan,
        *,
        selected_node_id: str | None,
    ) -> WorkflowPolicyDecision:
        violations: list[str] = []
        targets = set(action.targetNodeIds)

        if action.scope == "selected_node_only":
            if not selected_node_id:
                violations.append("selected_node_only requires selectedNodeId")
            elif targets and targets != {selected_node_id}:
                violations.append("targetNodeIds must only contain selectedNodeId")

        if action.scope in {"partial_workflow", "target_nodes"} and not targets:
            violations.append(f"{action.scope} requires targetNodeIds")

        if action.scope == "read_only" and action.intent not in {
            "explain_workflow",
            "debug_node",
        }:
            violations.append("read_only scope only supports explain or debug intents")

        if (
            action.scope == "workflow_metadata"
            and action.intent not in {"create_workflow", "modify_workflow"}
        ):
            violations.append(
                "workflow_metadata scope only supports create or modify intents"
            )

        requires_confirmation = (
            action.requiresConfirmation
            or action.riskLevel in {"medium", "high"}
            or action.scope == "full_workflow"
            or action.intent in {"insert_node", "remove_node", "rewire_edges"}
        )
        return WorkflowPolicyDecision(
            allowed=not violations,
            requiresConfirmation=requires_confirmation,
            reason=violations[0] if violations else "",
            violations=violations,
        )
