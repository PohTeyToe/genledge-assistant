"""Ledger Copilot backend.

FastAPI service that powers the GenLedge-style finance AI demo.  One
``/chat`` endpoint runs a Claude Haiku 4.5 tool-use loop over an in-memory
mock ledger.  Prompt caching is enabled on the system prompt block so the
ledger + tool schemas do not re-bill on every turn.
"""

from __future__ import annotations

import copy
import json
import logging
import os
import uuid
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional

import anthropic
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field


logger = logging.getLogger("ledger_copilot")
logging.basicConfig(level=logging.INFO)

BACKEND_DIR = Path(__file__).resolve().parent
LEDGER_FILE = BACKEND_DIR / "mock_ledger.json"
MODEL_ID = "claude-haiku-4-5"
MAX_TOOL_ITERATIONS = 6

# ---------------------------------------------------------------------------
# Mock ledger state
# ---------------------------------------------------------------------------

with LEDGER_FILE.open("r", encoding="utf-8") as fh:
    BASE_LEDGER: Dict[str, Any] = json.load(fh)

_SESSIONS: Dict[str, Dict[str, Any]] = {}


def _new_session_ledger() -> Dict[str, Any]:
    """Return a deep copy of the base ledger for a fresh session."""
    return copy.deepcopy(BASE_LEDGER)


def _get_session(session_id: str) -> Dict[str, Any]:
    """Return the session state, creating it on first use."""
    if session_id not in _SESSIONS:
        _SESSIONS[session_id] = {
            "ledger": _new_session_ledger(),
            "emails": [],
        }
    return _SESSIONS[session_id]


# ---------------------------------------------------------------------------
# Tool definitions
# ---------------------------------------------------------------------------


TOOLS: List[Dict[str, Any]] = [
    {
        "name": "categorize_transaction",
        "description": (
            "Assign a chart-of-accounts category to a pending transaction. "
            "Return the category name, an account code from the chart of "
            "accounts, and a 0.0-1.0 confidence score. Use this when the "
            "user asks to categorize uncategorized transactions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_id": {
                    "type": "string",
                    "description": "The transaction ID, e.g. TXN-1004.",
                },
                "category": {
                    "type": "string",
                    "description": "Chart-of-accounts category name.",
                },
                "account_code": {
                    "type": "string",
                    "description": "Chart-of-accounts code, e.g. 6020.",
                },
                "confidence": {
                    "type": "number",
                    "description": "Confidence score between 0 and 1.",
                },
                "reasoning": {
                    "type": "string",
                    "description": "One sentence rationale for the category.",
                },
            },
            "required": [
                "transaction_id",
                "category",
                "account_code",
                "confidence",
                "reasoning",
            ],
        },
    },
    {
        "name": "reconcile_bank_line",
        "description": (
            "Match a bank transaction to an open invoice or bill. Use this "
            "when the user asks to reconcile bank activity. If no confident "
            "match exists, pass match_type='none' and explain why."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_id": {
                    "type": "string",
                    "description": "The bank transaction ID.",
                },
                "match_type": {
                    "type": "string",
                    "enum": ["invoice", "bill", "none"],
                    "description": "What kind of ledger item this matches.",
                },
                "match_id": {
                    "type": "string",
                    "description": "Matched invoice/bill ID, or empty string if none.",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Why this match was chosen, or why none was found.",
                },
            },
            "required": [
                "transaction_id",
                "match_type",
                "match_id",
                "reasoning",
            ],
        },
    },
    {
        "name": "generate_ar_reminder",
        "description": (
            "Draft a reminder email for an overdue invoice. Return a subject "
            "line and body. Tone should be professional and direct, no em "
            "dashes. Use this when the user asks to draft reminders for "
            "overdue invoices."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "invoice_id": {
                    "type": "string",
                    "description": "The invoice ID, e.g. INV-2106.",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line.",
                },
                "body": {
                    "type": "string",
                    "description": "Email body in plain text, signed 'Harbor and Oak'.",
                },
            },
            "required": ["invoice_id", "subject", "body"],
        },
    },
]


# ---------------------------------------------------------------------------
# Tool executors
# ---------------------------------------------------------------------------


def _execute_categorize(session: Dict[str, Any], args: Dict[str, Any]) -> Dict[str, Any]:
    ledger = session["ledger"]
    txn_id = args.get("transaction_id")
    category = args.get("category")
    account_code = args.get("account_code")
    confidence = float(args.get("confidence", 0.0))
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
# System prompt
# ---------------------------------------------------------------------------


