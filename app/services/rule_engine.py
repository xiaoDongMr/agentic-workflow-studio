from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app.schemas.workflow import WorkflowSelectorCondition, WorkflowSelectorOperand


@dataclass(frozen=True)
class RuleEvaluationContext:
    node_input: dict[str, Any]
    variables: dict[str, Any]
    run_input: dict[str, Any]


@dataclass(frozen=True)
class RuleConditionResult:
    matched: bool
    left: Any
    right: Any
    operator: str


class OperandResolver:
    def resolve(self, operand: WorkflowSelectorOperand, context: RuleEvaluationContext) -> Any:
        source_type = operand.sourceType
        if source_type == "literal":
            return operand.literalValue if operand.literalValue is not None else operand.source
        if source_type == "context":
            path = operand.contextPath or operand.source
            return self._get_by_path(context.run_input, path)
        if source_type == "node":
            return self._resolve_node_operand(operand, context)
        return None

    def _resolve_node_operand(self, operand: WorkflowSelectorOperand, context: RuleEvaluationContext) -> Any:
        node_id = operand.nodeId
        field_path = operand.fieldPath
        source = operand.source
        if not node_id and source:
            node_id, _, field_path = source.partition(".")
        if source and source in context.node_input:
            return context.node_input.get(source)
        if source and source in context.run_input:
            return context.run_input.get(source)

        node_value = context.variables.get(node_id)
        if isinstance(node_value, dict):
            return self._get_by_path(node_value, field_path)
        return None

    def _get_by_path(self, value: Any, path: str) -> Any:
        current = value
        if not path:
            return current
        if isinstance(current, dict) and path in current:
            return current.get(path)
        for part in path.split("."):
            if isinstance(current, dict):
                current = current.get(part)
                continue
            return None
        return current


class RuleEngine:
    def __init__(self, resolver: OperandResolver | None = None):
        self.resolver = resolver or OperandResolver()

    def evaluate_condition(
        self,
        condition: WorkflowSelectorCondition,
        context: RuleEvaluationContext,
    ) -> RuleConditionResult:
        left = self.resolver.resolve(condition.left, context)
        right = self.resolver.resolve(condition.right, context)
        matched = self.compare(left, condition.operator, right)
        return RuleConditionResult(matched=matched, left=left, right=right, operator=condition.operator)

    def compare(self, left: Any, operator: str, right: Any) -> bool:
        if operator == "equals":
            return left == right
        if operator == "not_equals":
            return left != right
        if operator == "length_gt":
            return self._safe_len(left) > self._safe_number(right)
        if operator == "length_gte":
            return self._safe_len(left) >= self._safe_number(right)
        if operator == "length_lt":
            return self._safe_len(left) < self._safe_number(right)
        if operator == "length_lte":
            return self._safe_len(left) <= self._safe_number(right)
        if operator == "not_contains":
            return self._stringify(right) not in self._stringify(left)
        return self._stringify(right) in self._stringify(left)

    def _safe_len(self, value: Any) -> int:
        if value is None:
            return 0
        if isinstance(value, (str, list, tuple, dict, set)):
            return len(value)
        return len(str(value))

    def _safe_number(self, value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0

    def _stringify(self, value: Any) -> str:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        if value is None:
            return ""
        return str(value)


rule_engine = RuleEngine()
