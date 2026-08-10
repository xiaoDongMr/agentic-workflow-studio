from __future__ import annotations

from app.agents.workflow_agent.schemas import (
    WorkflowActionPlan,
    WorkflowPolicyDecision,
)
from app.workflow.patch.schemas import WorkflowPatch


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

    def validate_patch(
        self,
        action: WorkflowActionPlan,
        patch: WorkflowPatch,
        *,
        selected_node_id: str | None,
        confirmed: bool,
    ) -> WorkflowPolicyDecision:
        base = self.assess_action(action, selected_node_id=selected_node_id)
        violations = list(base.violations)

        if action.scope == "read_only" and patch.operations:
            violations.append("read_only requests cannot produce workflow patches")

        if base.requiresConfirmation and not confirmed:
            violations.append("workflow change requires user confirmation")

        allowed_targets = set(action.targetNodeIds)
        if action.scope == "selected_node_only" and selected_node_id:
            allowed_targets = {selected_node_id}

        for operation in patch.operations:
            if operation.op == "update_metadata":
                if action.scope not in {"workflow_metadata", "full_workflow"}:
                    violations.append(
                        "update_metadata requires workflow_metadata or full_workflow scope"
                    )
                continue

            if operation.op == "replace_workflow":
                if action.scope != "full_workflow":
                    violations.append("replace_workflow is only allowed for full_workflow")
                continue

            node_id = getattr(operation, "nodeId", None)
            if node_id and allowed_targets and node_id not in allowed_targets:
                violations.append(f"operation modifies node outside scope: {node_id}")

            if action.scope == "selected_node_only" and operation.op != "update_node":
                violations.append(
                    f"selected_node_only only allows update_node, got {operation.op}"
                )

            if operation.op == "add_node" and allowed_targets:
                if operation.node.id not in allowed_targets:
                    violations.append(
                        f"operation adds node outside scope: {operation.node.id}"
                    )

            if operation.op == "add_edge" and allowed_targets:
                edge_nodes = {operation.edge.source, operation.edge.target}
                if not edge_nodes.issubset(allowed_targets):
                    violations.append(
                        "operation adds edge outside target node scope"
                    )

        return WorkflowPolicyDecision(
            allowed=not violations,
            requiresConfirmation=base.requiresConfirmation,
            reason=violations[0] if violations else "",
            violations=list(dict.fromkeys(violations)),
        )