def _build_system_prompt(ledger: Dict[str, Any]) -> str:
    """System prompt including the mock ledger as JSON.

    Rendered once per session; prompt caching keeps the token cost flat across
    turns.  Do not interpolate per-turn data here or the cache will invalidate.
    """
    ledger_json = json.dumps(ledger, indent=2, sort_keys=True)
    return (
        "You are Ledger Copilot, a finance AI assistant for a small business "
        "bookkeeper. You work inside a GenLedge-style product shell.\n\n"
        "Your job is to help the user clean up their books using three tools:\n"
        "  1. categorize_transaction for uncategorized bank transactions\n"
        "  2. reconcile_bank_line to match deposits to open invoices and "
        "payments to bills\n"
        "  3. generate_ar_reminder to draft reminder emails for overdue "
        "invoices\n\n"
        "Guidelines:\n"
        "- When the user asks you to categorize, iterate through every "
        "pending transaction and call the tool once per item.\n"
        "- When reconciling, match on amount, customer or vendor name, and "
        "date proximity. If nothing matches confidently, call the tool with "
        "match_type='none' and a one-line reason.\n"
        "- When drafting reminders, target invoices with days_overdue > 0. "
        "Keep tone professional and direct. No em dashes.\n"
        "- Keep chat replies short. Summarize what you did after the tools "
        "run, do not restate every row.\n"
        "- Never invent transactions, invoices, bills, or customers outside "
        "the provided ledger.\n\n"
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
# FastAPI app
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    app = FastAPI(
        title="Ledger Copilot API",
        description="GenLedge-style finance AI demo backend.",
        version="0.1.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5185",
            "http://127.0.0.1:5185",
            "http://localhost:5173",
        ],
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/")
    def root() -> Dict[str, str]:
        return {"service": "ledger-copilot", "version": "0.1.0"}

    @app.get("/health")
    def health() -> Dict[str, Any]:
        return {
            "status": "ok",
            "model": MODEL_ID,
            "anthropic_key_set": bool(os.environ.get("ANTHROPIC_API_KEY")),
            "active_sessions": len(_SESSIONS),
        }

    @app.get("/ledger/{session_id}")
    def get_ledger(session_id: str) -> Dict[str, Any]:
        session = _get_session(session_id)
        return {"ledger": session["ledger"], "emails": session["emails"]}

    @app.post("/reset/{session_id}")
    def reset(session_id: str) -> Dict[str, Any]:
        _SESSIONS.pop(session_id, None)
        session = _get_session(session_id)
        return {"ok": True, "ledger": session["ledger"]}

    @app.post("/chat", response_model=ChatResponse)
    def chat(req: ChatRequest) -> ChatResponse:
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=503,
                detail=(
                    "ANTHROPIC_API_KEY not configured on the backend. The "
                    "demo UI still works for ledger rendering but cannot "
                    "invoke the agent."
                ),
            )

        session = _get_session(req.session_id)
        client = anthropic.Anthropic(api_key=api_key)

        # System prompt with prompt caching.  The block is stable for the
        # lifetime of the session; per-turn user content goes in messages.
        system_blocks = [
            {
                "type": "text",
                "text": _build_system_prompt(session["ledger"]),
                "cache_control": {"type": "ephemeral"},
            }
        ]

        messages: List[Dict[str, Any]] = [
            {"role": m.role, "content": m.content} for m in req.messages
        ]

        tool_events: List[ToolCallEvent] = []

        for _ in range(MAX_TOOL_ITERATIONS):
            response = client.messages.create(
                model=MODEL_ID,
                max_tokens=2048,
                system=system_blocks,
                tools=TOOLS,
                messages=messages,
            )

            # Log cache usage for observability.
            usage = getattr(response, "usage", None)
            if usage is not None:
                logger.info(
                    "turn usage: in=%s cache_read=%s cache_write=%s out=%s",
                    getattr(usage, "input_tokens", None),
                    getattr(usage, "cache_read_input_tokens", None),
                    getattr(usage, "cache_creation_input_tokens", None),
                    getattr(usage, "output_tokens", None),
                )

            if response.stop_reason != "tool_use":
                final_text = "".join(
                    b.text for b in response.content if b.type == "text"
                )
                return ChatResponse(
                    message=final_text.strip()
                    or "Done. Take a look at the ledger on the left.",
                    tool_calls=tool_events,
                    updated_ledger=session["ledger"],
                    emails=session["emails"],
                )

            # Append the assistant turn verbatim so the tool_use blocks stay
            # paired with our tool_result responses.
            messages.append({"role": "assistant", "content": response.content})

            tool_results_block: List[Dict[str, Any]] = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                executor = TOOL_EXECUTORS.get(block.name)
                if executor is None:
                    result = {"ok": False, "error": f"unknown tool {block.name}"}
                else:
                    try:
                        result = executor(session, block.input)
                    except Exception as exc:  # noqa: BLE001
                        logger.exception("tool %s crashed", block.name)
                        result = {"ok": False, "error": str(exc)}

                tool_events.append(
                    ToolCallEvent(tool=block.name, input=block.input, result=result)
                )
                tool_results_block.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": json.dumps(result),
                    }
                )

            messages.append({"role": "user", "content": tool_results_block})

        # Safety net: we ran out of iterations.
        return ChatResponse(
            message=(
                "Stopped after the max tool-call budget. "
                "Ask me to continue and I will pick up where I left off."
            ),
            tool_calls=tool_events,
            updated_ledger=session["ledger"],
            emails=session["emails"],
        )

    return app


app = create_app()
