WORKFLOW_EVENT_PREFIX = "workflow."

WORKFLOW_EVENT_NAMES = frozenset(
    {
        "session",
        "message",
        "clarification",
        "sandboxRequired",
        "planPreview",
        "patchStage",
        "workflowPatch",
        "fixing",
        "complete",
        "error",
        "end",
    }
)


def workflow_event_type(event_name: str) -> str:
    if event_name not in WORKFLOW_EVENT_NAMES:
        raise ValueError(f"Unsupported workflow event: {event_name}")
    return f"{WORKFLOW_EVENT_PREFIX}{event_name}"
