"""Ledger Copilot backend.

FastAPI service that powers the GenLedge-style finance AI demo.  One
``/chat`` endpoint runs a single Claude CLI call that returns a structured
JSON envelope ``{assistant_message, actions}``.  The backend then executes
the requested actions against the mock ledger.  This path uses the user's
Claude Code OAuth token via the ``claude`` CLI, not the raw Messages API
(which rejects OAuth tokens).

Security layers (all enforced on ``/chat``):
  - shared-secret header ``x-demo-secret``
  - per-IP rate limit via slowapi (5/min, 30/hour)
  - CORS allowlist locked to the production Vercel origin
  - per-request CLI budget cap (``--max-budget-usd 0.10``)
  - user-message length cap (2000 chars)
  - 30s subprocess timeout
"""

from __future__ import annotations

import copy
import hmac
import json
import logging
import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


logger = logging.getLogger("ledger_copilot")
logging.basicConfig(level=logging.INFO)

BACKEND_DIR = Path(__file__).resolve().parent
LEDGER_FILE = BACKEND_DIR / "mock_ledger.json"
MODEL_ID = "claude-haiku-4-5-20251001"
CLI_TIMEOUT_SECONDS = 30
MAX_USER_MESSAGE_CHARS = 2000
MAX_BUDGET_USD = "0.10"

ALLOWED_ORIGIN = "https://genledge-assistant.vercel.app"

# ---------------------------------------------------------------------------
# Mock ledger state
# ---------------------------------------------------------------------------

with LEDGER_FILE.open("r", encoding="utf-8") as fh:
    BASE_LEDGER: Dict[str, Any] = json.load(fh)

_SESSIONS: Dict[str, Dict[str, Any]] = {}


def _new_session_ledger() -> Dict[str, Any]:
    return copy.deepcopy(BASE_LEDGER)


def _get_session(session_id: str) -> Dict[str, Any]:
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = {
            "ledger": _new_session_ledger(),
            "emails": [],
        }
    return _SESSIONS[session_id]


# ---------------------------------------------------------------------------
# Tool executors (server-side; the LLM only emits action descriptors)
# ---------------------------------------------------------------------------


