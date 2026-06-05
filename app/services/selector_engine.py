from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.schemas.workflow import WorkflowNode, WorkflowSelectorCondition
from app.services.rule_engine import RuleEvaluationContext, rule_engine

SELECTOR_OPERATOR_LABELS = {
    "equals": "等于",
    "not_equals": "不等于",
    "length_gt": "长度大于",
    "length_gte": "长度大于等于",
    "length_lt": "长度小于",
    "length_lte": "长度小于等于",
    "contains": "包含",
    "not_contains": "不包含",
}


@dataclass(frozen=True)
class SelectorResult:
    branch: str
    matched: str | None


@dataclass(frozen=True)
class SelectorContext:
    node_input: dict[str, Any]
    variables: dict[str, Any]
    run_input: dict[str, Any]

    def to_rule_context(self) -> RuleEvaluationContext:
        return RuleEvaluationContext(
            node_input=self.node_input,
            variables=self.variables,
            run_input=self.run_input,
        )


class SelectorEngine:
    def evaluate(
        self,
        node: WorkflowNode,
        node_input: dict[str, Any],
        variables: dict[str, Any] | None = None,
        run_input: dict[str, Any] | None = None,
    ) -> SelectorResult:
        context = SelectorContext(node_input=node_input, variables=variables or {}, run_input=run_input or {})
        if node.config.selectorBranches:
            return self._evaluate_structured_rules(node, context)
        return self._evaluate_legacy_prompt_rules(node, node_input)

    def _evaluate_structured_rules(self, node: WorkflowNode, context: "SelectorContext") -> SelectorResult:
        rule_context = context.to_rule_context()
        for branch_index, branch in enumerate(node.config.selectorBranches):
            if not branch.conditions:
                continue
            condition_results = [
                rule_engine.evaluate_condition(condition, rule_context)
                for condition in branch.conditions
            ]
            if all(result.matched for result in condition_results):
                return SelectorResult(
                    branch=self._format_branch_label(branch.label, branch_index),
                    matched=self._format_matched(branch.conditions),
                )
        return SelectorResult(branch=self._format_else_label(node.config.selectorElseBranch), matched=None)

    def _evaluate_legacy_prompt_rules(self, node: WorkflowNode, node_input: dict[str, Any]) -> SelectorResult:
        payload = json.dumps(node_input, ensure_ascii=False)
        for line in node.config.prompt.splitlines():
            if "=>" not in line:
                continue
            condition, branch = [part.strip() for part in line.split("=>", 1)]
            if condition and condition in payload:
                return SelectorResult(branch=branch, matched=condition)
        return SelectorResult(branch=node.config.selectorElseBranch or "else", matched=None)

    def _format_matched(self, conditions: list[WorkflowSelectorCondition]) -> str:
        return " && ".join(
            f"{self._format_operand(condition.left)} {SELECTOR_OPERATOR_LABELS.get(condition.operator, condition.operator)} {self._format_operand(condition.right)}".strip()
            for condition in conditions
        )

    def _format_operand(self, operand: Any) -> str:
        if operand.sourceType == "literal":
            return str(operand.literalValue if operand.literalValue is not None else operand.source)
        if operand.sourceType == "context":
            return operand.contextPath or operand.source
        return operand.displayLabel or operand.source or ".".join(
            item for item in [operand.nodeId, operand.fieldPath] if item
        )

    def _format_branch_label(self, label: str, branch_index: int) -> str:
        normalized = label.strip()
        if not normalized or normalized == "if" or normalized.lower().startswith("branch_"):
            return f"条件 {branch_index + 1}"
        return normalized

    def _format_else_label(self, label: str) -> str:
        normalized = label.strip()
        return "否则" if not normalized or normalized == "else" else normalized


selector_engine = SelectorEngine()