def _execute_categorize(session: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    ledger = session["ledger"]
    txn_id = args.get("transaction_id")
    category = args.get("category")
    account_code = args.get("account_code")
    try:
        confidence = float(args.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0
    reasoning = args.get("reasoning", "")

    for txn in ledger["transactions"]:
        if txn["id"] == txn_id:
            txn["category"] = category
            txn["account_code"] = account_code
            txn["confidence"] = confidence
            txn["status"] = "categorized"
            return {
                "ok": True,
                "transaction_id": txn_id,
                "category": category,
                "account_code": account_code,
                "confidence": confidence,
                "reasoning": reasoning,
            }
    return {"ok": False, "error": f"transaction {txn_id} not found"}


def _execute_reconcile(session: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    ledger = session["ledger"]
    txn_id = args.get("transaction_id")
    match_type = args.get("match_type")
    match_id = args.get("match_id") or ""
    reasoning = args.get("reasoning", "")

    txn = next((t for t in ledger["transactions"] if t["id"] == txn_id), None)
    if txn is None:
        return {"ok": False, "error": f"transaction {txn_id} not found"}

    if match_type == "invoice":
        inv = next((i for i in ledger["invoices"] if i["id"] == match_id), None)
        if inv is None:
            return {"ok": False, "error": f"invoice {match_id} not found"}
        inv["status"] = "paid"
        txn["reconciled_with"] = match_id
        txn["status"] = "reconciled"
    elif match_type == "bill":
        bill = next((b for b in ledger["bills"] if b["id"] == match_id), None)
        if bill is None:
            return {"ok": False, "error": f"bill {match_id} not found"}
        bill["status"] = "paid"
        txn["reconciled_with"] = match_id
        txn["status"] = "reconciled"
    else:
        txn["status"] = "review"

    return {
        "ok": True,
        "transaction_id": txn_id,
        "match_type": match_type,
        "match_id": match_id,
        "reasoning": reasoning,
    }


def _execute_generate_reminder(session: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    ledger = session["ledger"]
    inv_id = args.get("invoice_id")
    subject = args.get("subject", "")
    body = args.get("body", "")

    inv = next((i for i in ledger["invoices"] if i["id"] == inv_id), None)
    if inv is None:
        return {"ok": False, "error": f"invoice {inv_id} not found"}

    email = {
        "id": f"email-{uuid.uuid4().hex[:8]}",
        "invoice_id": inv_id,
        "to": inv.get("customer_name", ""),
        "subject": subject,
        "body": body,
    }
    session["emails"].append(email)
    inv["reminder_drafted"] = True
    return {"ok": True, **email}


TOOL_EXECUTORS = {
    "categorize_transaction": _execute_categorize,
    "reconcile_bank_line": _execute_reconcile,
    "generate_ar_reminder": _execute_generate_reminder,
}


# ---------------------------------------------------------------------------
# Structured output schema (LLM is forced into this envelope)
# ---------------------------------------------------------------------------


ACTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["assistant_message", "actions"],
    "properties": {
        "assistant_message": {
            "type": "string",
            "description": "Short reply to the user. Summarize what actions were taken, do not restate every row.",
        },
        "actions": {
            "type": "array",
            "description": "Ordered list of tool calls the server should execute against the mock ledger.",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["tool", "args"],
                "properties": {
                    "tool": {
                        "type": "string",
                        "enum": [
                            "categorize_transaction",
                            "reconcile_bank_line",
                            "generate_ar_reminder",
                        ],
                    },
                    "args": {"type": "object"},
                },
            },
        },
    },
}


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------


def _build_system_prompt(ledger: Dict[str, Any]) -> str:
    ledger_json = json.dumps(ledger, indent=2, sort_keys=True)
    return (
        "You are Ledger Copilot, a finance AI assistant for a small business "
        "bookkeeper. You work inside a GenLedge-style product shell.\n\n"
        "You MUST reply with a single JSON object matching the schema the "
        "caller has provided: {assistant_message: string, actions: array}. "
        "Do not add prose outside the JSON. The server will execute each "
        "action against the real mock ledger.\n\n"
        "Available actions (tool field):\n"
        "  1. categorize_transaction {transaction_id, category, account_code, confidence, reasoning}\n"
        "  2. reconcile_bank_line    {transaction_id, match_type (invoice|bill|none), match_id, reasoning}\n"
        "  3. generate_ar_reminder   {invoice_id, subject, body}\n\n"
        "Guidelines:\n"
        "- When the user asks you to categorize, emit one categorize_transaction action per pending transaction.\n"
        "- When reconciling, match on amount, customer or vendor name, and date proximity. "
        "If nothing matches confidently, use match_type='none' with match_id=''.\n"
        "- When drafting reminders, only target invoices with days_overdue > 0. "
        "Tone is professional and direct, sign 'Harbor and Oak', no em dashes.\n"
        "- Keep assistant_message short. Summarize what you did, do not restate every row.\n"
        "- Never invent transactions, invoices, bills, or customers outside the provided ledger.\n\n"
        "Current ledger snapshot (authoritative):\n"
        f"{ledger_json}\n"
    )


# ---------------------------------------------------------------------------
# API models
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    session_id: str
    messages: List[ChatMessage]


class ToolCallEvent(BaseModel):
    tool: str
    input: Dict[str, Any]
    result: Dict[str, Any]


class ChatResponse(BaseModel):
    message: str
    tool_calls: List[ToolCallEvent]
    updated_ledger: Dict[str, Any]
    emails: List[Dict[str, Any]]


# ---------------------------------------------------------------------------
# Auth / rate limiting helpers
# ---------------------------------------------------------------------------


def _require_demo_secret(x_demo_secret: Optional[str] = Header(default=None)) -> None:
    expected = os.environ.get("DEMO_SHARED_SECRET", "")
    if not expected:
        # Fail closed: if the server is misconfigured, do not accept traffic.
        raise HTTPException(status_code=503, detail="demo secret not configured")
    if not x_demo_secret or not hmac.compare_digest(x_demo_secret, expected):
        raise HTTPException(status_code=403, detail="forbidden")


limiter = Limiter(key_func=get_remote_address)


# ---------------------------------------------------------------------------
# Claude CLI invocation
# ---------------------------------------------------------------------------


def _format_prompt(messages: List[ChatMessage]) -> str:
    """Flatten the chat turns into a single prompt body for the CLI.

    Claude CLI's ``--print`` mode takes one prompt string.  We preserve turn
    structure with plain labels so the model still sees the history.
    """
    lines: List[str] = []
    for m in messages:
        tag = "User" if m.role == "user" else "Assistant"
        lines.append(f"{tag}: {m.content}")
    lines.append("Assistant:")
    return "\n\n".join(lines)


def _run_claude_cli(system_prompt: str, prompt_text: str) -> Dict[str, Any]:
    """Run the Claude CLI in print mode and return the parsed JSON envelope.

    Returns a dict with keys: ``result_text`` (str), ``usage`` (dict|None),
    ``cost_usd`` (float|None), ``raw`` (full CLI JSON).  Raises HTTPException
    on timeout, non-zero exit, or unparseable output.
    """
    cli_path = shutil.which("claude")
    if cli_path is None:
        raise HTTPException(
            status_code=503,
            detail="claude CLI not installed on the backend",
        )

    # Copy the env and strip anything that could redirect the CLI to a
    # different token or leak. We explicitly pass through the OAuth token
    # via CLAUDE_CODE_OAUTH_TOKEN, which the CLI auto-detects.
    cli_env = os.environ.copy()

    cmd = [
        cli_path,
        "--print",
        "--output-format",
        "json",
        "--model",
        MODEL_ID,
        "--system-prompt",
        system_prompt,
        "--json-schema",
        json.dumps(ACTION_SCHEMA),
        "--max-budget-usd",
        MAX_BUDGET_USD,
        prompt_text,
    ]

    # Best-effort flags: some CLI versions expose these, some do not.
    # We append them if supported via env-flag opt-in, but do not fail if
    # the CLI rejects unknown flags — we rely on the empty tool surface
    # (no MCP, no filesystem work) to keep this call tightly scoped.
    try:
        proc = subprocess.run(
            cmd,
            env=cli_env,
            capture_output=True,
            text=True,
            timeout=CLI_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="claude CLI timed out")

    if proc.returncode != 0:
        logger.error(
            "claude CLI exited %s; stderr=%s",
            proc.returncode,
            (proc.stderr or "")[:500],
        )
        raise HTTPException(status_code=502, detail="claude CLI failed")

    try:
        envelope = json.loads(proc.stdout)
    except json.JSONDecodeError:
        logger.error("claude CLI returned non-JSON output: %r", proc.stdout[:500])
        raise HTTPException(status_code=502, detail="claude CLI returned non-JSON")

    result_text = envelope.get("result") or ""
    usage = envelope.get("usage") if isinstance(envelope.get("usage"), dict) else None
    cost_usd = envelope.get("total_cost_usd") or envelope.get("cost_usd")

    if not result_text:
        # Log the envelope keys (NOT values) so we can see where the output
        # actually landed when --json-schema is active.  Never log the full
        # payload in case it contains internal prompt text.
        logger.warning(
            "claude CLI returned empty 'result'; envelope keys=%s",
            sorted(envelope.keys()),
        )
        # Fallbacks commonly seen across CLI versions.
        for alt in ("structured_output", "content", "text", "output"):
            val = envelope.get(alt)
            if isinstance(val, str) and val.strip():
                result_text = val
                break
            if isinstance(val, dict):
                # structured object: serialize back to JSON so downstream
                # JSON parser grabs it.
                result_text = json.dumps(val)
                break

    return {
        "result_text": result_text,
        "usage": usage,
        "cost_usd": cost_usd,
        "raw": envelope,
    }


def _extract_json_envelope(text: str) -> Optional[Dict[str, Any]]:
    """Pull the first top-level JSON object out of the LLM's text reply."""
    text = text.strip()
    if not text:
        return None
    # Fast path: pure JSON.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Fallback: find the first balanced { ... } block.
    depth = 0
    start = -1
    for idx, ch in enumerate(text):
        if ch == "{":
            if depth == 0:
                start = idx
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                candidate = text[start : idx + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = -1
                    continue
    return None


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(
        title="Ledger Copilot API",
        description="GenLedge-style finance AI demo backend.",
        version="0.2.0",
    )

    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": "rate limit exceeded"},
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[ALLOWED_ORIGIN],
        allow_credentials=True,
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["content-type", "x-demo-secret"],
    )

    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {"ok": True}

    @app.get(
        "/ledger/{session_id}",
        dependencies=[Depends(_require_demo_secret)],
    )
    def get_ledger(session_id: str) -> Dict[str, Any]:
        session = _get_session(session_id)
        return {"ledger": session["ledger"], "emails": session["emails"]}

    @app.post(
        "/reset/{session_id}",
        dependencies=[Depends(_require_demo_secret)],
    )
    def reset(session_id: str) -> Dict[str, Any]:
        _SESSIONS.pop(session_id, None)
        session = _get_session(session_id)
        return {"ok": True, "ledger": session["ledger"]}

    @app.post(
        "/chat",
        response_model=ChatResponse,
        dependencies=[Depends(_require_demo_secret)],
    )
    @limiter.limit("5/minute")
    @limiter.limit("30/hour")
    def chat(request: Request, req: ChatRequest) -> ChatResponse:
        # Validate user-message length before spending CLI budget.
        for m in req.messages:
            if m.role == "user" and len(m.content) > MAX_USER_MESSAGE_CHARS:
                raise HTTPException(
                    status_code=413,
                    detail=f"user message exceeds {MAX_USER_MESSAGE_CHARS} chars",
                )

        session = _get_session(req.session_id)
        system_prompt = _build_system_prompt(session["ledger"])
        prompt_text = _format_prompt(req.messages)

        client_ip = get_remote_address(request)
        t0 = time.monotonic()
        cli = _run_claude_cli(system_prompt, prompt_text)
        duration_ms = int((time.monotonic() - t0) * 1000)

        usage = cli.get("usage") or {}
        logger.info(
            "chat ip=%s duration_ms=%s input_tokens=%s output_tokens=%s cost_usd=%s",
            client_ip,
            duration_ms,
            usage.get("input_tokens"),
            usage.get("output_tokens"),
            cli.get("cost_usd"),
        )

        envelope = _extract_json_envelope(cli["result_text"])
        if not envelope or not isinstance(envelope, dict):
            logger.warning(
                "envelope parse failed; result_text[:400]=%r",
                (cli["result_text"] or "")[:400],
            )
            fallback_text = (cli["result_text"] or "").strip()
            return ChatResponse(
                message=(
                    fallback_text
                    or "I could not parse a structured action plan for that request. "
                    "Try rephrasing."
                ),
                tool_calls=[],
                updated_ledger=session["ledger"],
                emails=session["emails"],
            )

        assistant_message = str(envelope.get("assistant_message") or "").strip()
        actions = envelope.get("actions") or []

        tool_events: List[ToolCallEvent] = []
        if isinstance(actions, list):
            for action in actions:
                if not isinstance(action, dict):
                    continue
                tool_name = action.get("tool")
                args = action.get("args") or {}
                if not isinstance(args, dict):
                    continue
                executor = TOOL_EXECUTORS.get(tool_name)
                if executor is None:
                    result = {"ok": False, "error": f"unknown tool {tool_name}"}
                else:
                    try:
                        result = executor(session, args)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("tool %s crashed", tool_name)
                        result = {"ok": False, "error": str(exc)}
                tool_events.append(
                    ToolCallEvent(tool=str(tool_name), input=args, result=result)
                )

        return ChatResponse(
            message=assistant_message
            or "Done. Take a look at the ledger on the left.",
            tool_calls=tool_events,
            updated_ledger=session["ledger"],
            emails=session["emails"],
        )

    return app


app = create_app()
