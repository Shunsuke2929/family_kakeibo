from __future__ import annotations

import hashlib
import json
import os
import re
import base64
import mimetypes
import uuid
import io
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
import zipfile

import requests
from flask import Flask, jsonify, request, send_file, send_from_directory
import google.auth
from google.cloud import storage as google_storage
from google.auth.transport import requests as google_auth_requests
from google.oauth2 import id_token
from pywebpush import WebPushException, webpush

BASE_DIR = Path(__file__).resolve().parents[1]
app = Flask(__name__, static_folder=str(BASE_DIR), static_url_path="")

DEFAULT_MODEL = "gemini-3.5-flash"
DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash-lite"
DEFAULT_MODEL_OPTION = "free_gemini35"
ALLOWED_GEMINI_MODELS = {"gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"}
DEFAULT_ALLOWED_MODEL_OPTIONS = {"free_gemini35", "free_gemini25", "paid_gemini35", "paid_gemini25"}
MODEL_OPTION_CONFIG = {
    "free_gemini35": {
        "apiTier": "free",
        "apiKeyEnv": "GEMINI_FREE_API_KEY",
        "models": ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-flash-lite"],
    },
    "free_gemini25": {
        "apiTier": "free",
        "apiKeyEnv": "GEMINI_FREE_API_KEY",
        "models": ["gemini-2.5-flash", "gemini-2.5-flash-lite"],
    },
    "paid_gemini35": {
        "apiTier": "paid",
        "apiKeyEnv": "GEMINI_PAID_API_KEY",
        "models": ["gemini-3.5-flash"],
    },
    "paid_gemini25": {
        "apiTier": "paid",
        "apiKeyEnv": "GEMINI_PAID_API_KEY",
        "models": ["gemini-2.5-flash"],
    },
}
DEFAULT_GEMINI_MAX_OUTPUT_TOKENS = 1536
DEFAULT_GEMINI_MAX_RETRIES = 1
GEMINI_SAFETY_FINISH_REASONS = {"SAFETY", "SPII", "PROHIBITED_CONTENT", "RECITATION", "IMAGE_SAFETY"}
GEMINI_TEMPORARY_HTTP_STATUSES = {429, 503, 504}
GEMINI_ERROR_PAID_KEY_NOT_CONFIGURED = "PAID_KEY_NOT_CONFIGURED"
GEMINI_ERROR_INVALID_JSON = "GEMINI_INVALID_JSON"
GEMINI_ERROR_MAX_TOKENS = "GEMINI_MAX_TOKENS"
GEMINI_ERROR_SAFETY_BLOCK = "GEMINI_SAFETY_BLOCK"
GEMINI_ERROR_RATE_LIMIT = "GEMINI_RATE_LIMIT"
GEMINI_ERROR_TEMPORARY = "GEMINI_TEMPORARY_ERROR"
GEMINI_ERROR_AUTH = "GEMINI_AUTH_ERROR"
GEMINI_ERROR_EMPTY_RESPONSE = "GEMINI_EMPTY_RESPONSE"
GEMINI_RECEIPT_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "propertyOrdering": [
        "storeName",
        "amount",
        "grossAmount",
        "pointCredit",
        "category",
        "date",
        "memo",
        "paymentMethod",
        "invoiceNumber",
        "items",
        "taxSummary",
        "memoWarnings",
    ],
    "properties": {
        "storeName": {"type": "STRING"},
        "amount": {"type": "NUMBER"},
        "grossAmount": {"type": "NUMBER"},
        "pointCredit": {"type": "NUMBER"},
        "category": {"type": "STRING"},
        "date": {"type": "STRING"},
        "memo": {"type": "STRING"},
        "paymentMethod": {"type": "STRING"},
        "invoiceNumber": {"type": "STRING"},
        "items": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "propertyOrdering": [
                    "name",
                    "storeName",
                    "rawAmount",
                    "amountType",
                    "amount",
                    "category",
                    "memo",
                    "quantity",
                    "taxRate",
                    "taxIncludedAmount",
                    "taxIncludedAmountBasis",
                    "confidence",
                    "note",
                ],
                "properties": {
                    "name": {"type": "STRING"},
                    "storeName": {"type": "STRING"},
                    "rawAmount": {"type": "NUMBER", "nullable": True},
                    "amountType": {"type": "STRING"},
                    "amount": {"type": "NUMBER", "nullable": True},
                    "category": {"type": "STRING"},
                    "memo": {"type": "STRING"},
                    "quantity": {"type": "NUMBER", "nullable": True},
                    "taxRate": {"type": "NUMBER", "nullable": True},
                    "taxIncludedAmount": {"type": "NUMBER", "nullable": True},
                    "taxIncludedAmountBasis": {"type": "STRING"},
                    "confidence": {"type": "STRING"},
                    "note": {"type": "STRING"},
                },
            },
        },
        "taxSummary": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "propertyOrdering": ["taxRate", "taxIncludedTotal", "taxableSubtotal", "taxAmount", "basis"],
                "properties": {
                    "taxRate": {"type": "NUMBER", "nullable": True},
                    "taxIncludedTotal": {"type": "NUMBER", "nullable": True},
                    "taxableSubtotal": {"type": "NUMBER", "nullable": True},
                    "taxAmount": {"type": "NUMBER", "nullable": True},
                    "basis": {"type": "STRING"},
                },
            },
        },
        "memoWarnings": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
}
GEMINI_MINIMAL_RECEIPT_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "propertyOrdering": ["storeName", "date", "grossAmount", "amount", "category", "memo", "items", "memoWarnings"],
    "properties": {
        "storeName": {"type": "STRING"},
        "date": {"type": "STRING"},
        "grossAmount": {"type": "NUMBER"},
        "amount": {"type": "NUMBER"},
        "category": {"type": "STRING"},
        "memo": {"type": "STRING"},
        "items": {"type": "ARRAY", "items": {"type": "OBJECT"}},
        "memoWarnings": {"type": "ARRAY", "items": {"type": "STRING"}},
    },
}
GEMINI_REPAIR_RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "propertyOrdering": ["storeName", "amount", "grossAmount", "pointCredit", "category", "date", "memo", "paymentMethod", "invoiceNumber", "items", "taxSummary", "memoWarnings"],
    "properties": GEMINI_RECEIPT_RESPONSE_SCHEMA["properties"],
}
DEFAULT_CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
DEFAULT_DRIVE_FOLDER_ID = "YOUR_GOOGLE_DRIVE_FOLDER_ID"
DEFAULT_ALLOWED_EMAILS = {
    "your-email@example.com",
    "partner-email@example.com",
}
DEFAULT_HOUSEHOLD_ID = "shunwife-home"
FIRESTORE_COLLECTIONS = {
    "expenses": "expenses",
    "transfers": "transfers",
    "childTransactions": "childTransactions",
    "householdIncomes": "householdIncomes",
}
AUTH_SESSION_COLLECTION = "authSessions"
ACTIVITY_LOG_COLLECTION = "activityLogs"
AI_USAGE_LOG_COLLECTION = "aiUsageLogs"
PUSH_SUBSCRIPTION_COLLECTION = "pushSubscriptions"
SERIAL_KIND_PREFIX = {
    "expenses": "A",
    "transfers": "B",
    "childTransactions": "R",
    "householdIncomes": "I",
}
PATCHABLE_SHARED_SETTINGS_KEYS = {
    "categories",
    "otherPaymentMethods",
    "serialCounters",
    "dashboardBudgetConfig",
    "categoryMasterConfig",
    "settlementRules",
    "householdPoolConfig",
    "recurringTemplateConfig",
    "monthlyCloseConfig",
}

_firestore_project_id = None
_firestore_credentials = None
_storage_client = None
_drive_credentials = None
_google_request = google_auth_requests.Request()


def session_cookie_name() -> str:
    return str(os.environ.get("SESSION_COOKIE_NAME", "kakeibo_session")).strip() or "kakeibo_session"


def session_max_age_seconds() -> int:
    raw = str(os.environ.get("SESSION_COOKIE_MAX_AGE_SECONDS", "")).strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = 14 * 24 * 60 * 60
    return max(value, 60)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_iso_datetime(value: Any) -> datetime | None:
    normalized = str(value or "").strip()
    if not normalized:
        return None
    try:
        parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


class SharedSettingsConflictError(RuntimeError):
    def __init__(self, current_settings: dict[str, Any]):
        super().__init__("Shared settings were updated on another device.")
        self.current_settings = current_settings


def allowed_origins() -> set[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    origins = {origin.strip() for origin in raw.split(",") if origin.strip()}
    frontend_origin = str(os.environ.get("FRONTEND_ORIGIN", "")).strip()
    if frontend_origin:
        origins.add(frontend_origin)
    return origins


def allowed_emails() -> set[str]:
    raw = os.environ.get("ALLOWED_EMAILS", "")
    if not raw.strip():
        return set(DEFAULT_ALLOWED_EMAILS)
    return {email.strip() for email in raw.split(",") if email.strip()}


def google_client_id() -> str:
    return os.environ.get("GOOGLE_CLIENT_ID", DEFAULT_CLIENT_ID)


def household_id() -> str:
    return os.environ.get("HOUSEHOLD_ID", DEFAULT_HOUSEHOLD_ID)


def firestore_project_id() -> str:
    global _firestore_project_id, _firestore_credentials
    if _firestore_project_id is None:
        credentials, project_id = google.auth.default(
            scopes=["https://www.googleapis.com/auth/datastore"]
        )
        _firestore_credentials = credentials
        _firestore_project_id = (
            project_id
            or os.environ.get("GOOGLE_CLOUD_PROJECT")
            or os.environ.get("GCP_PROJECT")
        )
    if not _firestore_project_id:
        raise RuntimeError("Firestore project ID could not be determined.")
    return _firestore_project_id


def firestore_credentials():
    global _firestore_credentials
    if _firestore_credentials is None:
        firestore_project_id()
    if not _firestore_credentials.valid:
        _firestore_credentials.refresh(_google_request)
    return _firestore_credentials


def firestore_headers() -> dict[str, str]:
    token = firestore_credentials().token
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def storage_client():
    global _storage_client
    if _storage_client is None:
        _storage_client = google_storage.Client(project=firestore_project_id())
    return _storage_client


def receipt_temp_bucket_name() -> str:
    return str(os.environ.get("RECEIPT_TEMP_BUCKET", "")).strip()


def receipt_temp_prefix() -> str:
    return str(os.environ.get("RECEIPT_TEMP_PREFIX", "receipt-temp")).strip().strip("/")


def receipt_permanent_prefix() -> str:
    return str(os.environ.get("RECEIPT_PERMANENT_PREFIX", "receipt-permanent")).strip().strip("/")


def receipt_temp_bucket():
    bucket_name = receipt_temp_bucket_name()
    if not bucket_name:
        raise RuntimeError("RECEIPT_TEMP_BUCKET is not configured.")
    bucket = storage_client().bucket(bucket_name)
    return bucket


def receipt_asset_object_name(asset_id: str) -> str:
    return f"{receipt_temp_prefix()}/{asset_id}"


def receipt_permanent_asset_object_name(asset_id: str) -> str:
    return f"{receipt_permanent_prefix()}/{asset_id}"


def drive_folder_id() -> str:
    return str(os.environ.get("DRIVE_SHARED_FOLDER_ID", DEFAULT_DRIVE_FOLDER_ID)).strip()


def drive_credentials():
    global _drive_credentials
    if _drive_credentials is None:
        credentials, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/drive"]
        )
        _drive_credentials = credentials
    if not _drive_credentials.valid:
        _drive_credentials.refresh(_google_request)
    return _drive_credentials


def drive_runtime_service_account_email() -> str:
    explicit = str(os.environ.get("DRIVE_SERVICE_ACCOUNT_EMAIL", "")).strip()
    if explicit:
        return explicit
    credentials = drive_credentials()
    return str(
        getattr(credentials, "service_account_email", "")
        or os.environ.get("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")
    ).strip()


def firestore_base_url() -> str:
    project_id = firestore_project_id()
    return (
        "https://firestore.googleapis.com/v1/projects/"
        f"{project_id}/databases/(default)/documents"
    )


def firestore_doc_url(*segments: str) -> str:
    encoded_segments = [quote(segment, safe="") for segment in segments]
    return f"{firestore_base_url()}/{'/'.join(encoded_segments)}"


def firestore_parent_resource(*segments: str) -> str:
    encoded_segments = [quote(segment, safe="") for segment in segments]
    base = f"projects/{firestore_project_id()}/databases/(default)/documents"
    if not encoded_segments:
        return base
    return f"{base}/{'/'.join(encoded_segments)}"


def firestore_run_query_url(*parent_segments: str) -> str:
    parent = firestore_parent_resource(*parent_segments)
    return f"https://firestore.googleapis.com/v1/{parent}:runQuery"


def encode_firestore_value(value: Any) -> dict[str, Any]:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, str):
        return {"stringValue": value}
    if isinstance(value, list):
        return {
            "arrayValue": {
                "values": [encode_firestore_value(item) for item in value]
            }
        }
    if isinstance(value, dict):
        return {
            "mapValue": {
                "fields": {
                    key: encode_firestore_value(val)
                    for key, val in value.items()
                }
            }
        }
    return {"stringValue": str(value)}


def decode_firestore_value(value: dict[str, Any]) -> Any:
    if "nullValue" in value:
        return None
    if "booleanValue" in value:
        return value["booleanValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "stringValue" in value:
        return value["stringValue"]
    if "arrayValue" in value:
        return [
            decode_firestore_value(item)
            for item in value.get("arrayValue", {}).get("values", [])
        ]
    if "mapValue" in value:
        return {
            key: decode_firestore_value(val)
            for key, val in value.get("mapValue", {}).get("fields", {}).items()
        }
    if "timestampValue" in value:
        return value["timestampValue"]
    return None


def encode_firestore_document(payload: dict[str, Any]) -> dict[str, Any]:
    return {
        "fields": {
            key: encode_firestore_value(value)
            for key, value in payload.items()
        }
    }


def decode_firestore_document(document: dict[str, Any]) -> dict[str, Any]:
    fields = document.get("fields", {})
    return {
        key: decode_firestore_value(value)
        for key, value in fields.items()
    }


def list_firestore_documents(collection_name: str) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    next_page_token = ""
    while True:
        params = {"pageSize": 100}
        if next_page_token:
            params["pageToken"] = next_page_token
        response = requests.get(
            firestore_doc_url("households", household_id(), collection_name),
            headers=firestore_headers(),
            params=params,
            timeout=30,
        )
        if response.status_code == 404:
            return documents
        response.raise_for_status()
        payload = response.json()
        documents.extend(payload.get("documents", []))
        next_page_token = payload.get("nextPageToken", "")
        if not next_page_token:
            break
    return documents


def build_field_filter(field_path: str, op: str, value: Any) -> dict[str, Any]:
    return {
        "fieldFilter": {
            "field": {"fieldPath": field_path},
            "op": op,
            "value": encode_firestore_value(value),
        }
    }


def run_household_collection_query(
    collection_name: str,
    order_by: list[tuple[str, str]] | None = None,
    limit: int | None = None,
    start_after: list[Any] | None = None,
    filters: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    structured_query: dict[str, Any] = {
        "from": [{"collectionId": collection_name}],
    }
    if filters:
        if len(filters) == 1:
            structured_query["where"] = filters[0]
        else:
            structured_query["where"] = {
                "compositeFilter": {
                    "op": "AND",
                    "filters": filters,
                }
            }
    if order_by:
        structured_query["orderBy"] = [
            {
                "field": {"fieldPath": field_path},
                "direction": direction,
            }
            for field_path, direction in order_by
        ]
    if limit:
        structured_query["limit"] = int(limit)
    if start_after:
        structured_query["startAt"] = {
            "before": False,
            "values": [encode_firestore_value(value) for value in start_after],
        }
    response = requests.post(
        firestore_run_query_url("households", household_id()),
        headers=firestore_headers(),
        json={"structuredQuery": structured_query},
        timeout=30,
    )
    if response.status_code == 404:
        return []
    response.raise_for_status()
    payload = response.json()
    if not isinstance(payload, list):
        return []
    return [item["document"] for item in payload if isinstance(item, dict) and item.get("document")]


def is_missing_index_error(error: Exception) -> bool:
    response = getattr(error, "response", None)
    if response is not None:
        status_code = getattr(response, "status_code", None)
        # 400 Bad Request はインデックス不足・クエリ不正を含む。全てフォールバック対象とする
        if status_code == 400:
            return True
    return "requires an index" in str(error).lower()


def decode_query_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for document in documents:
        value = decode_firestore_document(document)
        value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
        rows.append(value)
    return rows


def parse_page_cursor(raw_value: str) -> list[Any]:
    value = str(raw_value or "").strip()
    if not value:
        return []
    try:
        decoded = base64.urlsafe_b64decode(f"{value}==").decode("utf-8")
        payload = json.loads(decoded)
        if isinstance(payload, list):
            return payload
    except Exception:
        return []
    return []


def encode_page_cursor(values: list[Any]) -> str:
    encoded = json.dumps(values, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(encoded).decode("ascii").rstrip("=")


def to_number(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def round_tax_included_amount(base_amount: float, tax_rate: float) -> int:
    return int(round(base_amount * (100 + tax_rate) / 100))


def normalize_tax_included_basis(value: Any) -> str:
    normalized = str(value or "").strip()
    return normalized if normalized in {"receipt_explicit", "calculated", "unknown"} else ""


def normalize_amount_type(value: Any) -> str:
    normalized = str(value or "").strip()
    return normalized if normalized in {"tax_included", "tax_excluded", "unknown"} else ""


def normalize_confidence(value: Any) -> str:
    normalized = str(value or "").strip().lower()
    return normalized if normalized in {"high", "medium", "low"} else ""


def derive_tax_included_amount(item: dict[str, Any]) -> int | None:
    tax_included_amount = to_number(item.get("taxIncludedAmount"))
    if tax_included_amount not in (None, 0):
        return int(round(tax_included_amount))

    amount_type = normalize_amount_type(item.get("amountType"))
    current_amount = to_number(item.get("amount"))
    raw_amount = to_number(item.get("rawAmount"))
    if amount_type == "tax_included":
        explicit_amount = raw_amount if raw_amount not in (None, 0) else current_amount
        if explicit_amount not in (None, 0):
            return int(round(explicit_amount))

    tax_excluded_amount = to_number(item.get("taxExcludedAmount"))
    tax_rate = to_number(item.get("taxRate"))
    quantity = to_number(item.get("quantity")) or 1
    if tax_excluded_amount in (None, 0) and amount_type == "tax_excluded":
        tax_excluded_amount = raw_amount if raw_amount not in (None, 0) else current_amount

    if tax_excluded_amount not in (None, 0) and tax_rate is not None and tax_rate >= 0:
        if quantity > 1 and current_amount is not None:
            base_amount = (
                tax_excluded_amount * quantity
                if abs(current_amount - (tax_excluded_amount * quantity)) <= abs(current_amount - tax_excluded_amount)
                else tax_excluded_amount
            )
        elif quantity > 1 and current_amount is None:
            base_amount = tax_excluded_amount * quantity
        else:
            base_amount = tax_excluded_amount
        return round_tax_included_amount(base_amount, tax_rate)

    return None


def build_tax_summary_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    summaries: dict[str, dict[str, Any]] = {}
    for item in items:
        tax_included_amount = to_number(item.get("taxIncludedAmount"))
        if tax_included_amount in (None, 0):
            continue
        tax_rate = to_number(item.get("taxRate"))
        key = "unknown" if tax_rate is None else str(int(tax_rate) if float(tax_rate).is_integer() else tax_rate)
        if key not in summaries:
            summaries[key] = {
                "taxRate": None if tax_rate is None else int(tax_rate) if float(tax_rate).is_integer() else tax_rate,
                "taxIncludedTotal": 0,
                "taxableSubtotal": None,
                "taxAmount": None,
                "basis": normalize_tax_included_basis(item.get("taxIncludedAmountBasis")) or "receipt_explicit",
            }
        summaries[key]["taxIncludedTotal"] += int(round(tax_included_amount))
        if summaries[key]["basis"] != "calculated" and normalize_tax_included_basis(item.get("taxIncludedAmountBasis")) == "calculated":
            summaries[key]["basis"] = "calculated"
        if summaries[key]["basis"] not in {"receipt_explicit", "calculated"}:
            summaries[key]["basis"] = normalize_tax_included_basis(item.get("taxIncludedAmountBasis")) or "unknown"
    return list(summaries.values())


def format_receipt_item_memo_amount(value: Any) -> str:
    amount = to_number(value)
    if amount is None:
        return ""
    rounded = int(round(amount))
    return f"{rounded:,}円"


def build_receipt_items_memo(items: list[Any]) -> str:
    lines = ["商品明細:"]
    for item in items[:30]:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or item.get("storeName") or item.get("memo") or "").strip()
        if not name:
            name = "不明"
        amount_text = (
            format_receipt_item_memo_amount(item.get("taxIncludedAmount"))
            or format_receipt_item_memo_amount(item.get("amount"))
            or format_receipt_item_memo_amount(item.get("rawAmount"))
        )
        quantity = to_number(item.get("quantity"))
        quantity_text = ""
        if quantity not in (None, 0, 1):
            quantity_text = f" x{int(quantity) if float(quantity).is_integer() else quantity:g}"
        confidence_text = " (不確実)" if normalize_confidence(item.get("confidence")) == "low" else ""
        line_parts = [name[:80]]
        if amount_text:
            line_parts.append(amount_text)
        if quantity_text:
            line_parts.append(quantity_text.strip())
        lines.append(f"- {' '.join(line_parts)}{confidence_text}")
    return "\n".join(lines) if len(lines) > 1 else ""


def ensure_receipt_items_memo(result: dict[str, Any]) -> dict[str, Any]:
    items = result.get("items")
    if not isinstance(items, list) or not items:
        return result
    memo = str(result.get("memo") or "").strip()
    item_memo = build_receipt_items_memo(items)
    if not item_memo:
        return result
    if not memo:
        result["memo"] = item_memo
        return result
    if "商品明細" not in memo:
        result["memo"] = f"{memo}\n{item_memo}"
    return result


def normalize_receipt_result_amounts(result: dict[str, Any], source_type: str) -> dict[str, Any]:
    items = result.get("items")
    if not isinstance(items, list):
        return result

    normalized_items: list[dict[str, Any]] = []
    for raw_item in items:
        if not isinstance(raw_item, dict):
            normalized_items.append(raw_item)
            continue
        item = dict(raw_item)
        item_name = str(item.get("name") or item.get("storeName") or item.get("memo") or "").strip()
        if item_name:
            item["name"] = item_name
            item["storeName"] = str(item.get("storeName") or item_name).strip()
        if normalize_confidence(item.get("confidence")):
            item["confidence"] = normalize_confidence(item.get("confidence"))
        basis = normalize_tax_included_basis(item.get("taxIncludedAmountBasis"))
        amount_type = normalize_amount_type(item.get("amountType"))
        derived_tax_included = derive_tax_included_amount(item)
        current_amount = to_number(item.get("amount"))
        raw_amount = to_number(item.get("rawAmount"))
        tax_excluded_amount = to_number(item.get("taxExcludedAmount"))
        tax_included_amount = to_number(item.get("taxIncludedAmount"))
        if raw_amount is None and current_amount not in (None, 0):
            item["rawAmount"] = int(round(current_amount))
        if not amount_type:
            if tax_included_amount not in (None, 0):
                amount_type = "tax_included"
            elif tax_excluded_amount not in (None, 0):
                amount_type = "tax_excluded"
            else:
                amount_type = "unknown"
            item["amountType"] = amount_type
        if derived_tax_included is not None:
            item["taxIncludedAmount"] = derived_tax_included
            item["taxIncludedAmountBasis"] = basis or ("calculated" if tax_excluded_amount not in (None, 0) else "receipt_explicit")
            if current_amount in (None, 0) or (
                tax_excluded_amount not in (None, 0)
                and abs(current_amount - tax_excluded_amount) < abs(current_amount - derived_tax_included)
            ):
                item["amount"] = derived_tax_included
        elif not basis:
            item["taxIncludedAmountBasis"] = "unknown"
        normalized_items.append(item)

    result["items"] = normalized_items
    if not isinstance(result.get("taxSummary"), list) or not result.get("taxSummary"):
        result["taxSummary"] = build_tax_summary_from_items([item for item in normalized_items if isinstance(item, dict)])
    if not isinstance(result.get("memoWarnings"), list):
        result["memoWarnings"] = []
    result = ensure_receipt_items_memo(result)
    return result


def month_range_bounds(month_value: str) -> tuple[str, str]:
    year, month = str(month_value or "").split("-")
    base = datetime(int(year), int(month), 1)
    if base.month == 12:
        next_month = datetime(base.year + 1, 1, 1)
    else:
        next_month = datetime(base.year, base.month + 1, 1)
    return base.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d")


def current_month_bounds() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, 1)
    if start.month == 12:
        next_month = datetime(start.year + 1, 1, 1)
    else:
        next_month = datetime(start.year, start.month + 1, 1)
    return start.strftime("%Y-%m-%d"), next_month.strftime("%Y-%m-%d")


def recent_month_keys(count: int) -> list[str]:
    now = datetime.now(timezone.utc)
    keys: list[str] = []
    for index in range(count - 1, -1, -1):
        month_number = now.month - index
        year = now.year
        while month_number <= 0:
            month_number += 12
            year -= 1
        keys.append(f"{year}-{month_number:02d}")
    return keys


def build_expense_overview() -> dict[str, Any]:
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    current_year = datetime.now(timezone.utc).strftime("%Y")
    recent_months = recent_month_keys(6)
    earliest_month = recent_months[0]
    current_month_start, next_month_start = current_month_bounds()
    current_year_start = f"{current_year}-01-01"
    earliest_month_start, _ = month_range_bounds(earliest_month)
    query_start = min(current_year_start, earliest_month_start)
    filters = [
        build_field_filter("date", "GREATER_THAN_OR_EQUAL", query_start),
        build_field_filter("date", "LESS_THAN", next_month_start),
    ]
    try:
        rows = decode_query_documents(
            run_household_collection_query(
                FIRESTORE_COLLECTIONS["expenses"],
                order_by=[("date", "ASCENDING"), ("updatedAt", "ASCENDING"), ("id", "ASCENDING")],
                filters=filters,
            )
        )
    except Exception as error:
        if not is_missing_index_error(error):
            raise
        rows = [
            item for item in load_all_expenses()
            if query_start <= str(item.get("date") or "") < next_month_start
        ]
        rows.sort(
            key=lambda item: (
                str(item.get("date") or ""),
                str(item.get("updatedAt") or item.get("createdAt") or ""),
                str(item.get("id") or ""),
            )
        )
    monthly_total = 0
    yearly_total = 0
    recent_month_totals = {month: 0 for month in recent_months}
    for item in rows:
        amount = float(item.get("amount") or 0)
        date_value = str(item.get("date") or "")
        month_key = date_value[:7]
        if date_value.startswith(current_month):
            monthly_total += amount
        if date_value.startswith(current_year):
            yearly_total += amount
        if month_key in recent_month_totals and str(item.get("personalExpense") or "family") == "family":
            recent_month_totals[month_key] += amount
    return {
        "currentMonth": current_month,
        "currentYear": current_year,
        "monthlyTotal": monthly_total,
        "yearlyTotal": yearly_total,
        "recentMonths": [
            {"month": month, "total": recent_month_totals.get(month, 0)}
            for month in recent_months
        ],
    }


def load_expense_list_page(limit: int = 25, cursor: str = "", month_filter: str = "") -> dict[str, Any]:
    safe_limit = max(1, min(int(limit or 25), 100))
    filters: list[dict[str, Any]] = []
    if re.fullmatch(r"\d{4}-\d{2}", str(month_filter or "").strip()):
        month_start, next_month_start = month_range_bounds(str(month_filter).strip())
        filters.extend(
            [
                build_field_filter("date", "GREATER_THAN_OR_EQUAL", month_start),
                build_field_filter("date", "LESS_THAN", next_month_start),
            ]
        )
    cursor_values = parse_page_cursor(cursor)
    try:
        documents = run_household_collection_query(
            FIRESTORE_COLLECTIONS["expenses"],
            order_by=[("createdAt", "DESCENDING"), ("id", "DESCENDING")],
            limit=safe_limit + 1,
            start_after=cursor_values or None,
            filters=filters,
        )
        rows = decode_query_documents(documents)
    except Exception as error:
        if not is_missing_index_error(error):
            raise
        rows = load_all_expenses()
        if filters:
            rows = [
                item for item in rows
                if month_start <= str(item.get("date") or "") < next_month_start
            ]
        if cursor_values and len(cursor_values) >= 2:
            cursor_created = str(cursor_values[0] or "")
            cursor_id = str(cursor_values[1] or "")
            rows = [
                item for item in rows
                if (
                    str(item.get("createdAt") or item.get("updatedAt") or ""),
                    str(item.get("id") or ""),
                ) < (cursor_created, cursor_id)
            ]
        rows.sort(
            key=lambda item: (
                str(item.get("createdAt") or item.get("updatedAt") or ""),
                str(item.get("id") or ""),
            ),
            reverse=True,
        )
    has_more = len(rows) > safe_limit
    visible_rows = rows[:safe_limit]
    next_cursor = ""
    if has_more and visible_rows:
        last_item = visible_rows[-1]
        next_cursor = encode_page_cursor([
            str(last_item.get("createdAt") or last_item.get("updatedAt") or ""),
            str(last_item.get("id") or ""),
        ])
    return {
        "records": visible_rows,
        "nextCursor": next_cursor,
        "hasMore": has_more,
        "limit": safe_limit,
        "month": str(month_filter or "").strip(),
    }


def load_all_expenses() -> list[dict[str, Any]]:
    rows = []
    for document in list_firestore_documents(FIRESTORE_COLLECTIONS["expenses"]):
        value = decode_firestore_document(document)
        value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
        rows.append(value)
    rows.sort(key=lambda item: (str(item.get("date", "")), str(item.get("updatedAt", item.get("createdAt", ""))), str(item.get("id", ""))), reverse=True)
    return rows


DEFAULT_CATEGORY_MASTER_CONFIG = {
    "version": 6,
    "categories": [
      { "code": "food", "label": "食料品", "active": True, "sortOrder": 10, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "food" },
      { "code": "dining_out", "label": "外食費", "active": True, "sortOrder": 20, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "dining_out" },
      { "code": "daily_goods", "label": "日用品", "active": True, "sortOrder": 30, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "daily_goods" },
      { "code": "child_child_special", "label": "育児特別費", "active": True, "sortOrder": 40, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "child_child_special" },
      { "code": "medical", "label": "医療費", "active": True, "sortOrder": 50, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "medical_regular" },
      { "code": "car_fuel", "label": "ガソリン代", "active": True, "sortOrder": 60, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_fuel" },
      { "code": "housing_rent", "label": "家賃", "active": True, "sortOrder": 70, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "housing_rent" },
      { "code": "utilities_home", "label": "電気・ガス", "active": True, "sortOrder": 80, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utilities_home" },
      { "code": "utility_water", "label": "水道代", "active": True, "sortOrder": 100, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utility_water" },
      { "code": "communication_mobile", "label": "携帯代", "active": True, "sortOrder": 110, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total" },
      { "code": "communication_internet", "label": "ネット回線", "active": True, "sortOrder": 120, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total" },
      { "code": "car_loan", "label": "自動車ローン", "active": True, "sortOrder": 130, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_loan" },
      { "code": "home_appliance_home_improvement", "label": "家電・家具・住環境整備", "active": True, "sortOrder": 140, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement" },
      { "code": "event_travel_gift", "label": "交際・宿泊・イベント", "active": True, "sortOrder": 150, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift" },
      { "code": "vehicle_maintenance_total", "label": "車両維持費", "active": True, "sortOrder": 160, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "vehicle_maintenance_total" },
      { "code": "hometown_tax", "label": "ふるさと納税", "active": True, "sortOrder": 180, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "hometown_tax" },
      { "code": "fixed_cost", "label": "固定費", "active": True, "sortOrder": 200, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement" },
      { "code": "hobby", "label": "娯楽費", "active": True, "sortOrder": 210, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift" },
      { "code": "car_parking_toll", "label": "駐車場・高速代", "active": True, "sortOrder": 220, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_parking_toll" },
      { "code": "other", "label": "その他", "active": True, "sortOrder": 240, "bucket": "uncategorized", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "other" }
    ]
}

CATEGORY_CODE_MAP = {
    "食料品": "food",
    "日用品": "daily_goods",
    "外食費": "dining_out",
    "医療費": "medical",
    "娯楽費": "hobby",
    "家電・家具・住環境整備": "home_appliance_home_improvement",
    "子供日常費": "daily_goods",
    "育児日常費": "daily_goods",
    "子供費用": "daily_goods",
    "旧: 子供費用": "daily_goods",
    "child_child_daily": "daily_goods",
    "child_child_expense": "daily_goods",
    "子供特別費": "child_child_special",
    "育児特別費": "child_child_special",
    "その他": "other",
    "固定費": "fixed_cost",
    "交際・宿泊・イベント": "event_travel_gift",
    "ふるさと納税": "hometown_tax",
    "出産・妊婦健診医療": "medical",
    "家賃": "housing_rent",
    "電気・ガス": "utilities_home",
    "電気代": "utilities_home",
    "ガス代": "utilities_home",
    "水道代": "utility_water",
    "携帯代": "communication_mobile",
    "ネット回線": "communication_internet",
    "自動車ローン": "car_loan",
    "ガソリン代": "car_fuel",
    "駐車場・高速代": "car_parking_toll",
    "車整備": "vehicle_maintenance_total",
    "車保険": "vehicle_maintenance_total",
    "自動車税": "vehicle_maintenance_total",
    "車両維持費": "vehicle_maintenance_total",
}


def load_ai_usage_logs() -> list[dict[str, Any]]:
    rows = []
    for document in list_firestore_documents(AI_USAGE_LOG_COLLECTION):
        value = decode_firestore_document(document)
        value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
        rows.append(value)
    rows.sort(key=lambda item: str(item.get("timestamp", "")), reverse=True)
    return rows


def to_year_month(date_str: str) -> str:
    if not date_str:
        return ""
    return date_str[:7] if len(date_str) >= 7 else date_str


def make_stable_code(text: str, prefix: str) -> str:
    raw = str(text or "").strip().lower()
    import re
    import unicodedata
    normalized = unicodedata.normalize("NFKD", raw)
    ascii_val = "".join([c for c in normalized if ord(c) < 128])
    ascii_clean = re.sub(r'[^a-z0-9]+', '_', ascii_val).strip('_')
    if ascii_clean:
        return f"{prefix}_{ascii_clean}"
    h = 0
    for char in raw:
        h = ((h * 31) + ord(char)) & 0xFFFFFFFF
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    base36 = ""
    while h > 0:
        h, i = divmod(h, 36)
        base36 = chars[i] + base36
    return f"{prefix}_{base36 or 'item'}"


def get_category_code(category: str) -> str:
    return CATEGORY_CODE_MAP.get(category) or make_stable_code(category, "custom")


def get_payment_method_label(item: dict[str, Any]) -> str:
    method = item.get("paymentMethod", "")
    other_method = item.get("otherPaymentMethod", "")
    method_labels = {
        "husband_card": "夫カード",
        "wife_card": "妻カード",
        "husband_other": "夫その他",
        "wife_other": "妻その他",
        "family_card": "夫カード（旧互換）",
        "husband_cash": "夫その他（現金・旧互換）",
        "wife_cash": "妻その他（現金・旧互換）",
    }
    label = method_labels.get(method) or method
    if method in ("other", "husband_other", "wife_other") and other_method:
        return f"{label}({other_method})"
    return label


def get_personal_expense_label(code: str) -> str:
    labels = {
        "family": "家計費",
        "husband": "夫",
        "wife": "妻",
        "child": "子供",
    }
    return labels.get(code or "family", "家計費")


def get_actual_payer_estimated(item: dict[str, Any]) -> str:
    billing_target = str(item.get("billingTarget") or "").strip()
    payment_method = str(item.get("paymentMethod") or "").strip()
    if billing_target == "husband_card":
        return "husband"
    if billing_target == "wife_card":
        return "wife"
    if billing_target == "other":
        return "other"
    if payment_method in ("husband_card", "husband_cash", "husband_other", "family_card"):
        return "husband"
    if payment_method in ("wife_card", "wife_cash", "wife_other"):
        return "wife"
    if payment_method == "other":
        return "other"
    return item.get("payer", "")


def get_settlement_bucket(item: dict[str, Any]) -> str:
    billing_target = str(item.get("billingTarget") or "").strip()
    personal_expense = str(item.get("personalExpense") or "").strip()
    if billing_target == "other":
        return "exclude_other_billing"
    if personal_expense == "husband":
        return "personal_husband"
    if personal_expense == "wife":
        return "personal_wife"
    if personal_expense == "child":
        return "child_child"
    return "family_shared"


def build_expense_export_rows(expenses: list[dict[str, Any]]) -> list[list[Any]]:
    headers = [
        "expense_id", "date", "year_month", "store_name", "amount",
        "category_label", "category_code", "payer_label", "payer_code",
        "payment_method_label", "payment_method_code", "billing_target_label",
        "billing_target_code", "is_family_card", "personal_expense_label",
        "personal_expense_code", "actual_payer_estimated", "settlement_bucket",
        "receipt_url", "receipt_file_id", "memo", "created_by", "created_at", "updated_at",
        "receipt_group_id", "receipt_line_index", "gross_amount", "point_credit", "net_amount", "serial_code",
        "source_type", "source_template_id", "source_template_label", "receipt_asset_count", "receipt_asset_urls", "receipt_asset_statuses",
    ]
    rows = [headers]
    for item in expenses:
        is_fam_card = "FALSE"
        payment_method = item.get("paymentMethod", "")
        is_fam_flag = item.get("isFamilyCard")
        if payment_method == "family_card" or is_fam_flag is True or str(is_fam_flag).lower() == "true":
            is_fam_card = "TRUE"
        receipt_assets = item.get("receiptAssets") or []
        if not isinstance(receipt_assets, list):
            receipt_assets = []
        payer_code = item.get("payer", "")
        payer_label = "夫" if payer_code == "husband" else ("妻" if payer_code == "wife" else payer_code)
        billing_target = item.get("billingTarget", "")
        billing_labels = {"husband_card": "夫カード", "wife_card": "妻カード", "none": "なし", "other": "その他"}
        billing_label = billing_labels.get(billing_target, billing_target)
        asset_urls = []
        asset_statuses = []
        for asset in receipt_assets:
            url = asset.get("driveUrl") or asset.get("storageUrl") or ""
            if url:
                asset_urls.append(url)
            status = asset.get("status") or ""
            if status:
                asset_statuses.append(status)
        rows.append([
            item.get("id") or "",
            item.get("date") or "",
            to_year_month(item.get("date") or ""),
            item.get("storeName") or "",
            int(item.get("amount") or 0),
            item.get("category") or "",
            get_category_code(item.get("category") or ""),
            payer_label,
            payer_code,
            get_payment_method_label(item),
            payment_method,
            billing_label,
            billing_target,
            is_fam_card,
            get_personal_expense_label(item.get("personalExpense")),
            item.get("personalExpense") or "family",
            get_actual_payer_estimated(item),
            get_settlement_bucket(item),
            item.get("receiptUrl") or "",
            item.get("receiptFileId") or "",
            item.get("memo") or "",
            item.get("createdBy") or "",
            item.get("createdAt") or "",
            item.get("updatedAt") or "",
            item.get("receiptGroupId") or "",
            item.get("receiptLineIndex") or "",
            int(item.get("grossAmount") if item.get("grossAmount") is not None else (item.get("amount") or 0)),
            int(item.get("pointCredit") or 0),
            int(item.get("amount") or 0),
            item.get("serialCode") or "",
            item.get("sourceType") or "",
            item.get("sourceTemplateId") or "",
            item.get("sourceTemplateLabel") or "",
            len(receipt_assets),
            "\n".join(asset_urls),
            "\n".join(asset_statuses)
        ])
    return rows


def build_codebook_rows(categories: list[Any], settings: dict[str, Any]) -> list[list[Any]]:
    rows = [["domain", "code", "label", "description"]]
    payer_labels = {"husband": "夫", "wife": "妻"}
    for code, label in payer_labels.items():
        rows.append(["payer", code, label, "支払者コード"])
    payment_methods_codebook = [
        {"value": "husband_card", "label": "夫カード"},
        {"value": "wife_card", "label": "妻カード"},
        {"value": "husband_other", "label": "夫その他"},
        {"value": "wife_other", "label": "妻その他"},
        {"value": "family_card", "label": "夫カード（旧互換）"},
        {"value": "husband_cash", "label": "夫その他（現金・旧互換）"},
        {"value": "wife_cash", "label": "妻その他（現金・旧互換）"},
    ]
    for item in payment_methods_codebook:
        rows.append(["payment_method", item["value"], item["label"], "支払い手段コード"])
    billing_labels = {"husband_card": "夫カード", "wife_card": "妻カード", "none": "なし", "other": "その他"}
    for code, label in billing_labels.items():
        rows.append(["billing_target", code, label, "請求先コード"])
    personal_expense_labels = {"family": "家計費", "husband": "夫", "wife": "妻", "child": "子供"}
    for code, label in personal_expense_labels.items():
        rows.append(["personal_expense", code, label, "負担区分コード"])
    transfer_type_labels = {"transfer": "送金"}
    for code, label in transfer_type_labels.items():
        rows.append(["transfer_type", code, label, "送金種別"])
    transfer_settlement_scope_labels = {"private_lending": "個人間貸借", "household_pool": "家計費プール移動"}
    for code, label in transfer_settlement_scope_labels.items():
        rows.append(["transfer_settlement_scope", code, label, "送金の扱い"])
    child_kind_labels = {
        "income_birth": "出産祝い",
        "income_allowance": "児童手当",
        "income_other": "その他入金",
        "expense_daily": "日常費支出",
        "expense_medical": "医療費支出",
        "expense_other": "その他支出",
    }
    for code, label in child_kind_labels.items():
        rows.append(["child_kind", code, label, "子供入出金種別"])
    category_master_entries = DEFAULT_CATEGORY_MASTER_CONFIG["categories"]
    cat_config = settings.get("categoryMasterConfig")
    if cat_config and isinstance(cat_config, dict) and "categories" in cat_config:
        category_master_entries = cat_config["categories"]
    for entry in category_master_entries:
        code = entry.get("code", "")
        label = entry.get("label", "")
        bucket = entry.get("bucket", "")
        budget_mode = entry.get("budgetMode", "")
        scope = entry.get("settlementScope", "")
        rows.append(["category", code, label, f"bucket={bucket} / budget={budget_mode} / scope={scope}"])
    settlement_buckets = [
        ["family_shared", "家計共通", "家計費として夫婦集計"],
        ["personal_husband", "夫個人", "夫個人費"],
        ["personal_wife", "妻個人", "妻個人費"],
        ["child_child", "子供", "子供向け別財布"],
        ["exclude_other_billing", "請求先その他除外", "請求先その他で精算対象外"],
    ]
    for code, label, description in settlement_buckets:
        rows.append(["settlement_bucket", code, label, description])
    return rows


def build_monthly_summary_rows(expenses: list[dict[str, Any]]) -> list[list[Any]]:
    summary = {}
    for item in expenses:
        year_month = to_year_month(item.get("date") or "")
        actual_payer = get_actual_payer_estimated(item)
        bucket = get_settlement_bucket(item)
        key = f"{year_month}__{actual_payer}__{bucket}"
        if key not in summary:
            summary[key] = {
                "yearMonth": year_month,
                "actualPayer": actual_payer,
                "bucket": bucket,
                "count": 0,
                "amount": 0
            }
        entry = summary[key]
        entry["count"] += 1
        entry["amount"] += int(item.get("amount") or 0)
    rows = [["year_month", "actual_payer_estimated", "settlement_bucket", "expense_count", "amount_total"]]
    sorted_keys = sorted(summary.keys(), key=lambda k: (summary[k]["yearMonth"], summary[k]["actualPayer"], summary[k]["bucket"]))
    for key in sorted_keys:
        entry = summary[key]
        rows.append([
            entry["yearMonth"],
            entry["actualPayer"],
            entry["bucket"],
            entry["count"],
            entry["amount"]
        ])
    return rows


def build_settlement_rule_rows(rules: dict[str, Any]) -> list[list[Any]]:
    monthly_contrib = rules.get("monthlyContribution") or {}
    bonus_contrib = rules.get("bonusContribution") or {}
    monthly_overrides = rules.get("monthlyOverrides") or {}
    husband_monthly = int(monthly_contrib.get("husband") if monthly_contrib.get("husband") is not None else 130000)
    wife_monthly = int(monthly_contrib.get("wife") if monthly_contrib.get("wife") is not None else 130000)
    husband_bonus = bonus_contrib.get("husband") or {}
    wife_bonus = bonus_contrib.get("wife") or {}
    hb_06 = int(husband_bonus.get("06") if husband_bonus.get("06") is not None else 300000)
    hb_12 = int(husband_bonus.get("12") if husband_bonus.get("12") is not None else 300000)
    wb_06 = int(wife_bonus.get("06") if wife_bonus.get("06") is not None else 300000)
    wb_12 = int(wife_bonus.get("12") if wife_bonus.get("12") is not None else 300000)
    rows = [
        ["section", "key", "value"],
        ["monthlyContribution", "husband", husband_monthly],
        ["monthlyContribution", "wife", wife_monthly],
        ["bonusContribution", "husband_06", hb_06],
        ["bonusContribution", "husband_12", hb_12],
        ["bonusContribution", "wife_06", wb_06],
        ["bonusContribution", "wife_12", wb_12],
    ]
    sorted_overrides = sorted(monthly_overrides.items())
    for month_key, row in sorted_overrides:
        rows.append(["monthlyOverride", f"{month_key}_husband", int(row.get("husband") or 0)])
        rows.append(["monthlyOverride", f"{month_key}_wife", int(row.get("wife") or 0)])
    family_card_owner = rules.get("familyCardOwner") or "husband"
    include_transfers = rules.get("includeTransfersInSettlement")
    include_transfers_str = "TRUE" if (include_transfers is True or str(include_transfers).lower() == "true") else "FALSE"
    rows.append(["rule", "familyCardOwner", family_card_owner])
    rows.append(["rule", "includeTransfersInSettlement", include_transfers_str])
    rows.append(["rule", "notes", rules.get("notes") or ""])
    return rows


def get_months_in_range(start_month: str, end_month: str) -> list[str]:
    import datetime
    start_dt = datetime.datetime.strptime(start_month, "%Y-%m")
    end_dt = datetime.datetime.strptime(end_month, "%Y-%m")
    months = []
    curr = start_dt
    while curr <= end_dt:
        months.append(curr.strftime("%Y-%m"))
        if curr.month == 12:
            curr = curr.replace(year=curr.year + 1, month=1)
        else:
            curr = curr.replace(month=curr.month + 1)
    return months


def build_settlement_month_plan(rules: dict[str, Any], month_key: str) -> dict[str, Any]:
    monthly_contrib = rules.get("monthlyContribution") or {}
    bonus_contrib = rules.get("bonusContribution") or {}
    monthly_overrides = rules.get("monthlyOverrides") or {}
    husband_base = int(monthly_contrib.get("husband") if monthly_contrib.get("husband") is not None else 130000)
    wife_base = int(monthly_contrib.get("wife") if monthly_contrib.get("wife") is not None else 130000)
    month_num = month_key.split("-")[1]
    husband_bonus = bonus_contrib.get("husband") or {}
    wife_bonus = bonus_contrib.get("wife") or {}
    hb = int(husband_bonus.get(month_num) or 0)
    wb = int(wife_bonus.get(month_num) or 0)
    target_husband = husband_base + hb
    target_wife = wife_base + wb
    if month_key in monthly_overrides:
        override = monthly_overrides[month_key]
        if override.get("husband") is not None:
            target_husband = int(override["husband"])
        if override.get("wife") is not None:
            target_wife = int(override["wife"])
    return {
        "monthKey": month_key,
        "target": {
            "husband": target_husband,
            "wife": target_wife,
            "total": target_husband + target_wife
        }
    }


def get_settlement_family_payer(item: dict[str, Any], rules: dict[str, Any]) -> str:
    billing_target = str(item.get("billingTarget") or "").strip()
    payment_method = str(item.get("paymentMethod") or "").strip()
    payer = str(item.get("payer") or "").strip()
    if billing_target == "husband_card":
        return "husband"
    if billing_target == "wife_card":
        return "wife"
    if payment_method == "family_card":
        return rules.get("familyCardOwner") or "husband"
    if payment_method in ("husband_card", "husband_cash", "husband_other"):
        return "husband"
    if payment_method in ("wife_card", "wife_cash", "wife_other"):
        return "wife"
    return payer if payer in ("husband", "wife") else "husband"


def generate_settlement_report_rows(
    expenses: list[dict[str, Any]],
    transfers: list[dict[str, Any]],
    child_transactions: list[dict[str, Any]],
    household_incomes: list[dict[str, Any]],
    rules: dict[str, Any],
    pool_config: dict[str, Any],
    target_year: str
) -> list[list[Any]]:
    start_month = f"{target_year}-01"
    end_month = f"{target_year}-12"
    start_date = f"{start_month}-01"
    end_date = f"{end_month}-31"
    months = get_months_in_range(start_month, end_month)
    summary = {
        "husband": {"target": 0, "directPayments": 0, "householdDelta": 0},
        "wife": {"target": 0, "directPayments": 0, "householdDelta": 0}
    }
    monthly_breakdown = []
    for month_key in months:
        month_plan = build_settlement_month_plan(rules, month_key)
        summary["husband"]["target"] += month_plan["target"]["husband"]
        summary["wife"]["target"] += month_plan["target"]["wife"]
        monthly_breakdown.append(month_plan)
    family_expenses = [
        item for item in expenses
        if (item.get("personalExpense") or "family") == "family"
        and item.get("date")
        and start_date <= item["date"] <= end_date
    ]
    for item in family_expenses:
        payer = get_settlement_family_payer(item, rules)
        amount = int(item.get("amount") or 0)
        summary[payer]["directPayments"] += amount
    pool_opening = (pool_config.get("openingBalances") or {}).get(target_year) or {"husband": 0, "wife": 0}
    pool_summary = {
        "opening": {
            "husband": int(pool_opening.get("husband") or 0),
            "wife": int(pool_opening.get("wife") or 0),
            "total": int(pool_opening.get("husband") or 0) + int(pool_opening.get("wife") or 0)
        },
        "assumedContribution": {
            "husband": summary["husband"]["target"],
            "wife": summary["wife"]["target"],
            "total": summary["husband"]["target"] + summary["wife"]["target"]
        },
        "temporaryIncome": {"husband": 0, "wife": 0, "total": 0},
        "directPayments": {
            "husband": summary["husband"]["directPayments"],
            "wife": summary["wife"]["directPayments"],
            "total": summary["husband"]["directPayments"] + summary["wife"]["directPayments"]
        },
        "transferNet": {"husband": 0, "wife": 0},
        "currentBalance": {"husband": 0, "wife": 0, "total": 0}
    }
    pool_household_incomes = [
        item for item in household_incomes
        if item.get("date") and f"{target_year}-01-01" <= item["date"] <= end_date
    ]
    for item in pool_household_incomes:
        holder = "wife" if item.get("holder") == "wife" else "husband"
        amount = int(item.get("amount") or 0)
        pool_summary["temporaryIncome"][holder] += amount
        pool_summary["temporaryIncome"]["total"] += amount
    husband_to_wife_pool_total = 0
    wife_to_husband_pool_total = 0
    husband_to_wife_private_total = 0
    wife_to_husband_private_total = 0
    include_transfers_in_settlement = rules.get("includeTransfersInSettlement")
    include_transfers_in_settlement = include_transfers_in_settlement is True or str(include_transfers_in_settlement).lower() == "true"
    for item in transfers:
        amount = int(item.get("amount") or 0)
        date_val = item.get("date")
        if not amount or not date_val:
            continue
        scope = "household_pool" if item.get("settlementScope") == "household_pool" else "private_lending"
        if scope == "household_pool":
            if include_transfers_in_settlement and f"{target_year}-01-01" <= date_val <= end_date:
                if item.get("fromPerson") == "husband" and item.get("toPerson") == "wife":
                    husband_to_wife_pool_total += amount
                elif item.get("fromPerson") == "wife" and item.get("toPerson") == "husband":
                    wife_to_husband_pool_total += amount
        else:
            if f"{target_year}-01-01" <= date_val <= end_date:
                if item.get("fromPerson") == "husband" and item.get("toPerson") == "wife":
                    husband_to_wife_private_total += amount
                elif item.get("fromPerson") == "wife" and item.get("toPerson") == "husband":
                    wife_to_husband_private_total += amount
    pool_transfer_net_balance = wife_to_husband_pool_total - husband_to_wife_pool_total
    pool_summary["transferNet"]["husband"] = pool_transfer_net_balance
    pool_summary["transferNet"]["wife"] = -pool_transfer_net_balance
    pool_summary["currentBalance"]["husband"] = (
        pool_summary["opening"]["husband"] +
        pool_summary["assumedContribution"]["husband"] +
        pool_summary["temporaryIncome"]["husband"] -
        pool_summary["directPayments"]["husband"] +
        pool_summary["transferNet"]["husband"]
    )
    pool_summary["currentBalance"]["wife"] = (
        pool_summary["opening"]["wife"] +
        pool_summary["assumedContribution"]["wife"] +
        pool_summary["temporaryIncome"]["wife"] -
        pool_summary["directPayments"]["wife"] +
        pool_summary["transferNet"]["wife"]
    )
    pool_summary["currentBalance"]["total"] = pool_summary["currentBalance"]["husband"] + pool_summary["currentBalance"]["wife"]
    summary["husband"]["householdDelta"] = summary["husband"]["directPayments"] - summary["husband"]["target"]
    summary["wife"]["householdDelta"] = summary["wife"]["directPayments"] - summary["wife"]["target"]
    husband_delta = summary["husband"]["householdDelta"]
    wife_delta = summary["wife"]["householdDelta"]
    household_settlement = {"from": "", "to": "", "amount": 0, "description": "家計費だけで見ると、差額はありません。"}
    if husband_delta < 0 and wife_delta > 0:
        amount = int(round(min(abs(husband_delta), wife_delta)))
        household_settlement = {
            "from": "husband",
            "to": "wife",
            "amount": amount,
            "description": f"家計費だけで見ると、夫→妻 ¥{amount:,} が目安です。"
        }
    elif wife_delta < 0 and husband_delta > 0:
        amount = int(round(min(abs(wife_delta), husband_delta)))
        household_settlement = {
            "from": "wife",
            "to": "husband",
            "amount": amount,
            "description": f"家計費だけで見ると、妻→夫 ¥{amount:,} が目安です。"
        }
    final_balance_wife_to_husband = pool_transfer_net_balance
    final_settlement_description = "家計費プール残高として翌年へ繰り越す前提です。個人間貸借とは統合しません。"
    final_settlement = {"from": "", "to": "", "amount": 0, "description": final_settlement_description}
    if final_balance_wife_to_husband > 0:
        final_settlement = {
            "from": "wife",
            "to": "husband",
            "amount": int(round(final_balance_wife_to_husband)),
            "description": final_settlement_description
        }
    elif final_balance_wife_to_husband < 0:
        final_settlement = {
            "from": "husband",
            "to": "wife",
            "amount": int(round(abs(final_balance_wife_to_husband))),
            "description": final_settlement_description
        }
    def format_pool_holder_summary(balance_dict):
        h = balance_dict["husband"]
        w = balance_dict["wife"]
        if h > 0 and w > 0:
            return f"夫プール ¥{h:,} / 妻プール ¥{w:,}"
        if h > 0 and w < 0:
            return f"夫プール ¥{h:,} / 妻不足 -¥{abs(w):,}"
        if h < 0 and w > 0:
            return f"夫不足 -¥{abs(h):,} / 妻プール ¥{w:,}"
        return f"夫不足 -¥{abs(h):,} / 妻不足 -¥{abs(w):,}"
    raw_rows = [
        ["section", "label", "value1", "value2", "value3", "value4", "value5"],
        ["household", "husband", summary["husband"]["target"], summary["husband"]["directPayments"], summary["husband"]["householdDelta"], "", ""],
        ["household", "wife", summary["wife"]["target"], summary["wife"]["directPayments"], summary["wife"]["householdDelta"], "", ""],
        ["pool", "husband", pool_summary["opening"]["husband"], pool_summary["assumedContribution"]["husband"], pool_summary["temporaryIncome"]["husband"], pool_summary["directPayments"]["husband"], pool_summary["currentBalance"]["husband"]],
        ["pool", "wife", pool_summary["opening"]["wife"], pool_summary["assumedContribution"]["wife"], pool_summary["temporaryIncome"]["wife"], pool_summary["directPayments"]["wife"], pool_summary["currentBalance"]["wife"]],
        ["pool", "total", pool_summary["opening"]["total"], pool_summary["assumedContribution"]["total"], pool_summary["temporaryIncome"]["total"], pool_summary["directPayments"]["total"], pool_summary["currentBalance"]["total"]],
        ["household_pool_transfer", "husband_to_wife_total", husband_to_wife_pool_total, "", "", "", ""],
        ["household_pool_transfer", "wife_to_husband_total", wife_to_husband_pool_total, "", "", "", ""],
        ["household_pool_transfer", "net_transfer_balance", pool_transfer_net_balance, "", "", "", ""],
        ["private_lending_transfer", "husband_to_wife_total", husband_to_wife_private_total, "", "", "", ""],
        ["private_lending_transfer", "wife_to_husband_total", wife_to_husband_private_total, "", "", "", ""],
        ["private_lending_transfer", "net_transfer_balance", pool_transfer_net_balance, "", "", "", ""],
        ["final", "direction", final_settlement["from"], final_settlement["to"], final_settlement["amount"], "", ""],
        [],
        ["meta", "start_month", start_month],
        ["meta", "end_month", end_month],
        ["meta", "family_expense_total", sum(int(item.get("amount") or 0) for item in family_expenses)],
        ["meta", "temporary_income_total", pool_summary["temporaryIncome"]["total"]],
        ["meta", "pool_holder_summary", format_pool_holder_summary(pool_summary["currentBalance"])],
        ["meta", "household_settlement_description", household_settlement["description"]],
        ["meta", "final_recommendation", final_settlement["description"]],
    ]
    padded_rows = []
    for r in raw_rows:
        if len(r) < 7:
            padded_rows.append(r + [""] * (7 - len(r)))
        else:
            padded_rows.append(r)
    return padded_rows


def build_transfer_export_rows(transfers: list[dict[str, Any]]) -> list[list[Any]]:
    headers = [
        "date", "from_person", "to_person", "amount", "memo",
        "transfer_type", "settlement_scope", "transfer_id", "created_by", "created_at", "updated_at", "serial_code",
    ]
    rows = [headers]
    person_labels = {"husband": "夫", "wife": "妻"}
    scope_labels = {"private_lending": "個人間貸借", "household_pool": "家計費プール移動"}
    for item in transfers:
        from_p = item.get("fromPerson", "")
        to_p = item.get("toPerson", "")
        scope = item.get("settlementScope", "")
        rows.append([
            item.get("date") or "",
            person_labels.get(from_p) or from_p,
            person_labels.get(to_p) or to_p,
            int(item.get("amount") or 0),
            item.get("memo") or "",
            item.get("type") or "",
            scope_labels.get(scope) or "個人間貸借",
            item.get("id") or "",
            item.get("createdBy") or "",
            item.get("createdAt") or "",
            item.get("updatedAt") or "",
            item.get("serialCode") or "",
        ])
    return rows


def build_child_transaction_export_rows(records: list[dict[str, Any]]) -> list[list[Any]]:
    headers = [
        "child_transaction_id", "date", "kind_label", "kind_code", "source_or_from",
        "holder_label", "holder_code", "amount", "memo", "created_by", "created_at", "updated_at", "serial_code",
    ]
    rows = [headers]
    kind_labels = {
        "income_birth": "出産祝い",
        "income_allowance": "児童手当",
        "income_other": "その他入金",
        "expense_daily": "日常費支出",
        "expense_medical": "医療費支出",
        "expense_other": "その他支出",
    }
    person_labels = {"husband": "夫", "wife": "妻"}
    for item in records:
        kind = item.get("kind", "")
        holder = item.get("holder", "")
        rows.append([
            item.get("id") or "",
            item.get("date") or "",
            kind_labels.get(kind) or kind,
            kind,
            item.get("sourceOrFrom") or "",
            person_labels.get(holder) or holder,
            holder,
            int(item.get("amount") or 0),
            item.get("memo") or "",
            item.get("createdBy") or "",
            item.get("createdAt") or "",
            item.get("updatedAt") or "",
            item.get("serialCode") or "",
        ])
    return rows


def build_household_income_export_rows(records: list[dict[str, Any]]) -> list[list[Any]]:
    headers = [
        "household_income_id", "date", "kind_label", "kind_code", "source_name",
        "holder_label", "holder_code", "amount", "memo", "created_by", "created_at", "updated_at", "serial_code",
    ]
    rows = [headers]
    kind_labels = {
        "reimbursement": "戻し入れ・返金",
        "bonus": "臨時収入・ボーナス",
        "other": "その他",
    }
    person_labels = {"husband": "夫", "wife": "妻"}
    for item in records:
        kind = item.get("kind", "")
        holder = item.get("holder", "")
        rows.append([
            item.get("id") or "",
            item.get("date") or "",
            kind_labels.get(kind) or kind,
            kind,
            item.get("sourceName") or "",
            person_labels.get(holder) or holder,
            holder,
            int(item.get("amount") or 0),
            item.get("memo") or "",
            item.get("createdBy") or "",
            item.get("createdAt") or "",
            item.get("updatedAt") or "",
            item.get("serialCode") or "",
        ])
    return rows


def convert_rows_to_csv_string(rows: list[list[Any]]) -> str:
    csv_rows = []
    for row in rows:
        formatted_row = []
        for val in row:
            if val is None:
                text = ""
            else:
                text = str(val)
            escaped = text.replace('"', '""')
            formatted_row.append(f'"{escaped}"')
        csv_rows.append(",".join(formatted_row))
    return "\ufeff" + "\r\n".join(csv_rows)


def get_firestore_document(*segments: str) -> dict[str, Any] | None:
    response = requests.get(
        firestore_doc_url(*segments),
        headers=firestore_headers(),
        timeout=30,
    )
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response.json()


def put_firestore_document(payload: dict[str, Any], *segments: str) -> None:
    response = requests.patch(
        firestore_doc_url(*segments),
        headers=firestore_headers(),
        json=encode_firestore_document(payload),
        timeout=30,
    )
    response.raise_for_status()


def delete_firestore_document(*segments: str) -> None:
    response = requests.delete(
        firestore_doc_url(*segments),
        headers=firestore_headers(),
        timeout=30,
    )
    if response.status_code not in (200, 404):
        response.raise_for_status()


def verify_google_token_string(token: str) -> dict[str, Any]:
    token = str(token or "").strip()
    if not token:
        raise PermissionError("ID token is empty.")

    payload = id_token.verify_oauth2_token(
        token,
        _google_request,
        audience=google_client_id(),
    )
    email = str(payload.get("email", "")).strip().lower()
    if not email or email not in allowed_emails():
        raise PermissionError("This account is not allowed.")

    return {
        "email": email,
        "name": payload.get("name", ""),
    }


def verify_google_request() -> dict[str, Any]:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise PermissionError("Authorization header is required.")

    token = auth_header.split(" ", 1)[1].strip()
    return verify_google_token_string(token)


def auth_session_doc_segments(session_id: str) -> tuple[str, ...]:
    return ("households", household_id(), AUTH_SESSION_COLLECTION, session_id)


def create_auth_session(user: dict[str, Any]) -> dict[str, Any]:
    session_id = uuid.uuid4().hex
    now = utc_now()
    expires_at = now.timestamp() + session_max_age_seconds()
    payload = {
        "id": session_id,
        "email": str(user.get("email", "")).strip().lower(),
        "name": str(user.get("name", "") or user.get("email", "")).strip(),
        "provider": "google",
        "createdAt": now.isoformat(),
        "expiresAt": datetime.fromtimestamp(expires_at, tz=timezone.utc).isoformat(),
    }
    put_firestore_document(payload, *auth_session_doc_segments(session_id))
    return payload


def delete_auth_session(session_id: str) -> None:
    session_id = str(session_id or "").strip()
    if not session_id:
        return
    delete_firestore_document(*auth_session_doc_segments(session_id))


def get_auth_session(session_id: str) -> dict[str, Any] | None:
    session_id = str(session_id or "").strip()
    if not session_id:
        return None
    document = get_firestore_document(*auth_session_doc_segments(session_id))
    return decode_firestore_document(document) if document else None


def set_auth_session_cookie(response, session_id: str):
    response.set_cookie(
        session_cookie_name(),
        session_id,
        max_age=session_max_age_seconds(),
        httponly=True,
        secure=True,
        samesite="Lax",
        path="/",
    )
    return response


def clear_auth_session_cookie(response):
    response.set_cookie(
        session_cookie_name(),
        "",
        expires=0,
        max_age=0,
        httponly=True,
        secure=True,
        samesite="Lax",
        path="/",
    )
    return response


def build_session_user_payload(session_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": str(session_data.get("email", "")).strip().lower(),
        "name": str(session_data.get("name", "") or session_data.get("email", "")).strip(),
        "provider": "google",
        "authMethod": "cookie_session",
        "sessionId": str(session_data.get("id", "")).strip(),
        "sessionExpiresAt": str(session_data.get("expiresAt", "")).strip(),
    }


def build_session_meta_payload(session_data: dict[str, Any] | None) -> dict[str, Any]:
    data = session_data or {}
    return {
        "authMethod": "cookie_session",
        "expiresAt": str(data.get("expiresAt", "")).strip(),
        "sessionId": str(data.get("id", "")).strip(),
    }


def inspect_cookie_session() -> tuple[dict[str, Any] | None, dict[str, Any]]:
    session_id = str(request.cookies.get(session_cookie_name(), "")).strip()
    diagnostics = {
        "cookiePresent": bool(session_id),
        "sessionFound": False,
        "sessionValid": False,
        "expiresAt": "",
        "reason": "missing_cookie" if not session_id else "session_not_found",
    }
    if not session_id:
        return None, diagnostics
    session_data = get_auth_session(session_id)
    if not session_data:
        return None, diagnostics
    diagnostics["sessionFound"] = True
    diagnostics["expiresAt"] = str(session_data.get("expiresAt", "")).strip()
    expires_at = parse_iso_datetime(session_data.get("expiresAt"))
    if not expires_at or expires_at <= utc_now():
        try:
            delete_auth_session(session_id)
        except Exception:
            pass
        diagnostics["reason"] = "session_expired"
        return None, diagnostics
    email = str(session_data.get("email", "")).strip().lower()
    if not email or email not in allowed_emails():
        diagnostics["reason"] = "email_not_allowed"
        return None, diagnostics
    diagnostics["sessionValid"] = True
    diagnostics["reason"] = "authenticated"
    return build_session_user_payload(session_data), diagnostics


def inspect_header_session() -> tuple[dict[str, Any] | None, dict[str, Any]]:
    session_id = str(request.headers.get("X-Kakeibo-Session", "")).strip()
    diagnostics = {
        "headerPresent": bool(session_id),
        "sessionFound": False,
        "sessionValid": False,
        "expiresAt": "",
        "reason": "missing_header" if not session_id else "session_not_found",
    }
    if not session_id:
        return None, diagnostics
    session_data = get_auth_session(session_id)
    if not session_data:
        return None, diagnostics
    diagnostics["sessionFound"] = True
    diagnostics["expiresAt"] = str(session_data.get("expiresAt", "")).strip()
    expires_at = parse_iso_datetime(session_data.get("expiresAt"))
    if not expires_at or expires_at <= utc_now():
        try:
            delete_auth_session(session_id)
        except Exception:
            pass
        diagnostics["reason"] = "session_expired"
        return None, diagnostics
    email = str(session_data.get("email", "")).strip().lower()
    if not email or email not in allowed_emails():
        diagnostics["reason"] = "email_not_allowed"
        return None, diagnostics
    diagnostics["sessionValid"] = True
    diagnostics["reason"] = "authenticated"
    return build_session_user_payload(session_data), diagnostics


def verify_cookie_session() -> dict[str, Any] | None:
    user, _ = inspect_cookie_session()
    return user


def verify_state_request() -> dict[str, Any]:
    session_user = verify_cookie_session()
    if session_user:
        return session_user
    header_user, _ = inspect_header_session()
    if header_user:
        return header_user
    return verify_google_request()

def load_shared_state() -> dict[str, Any]:
    settings = load_shared_settings()

    data: dict[str, Any] = {
        "transfers": [],
        "childTransactions": [],
        "householdIncomes": [],
        "categories": settings.get("categories") or [],
        "otherPaymentMethods": settings.get("otherPaymentMethods") or [],
        "serialCounters": settings.get("serialCounters") or {},
        "dashboardBudgetConfig": settings.get("dashboardBudgetConfig") or {},
        "categoryMasterConfig": settings.get("categoryMasterConfig") or {},
        "settlementRules": settings.get("settlementRules") or {},
        "householdPoolConfig": settings.get("householdPoolConfig") or {},
        "recurringTemplateConfig": settings.get("recurringTemplateConfig") or {},
        "monthlyCloseConfig": settings.get("monthlyCloseConfig") or {},
        "sharedSettingsMeta": {
            "updatedAt": settings.get("updatedAt") or "",
            "updatedBy": settings.get("updatedBy") or "",
        },
    }

    for key, collection_name in FIRESTORE_COLLECTIONS.items():
        if key == "expenses":
            continue
        rows = []
        for document in list_firestore_documents(collection_name):
            value = decode_firestore_document(document)
            value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
            rows.append(value)
        data[key] = rows

    return data


def load_activity_logs() -> list[dict[str, Any]]:
    activity_rows = []
    for document in list_firestore_documents(ACTIVITY_LOG_COLLECTION):
        value = decode_firestore_document(document)
        value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
        activity_rows.append(value)
    activity_rows.sort(key=lambda item: str(item.get("timestamp", "")), reverse=True)
    return activity_rows


def load_shared_settings() -> dict[str, Any]:
    settings_document = get_firestore_document("households", household_id(), "settings", "main")
    return decode_firestore_document(settings_document) if settings_document else {}


def save_shared_settings(settings: dict[str, Any], actor_email: str) -> dict[str, Any]:
    payload = {
        "categories": settings.get("categories") if isinstance(settings.get("categories"), list) else [],
        "otherPaymentMethods": settings.get("otherPaymentMethods") if isinstance(settings.get("otherPaymentMethods"), list) else [],
        "serialCounters": settings.get("serialCounters") if isinstance(settings.get("serialCounters"), dict) else {},
        "dashboardBudgetConfig": settings.get("dashboardBudgetConfig") if isinstance(settings.get("dashboardBudgetConfig"), dict) else {},
        "categoryMasterConfig": settings.get("categoryMasterConfig") if isinstance(settings.get("categoryMasterConfig"), dict) else {},
        "settlementRules": settings.get("settlementRules") if isinstance(settings.get("settlementRules"), dict) else {},
        "householdPoolConfig": settings.get("householdPoolConfig") if isinstance(settings.get("householdPoolConfig"), dict) else {},
        "recurringTemplateConfig": settings.get("recurringTemplateConfig") if isinstance(settings.get("recurringTemplateConfig"), dict) else {},
        "monthlyCloseConfig": settings.get("monthlyCloseConfig") if isinstance(settings.get("monthlyCloseConfig"), dict) else {},
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "updatedBy": actor_email,
    }
    put_firestore_document(
        payload,
        "households",
        household_id(),
        "settings",
        "main",
    )
    return payload


def patch_shared_settings(
    settings_patch: dict[str, Any],
    actor_email: str,
    expected_updated_at: str = "",
    force: bool = False,
) -> dict[str, Any]:
    current_settings = load_shared_settings()
    current_updated_at = str(current_settings.get("updatedAt", "")).strip()
    if expected_updated_at and current_updated_at and current_updated_at != expected_updated_at and not force:
        raise SharedSettingsConflictError(current_settings)

    merged = dict(current_settings)
    for key in PATCHABLE_SHARED_SETTINGS_KEYS:
        if key in settings_patch:
            merged[key] = settings_patch.get(key)
    return save_shared_settings(merged, actor_email)


def extract_serial_sequence(serial_code: str, prefix: str, year_suffix: str) -> int:
    value = str(serial_code or "").strip().upper()
    match = re.fullmatch(rf"S{prefix}-(\d{{4}})", value)
    if not match:
        return 0
    return int(match.group(1))


def _firestore_transaction_url(path: str) -> str:
    return f"https://firestore.googleapis.com/v1/projects/{firestore_project_id()}/databases/(default)/documents:{path}"


def begin_firestore_transaction() -> str:
    response = requests.post(
        _firestore_transaction_url("beginTransaction"),
        headers=firestore_headers(),
        json={"options": {"readWrite": {}}},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["transaction"]


def commit_firestore_transaction(transaction_id: str, writes: list[dict[str, Any]]) -> None:
    response = requests.post(
        _firestore_transaction_url("commit"),
        headers=firestore_headers(),
        json={"transaction": transaction_id, "writes": writes},
        timeout=30,
    )
    response.raise_for_status()


def rollback_firestore_transaction(transaction_id: str) -> None:
    try:
        requests.post(
            _firestore_transaction_url("rollback"),
            headers=firestore_headers(),
            json={"transaction": transaction_id},
            timeout=10,
        )
    except Exception:
        pass


def get_next_serial_code(collection_key: str, record: dict[str, Any], settings: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Firestoreトランザクションで採番を原子的に取得・インクリメントする（最大3回リトライ）。"""
    prefix = SERIAL_KIND_PREFIX[collection_key]
    counter_key = f"{collection_key}:global"
    settings_doc_name = (
        f"projects/{firestore_project_id()}/databases/(default)/documents"
        f"/households/{household_id()}/settings/main"
    )
    settings_url = firestore_doc_url("households", household_id(), "settings", "main")

    last_error: Exception | None = None
    for attempt in range(3):
        transaction_id: str | None = None
        try:
            transaction_id = begin_firestore_transaction()

            read_response = requests.get(
                settings_url,
                headers=firestore_headers(),
                params={"transaction": transaction_id},
                timeout=30,
            )
            if read_response.status_code == 404:
                current_settings: dict[str, Any] = {}
            else:
                read_response.raise_for_status()
                current_settings = decode_firestore_document(read_response.json())

            serial_counters = current_settings.get("serialCounters")
            if not isinstance(serial_counters, dict):
                serial_counters = {}
            next_sequence = int(serial_counters.get(counter_key) or 0) + 1
            serial_counters[counter_key] = next_sequence

            updated_settings = dict(current_settings)
            updated_settings["serialCounters"] = serial_counters
            updated_settings["updatedAt"] = datetime.now(timezone.utc).isoformat()

            commit_firestore_transaction(transaction_id, [{
                "update": {
                    "name": settings_doc_name,
                    "fields": encode_firestore_document(updated_settings)["fields"],
                }
            }])

            settings["serialCounters"] = serial_counters
            return f"S{prefix}-{next_sequence:04d}", settings

        except Exception as error:
            last_error = error
            if transaction_id:
                rollback_firestore_transaction(transaction_id)
            app.logger.warning("Serial transaction attempt %d failed: %s", attempt + 1, error)

    raise RuntimeError(f"採番トランザクションが3回失敗しました: {last_error}")


def prepare_record_payload(
    collection_key: str,
    record: dict[str, Any],
    actor_email: str,
    existing: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any], dict[str, Any], bool]:
    record_id = str(record.get("id", "")).strip()
    if not record_id and existing:
        record_id = str(existing.get("id", "")).strip()
    if not record_id:
        raise ValueError("id is required.")

    merged = dict(existing or {})
    merged.update(record)
    merged["id"] = record_id
    merged["createdBy"] = merged.get("createdBy") or (existing or {}).get("createdBy") or actor_email
    merged["createdAt"] = merged.get("createdAt") or (existing or {}).get("createdAt") or datetime.now(timezone.utc).isoformat()
    merged["updatedBy"] = actor_email
    merged["updatedAt"] = datetime.now(timezone.utc).isoformat()
    merged["serialCode"] = str(merged.get("serialCode", "")).strip()

    settings = load_shared_settings()
    serial_updated = False
    if not merged["serialCode"]:
        merged["serialCode"], settings = get_next_serial_code(collection_key, merged, settings)
        serial_updated = True

    return record_id, merged, settings, serial_updated


def get_collection_key_from_path(path_key: str) -> str | None:
    mapping = {
        "expenses": "expenses",
        "transfers": "transfers",
        "child-transactions": "childTransactions",
        "household-incomes": "householdIncomes",
    }
    return mapping.get(path_key)


def build_activity_log_entry(
    collection_key: str,
    action: str,
    actor_email: str,
    record: dict[str, Any],
    before_state: dict[str, Any] | None = None,
    after_state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()
    record_type_map = {
        "expenses": "支出",
        "transfers": "送金",
        "childTransactions": "子供入出金",
        "householdIncomes": "家計臨時入金",
    }
    record_name = (
        str(record.get("storeName", "")).strip()
        or str(record.get("sourceName", "")).strip()
        or str(record.get("sourceOrFrom", "")).strip()
        or str(record.get("memo", "")).strip()
        or str(record.get("kind", "")).strip()
        or str(record.get("type", "")).strip()
        or "名称なし"
    )
    doc_id = f"{timestamp.replace(':', '').replace('-', '').replace('.', '')}-{os.urandom(4).hex()}"
    return {
        "id": doc_id,
        "timestamp": timestamp,
        "actorEmail": actor_email,
        "action": action,
        "recordType": record_type_map.get(collection_key, collection_key),
        "collectionKey": collection_key,
        "recordId": str(record.get("id", "")).strip(),
        "serialCode": str(record.get("serialCode", "")).strip(),
        "recordDate": str(record.get("date", "")).strip(),
        "recordName": record_name,
        "amount": NumberOrZero(record.get("amount")),
        "beforeState": before_state,
        "afterState": after_state,
    }


def NumberOrZero(value: Any) -> int:
    try:
        return int(round(float(value)))
    except Exception:
        return 0


def write_activity_log(entry: dict[str, Any]) -> None:
    put_firestore_document(
        entry,
        "households",
        household_id(),
        ACTIVITY_LOG_COLLECTION,
        entry["id"],
    )


def collection_display_name(collection_key: str) -> str:
    return {
        "expenses": "支出",
        "transfers": "送金",
        "childTransactions": "子供入出金",
        "householdIncomes": "家計臨時入金",
    }.get(collection_key, collection_key)


def person_display_name(value: str) -> str:
    normalized = str(value or "").strip()
    return {
        "your-email@example.com": "夫",
        "partner-email@example.com": "妻",
        "husband": "夫",
        "wife": "妻",
    }.get(normalized, normalized or "不明")


def sanitize_filename_segment(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r'[\/\\:*?"<>|]', "_", str(value or ""))).strip()


def guess_extension_refined(
    *,
    current_file_name: str,
    current_mime_type: str,
    original_file_name: str = "",
    original_mime_type: str = "",
) -> str:
    cfn = str(current_file_name or "").lower()
    cmt = str(current_mime_type or "").lower()
    ofn = str(original_file_name or "").lower()
    omt = str(original_mime_type or "").lower()

    # 1. PDFと判定できる情報が1つでもあれば .pdf
    if "pdf" in cfn or "pdf" in cmt or "pdf" in ofn or "pdf" in omt:
        return ".pdf"

    # 2. 元のファイル名（original_file_name）に拡張子があれば、それを優先して維持する
    if original_file_name:
        orig_suffix = Path(original_file_name).suffix
        if orig_suffix:
            return orig_suffix.lower()

    # 3. 現在のファイル名（current_file_name）に拡張子があれば、それを維持する
    if current_file_name:
        curr_suffix = Path(current_file_name).suffix
        if curr_suffix:
            return curr_suffix.lower()

    # 4. MIMEタイプから推測する
    all_mimes = f"{cmt} {omt}"
    if "png" in all_mimes:
        return ".png"
    if "webp" in all_mimes:
        return ".webp"
    if "heic" in all_mimes:
        return ".heic"
    if "jpeg" in all_mimes or "jpg" in all_mimes:
        return ".jpg"

    # 5. 不明なら .jpg にしない（拡張子なしにする）
    return ""


def normalize_receipt_drive_store_name(value: Any) -> str:
    normalized = sanitize_filename_segment(value)
    if not normalized:
        return "レシート画像"
    trimmed = re.sub(r"\s+[^\s]+(?:店|支店|本店|営業所|センター)$", "", normalized).strip()
    return trimmed or normalized or "レシート画像"


def build_receipt_drive_total_amount(value: Any) -> int:
    return max(NumberOrZero(value), 0)


def build_receipt_drive_filename_from_context(
    *,
    file_context: dict[str, Any],
    source_file_name: str,
    mime_type: str,
    original_file_name: str = "",
    original_mime_type: str = "",
    timestamp: datetime | None = None,
) -> str:
    current = timestamp or datetime.now(timezone.utc)
    date_part = str(file_context.get("date") or current.date().isoformat()).strip() or current.date().isoformat()
    serial_code = sanitize_filename_segment(file_context.get("serialCode") or "NO-SERIAL") or "NO-SERIAL"
    store_name = normalize_receipt_drive_store_name(file_context.get("storeName") or "")
    total_amount = build_receipt_drive_total_amount(file_context.get("totalAmount"))

    # 衝突回避のための suffix (アタッチメント連番など)
    attachment_index = file_context.get("attachmentIndex")
    suffix = ""
    if attachment_index and int(attachment_index) > 0:
        suffix = f"_{str(attachment_index).zfill(2)}"

    ext = guess_extension_refined(
        current_file_name=source_file_name,
        current_mime_type=mime_type,
        original_file_name=original_file_name,
        original_mime_type=original_mime_type,
    )
    return f"{date_part}_{serial_code}_{store_name}_{total_amount}JPY{suffix}{ext}"


def build_receipt_drive_group_context(records: list[dict[str, Any]]) -> dict[str, Any]:
    normalized_records = [record for record in records if isinstance(record, dict)]
    first = (
        sorted(
            normalized_records,
            key=lambda item: (
                str(item.get("date") or ""),
                str(item.get("createdAt") or item.get("updatedAt") or ""),
                str(item.get("id") or ""),
            ),
        )[0]
        if normalized_records
        else {}
    )
    total_amount = sum(NumberOrZero(record.get("amount")) for record in normalized_records)
    return {
        "date": str(first.get("date") or "").strip(),
        "serialCode": str(first.get("serialCode") or first.get("id") or "NO-SERIAL").strip() or "NO-SERIAL",
        "storeName": str(first.get("storeName") or "").strip(),
        "totalAmount": total_amount or NumberOrZero(first.get("amount")),
    }


def build_receipt_drive_filename(
    *,
    file_context: dict[str, Any],
    owner_email: str,
    source_file_name: str,
    mime_type: str,
    timestamp: datetime | None = None,
) -> str:
    del owner_email
    return build_receipt_drive_filename_from_context(
        file_context=file_context,
        source_file_name=source_file_name,
        mime_type=mime_type,
        timestamp=timestamp,
    )


def create_receipt_asset(file_bytes: bytes, file_name: str, mime_type: str, owner_email: str) -> dict[str, Any]:
    asset_id = uuid.uuid4().hex
    uploaded_at = datetime.now(timezone.utc).isoformat()
    blob = receipt_temp_bucket().blob(receipt_asset_object_name(asset_id))
    blob.metadata = {
        "ownerEmail": str(owner_email or "").strip(),
        "originalFileName": str(file_name or "receipt-image").strip() or "receipt-image",
        "uploadedAt": uploaded_at,
    }
    blob.cache_control = "private, max-age=0, no-transform"
    blob.upload_from_string(file_bytes, content_type=str(mime_type or "application/octet-stream").strip() or "application/octet-stream")
    return {
        "assetId": asset_id,
        "objectName": blob.name,
        "uploadedAt": uploaded_at,
        "originalFileName": blob.metadata.get("originalFileName", ""),
        "mimeType": blob.content_type or mime_type or "application/octet-stream",
        "bucket": receipt_temp_bucket_name(),
    }


def load_receipt_asset(asset_id: str) -> dict[str, Any]:
    bucket = receipt_temp_bucket()
    blob = bucket.blob(receipt_asset_object_name(asset_id))
    if not blob.exists():
        blob = bucket.blob(receipt_permanent_asset_object_name(asset_id))
    if not blob.exists():
        raise FileNotFoundError("指定されたレシート一時保存データが見つかりません。")
    return {
        "assetId": asset_id,
        "blob": blob,
        "bytes": blob.download_as_bytes(),
        "mimeType": blob.content_type or "application/octet-stream",
        "originalFileName": str((blob.metadata or {}).get("originalFileName", "")).strip() or "receipt-image",
        "ownerEmail": str((blob.metadata or {}).get("ownerEmail", "")).strip(),
        "uploadedAt": str((blob.metadata or {}).get("uploadedAt", "")).strip(),
    }


def promote_receipt_asset_to_permanent(asset_id: str) -> dict[str, Any]:
    bucket = receipt_temp_bucket()
    temp_blob = bucket.blob(receipt_asset_object_name(asset_id))
    permanent_blob = bucket.blob(receipt_permanent_asset_object_name(asset_id))
    if permanent_blob.exists():
        blob = permanent_blob
    elif temp_blob.exists():
        blob = bucket.copy_blob(temp_blob, bucket, permanent_blob.name)
        blob.cache_control = "private, max-age=0, no-transform"
        metadata = dict(temp_blob.metadata or {})
        metadata["storageStatus"] = "permanent"
        metadata["permanentAt"] = datetime.now(timezone.utc).isoformat()
        blob.metadata = metadata
        blob.patch()
        try:
            temp_blob.delete()
        except Exception as cleanup_error:
            app.logger.warning("Failed to remove temporary receipt asset after promotion %s: %s", asset_id, cleanup_error)
    else:
        raise FileNotFoundError("指定されたレシート一時保存データが見つかりません。")
    return {
        "assetId": asset_id,
        "blob": blob,
        "objectName": blob.name,
        "mimeType": blob.content_type or "application/octet-stream",
        "originalFileName": str((blob.metadata or {}).get("originalFileName", "")).strip() or "receipt-image",
        "ownerEmail": str((blob.metadata or {}).get("ownerEmail", "")).strip(),
        "uploadedAt": str((blob.metadata or {}).get("uploadedAt", "")).strip(),
        "permanentAt": str((blob.metadata or {}).get("permanentAt", "")).strip(),
    }


def delete_receipt_asset(asset_id: str) -> None:
    blob = receipt_temp_bucket().blob(receipt_asset_object_name(asset_id))
    if blob.exists():
        blob.delete()


def receipt_asset_app_url(asset_id: str) -> str:
    return f"{frontend_origin().rstrip('/')}/api/receipt/assets/{quote(asset_id)}"


def build_drive_multipart_body(metadata: dict[str, Any], file_bytes: bytes, mime_type: str) -> tuple[str, bytes]:
    boundary = f"===============kakeibo-{uuid.uuid4().hex}"
    parts = [
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{json.dumps(metadata, ensure_ascii=False)}\r\n".encode("utf-8"),
        f"--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n".encode("utf-8"),
        file_bytes,
        f"\r\n--{boundary}--".encode("utf-8"),
    ]
    return boundary, b"".join(parts)


def upload_receipt_bytes_to_drive(
    *,
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    owner_email: str,
) -> dict[str, Any]:
    folder_id = drive_folder_id()
    if not folder_id:
        raise RuntimeError("DRIVE_SHARED_FOLDER_ID is not configured.")
    metadata = {
        "name": filename,
        "parents": [folder_id],
    }
    boundary, body = build_drive_multipart_body(metadata, file_bytes, mime_type)
    response = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files"
        "?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
        headers={
            "Authorization": f"Bearer {drive_credentials().token}",
            "Content-Type": f'multipart/related; boundary="{boundary}"',
        },
        data=body,
        timeout=120,
    )
    if not response.ok:
        error_payload = response.json() if response.headers.get("Content-Type", "").startswith("application/json") else {}
        app.logger.warning(
            "Drive receipt upload failed: status=%s folderId=%s serviceAccount=%s response=%s",
            response.status_code,
            folder_id,
            drive_runtime_service_account_email(),
            json.dumps(error_payload or {"text": response.text[:1000]}, ensure_ascii=False),
        )
        message = str(
            (error_payload.get("error") or {}).get("message")
            or response.text
            or f"Drive upload failed: {response.status_code}"
        ).strip()
        service_account = drive_runtime_service_account_email()
        if response.status_code in (403, 404):
            raise PermissionError(
                "Drive 保存先へアクセスできません。"
                + (f" フォルダを {service_account} に共有してください。" if service_account else "")
            )
        raise RuntimeError(message)
    payload = response.json()
    file_id = str(payload.get("id", "")).strip()
    if not file_id:
        raise RuntimeError("Drive ファイルIDを取得できませんでした。")
    return {
        "id": file_id,
        "url": str(payload.get("webViewLink", "")).strip() or f"https://drive.google.com/file/d/{file_id}/view",
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
        "uploaderName": person_display_name(owner_email),
    }


def load_drive_file_metadata(file_id: str) -> dict[str, Any]:
    response = requests.get(
        f"https://www.googleapis.com/drive/v3/files/{quote(str(file_id or '').strip())}"
        "?fields=id,name,mimeType,webViewLink&supportsAllDrives=true",
        headers={
            "Authorization": f"Bearer {drive_credentials().token}",
        },
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Drive metadata {response.status_code}: {response.text[:500]}")
    return response.json()


def rename_drive_file(file_id: str, new_name: str) -> dict[str, Any]:
    response = requests.patch(
        f"https://www.googleapis.com/drive/v3/files/{quote(str(file_id or '').strip())}"
        "?fields=id,name,webViewLink&supportsAllDrives=true",
        headers={
            "Authorization": f"Bearer {drive_credentials().token}",
            "Content-Type": "application/json",
        },
        json={"name": new_name},
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Drive rename {response.status_code}: {response.text[:500]}")
    return response.json()


def patch_expense_receipt_fields(record_id: str, fields: dict[str, Any], actor_email: str) -> dict[str, Any] | None:
    existing = load_record("expenses", record_id)
    if not existing:
        return None
    merged = dict(existing)
    merged.update(fields or {})
    merged["updatedAt"] = datetime.now(timezone.utc).isoformat()
    merged["updatedBy"] = actor_email
    put_firestore_document(
        merged,
        "households",
        household_id(),
        FIRESTORE_COLLECTIONS["expenses"],
        record_id,
    )
    return merged


def format_notification_amount(value: Any) -> str:
    amount = NumberOrZero(value)
    return f"-¥{abs(amount):,}" if amount < 0 else f"¥{amount:,}"


def payment_method_display_name(value: Any, other_value: Any = "") -> str:
    normalized = str(value or "").strip()
    other_label = str(other_value or "").strip()
    labels = {
        "husband_card": "夫カード",
        "wife_card": "妻カード",
        "husband_other": "夫その他",
        "wife_other": "妻その他",
        "family_card": "夫カード（旧互換）",
        "husband_cash": "夫その他（現金・旧互換）",
        "wife_cash": "妻その他（現金・旧互換）",
    }
    if normalized == "other":
        return other_label or "その他"
    base = labels.get(normalized, normalized or "未設定")
    if normalized in {"husband_other", "wife_other"} and other_label:
        return f"{base}（{other_label}）"
    return base


def personal_expense_display_name(value: Any) -> str:
    normalized = str(value or "").strip()
    return {
        "family": "家計費",
        "husband": "夫",
        "wife": "妻",
        "child": "子供",
    }.get(normalized, normalized or "未設定")


def receipt_sync_status_display_name(record: dict[str, Any]) -> str:
    status = str(record.get("receiptUploadStatus") or "").strip()
    if not status:
        return "なし"
    return {
        "success": "Drive反映済み",
        "storage_saved": "Cloud Storage保存済み",
        "storage_fallback": "Cloud Storage保管",
        "failed": "保存失敗",
    }.get(status, status)


def source_type_display_name(value: Any) -> str:
    normalized = str(value or "").strip()
    return {
        "manual": "手入力",
        "image": "画像AI",
        "text": "テキストAI",
        "recurring_template": "固定費テンプレ",
    }.get(normalized, normalized or "未設定")


def build_expense_discord_notification_lines(record: dict[str, Any], actor_email: str) -> list[str]:
    lines = [
        f"日付: {str(record.get('date') or '').strip() or '未設定'}",
        f"支出コード: {str(record.get('serialCode') or '').strip() or '未設定'}",
        f"購入店: {str(record.get('storeName') or '').strip() or '未設定'}",
        f"支出額: {format_notification_amount(record.get('amount'))}",
        f"総額: {format_notification_amount(record.get('grossAmount') if record.get('grossAmount') is not None else record.get('amount'))}",
        f"ポイント還元: {format_notification_amount(record.get('pointCredit'))}",
        f"カテゴリ: {str(record.get('category') or '').strip() or '未設定'}",
        f"支払者: {person_display_name(record.get('payer'))}",
        f"支払い手段: {payment_method_display_name(record.get('paymentMethod'), record.get('otherPaymentMethod'))}",
        f"負担区分: {personal_expense_display_name(record.get('personalExpense'))}",
        f"登録方法: {source_type_display_name(record.get('sourceType'))}",
        f"レシート: {receipt_sync_status_display_name(record)}",
        f"登録者: {person_display_name(actor_email)}",
    ]
    other_payment_method = str(record.get("otherPaymentMethod") or "").strip()
    if other_payment_method and str(record.get("paymentMethod") or "").strip() not in {"husband_other", "wife_other", "other"}:
        lines.append(f"その他支払い手段: {other_payment_method}")
    invoice_number = str(record.get("invoiceNumber") or "").strip()
    if invoice_number:
        lines.append(f"インボイス番号: {invoice_number}")
    if NumberOrZero(record.get("receiptLineCount")) > 1:
        lines.append(
            f"分割明細: {NumberOrZero(record.get('receiptLineIndex') or 1)}/{NumberOrZero(record.get('receiptLineCount'))}"
        )
    source_template_label = str(record.get("sourceTemplateLabel") or "").strip()
    if source_template_label:
        lines.append(f"固定費テンプレ: {source_template_label}")
    memo = str(record.get("memo") or "").strip()
    lines.append(f"メモ: {shorten_error_message(memo, 500) if memo else 'なし'}")
    return lines


def household_income_kind_display_name(value: Any) -> str:
    normalized = str(value or "").strip()
    return {
        "sale_profit": "売却益",
        "refund": "返金",
        "subsidy": "補助金",
        "other": "その他入金",
    }.get(normalized, normalized or "未設定")


def build_household_income_discord_notification_lines(record: dict[str, Any], actor_email: str) -> list[str]:
    memo = str(record.get("memo") or "").strip()
    return [
        f"日付: {str(record.get('date') or '').strip() or '未設定'}",
        f"入金コード: {str(record.get('serialCode') or '').strip() or '未設定'}",
        f"入金種別: {household_income_kind_display_name(record.get('kind'))}",
        f"入金元・内容: {str(record.get('sourceName') or '').strip() or '未設定'}",
        f"金額: {format_notification_amount(record.get('amount'))}",
        f"いま預かっている人: {person_display_name(record.get('holder'))}",
        f"登録者: {person_display_name(actor_email)}",
        f"メモ: {shorten_error_message(memo, 500) if memo else 'なし'}",
    ]


def build_notification_subject(collection_key: str, record: dict[str, Any]) -> str:
    if collection_key == "expenses":
        return str(record.get("storeName") or record.get("serialCode") or "名称未設定").strip() or "名称未設定"
    if collection_key == "transfers":
        from_person = person_display_name(record.get("fromPerson"))
        to_person = person_display_name(record.get("toPerson"))
        return f"{from_person}→{to_person}"
    if collection_key == "childTransactions":
        return str(record.get("sourceOrFrom") or record.get("kind") or record.get("serialCode") or "名称未設定").strip() or "名称未設定"
    if collection_key == "householdIncomes":
        return str(record.get("sourceName") or record.get("kind") or record.get("serialCode") or "名称未設定").strip() or "名称未設定"
    return str(record.get("serialCode") or record.get("id") or "名称未設定").strip() or "名称未設定"


def push_vapid_public_key() -> str:
    return str(os.environ.get("PUSH_VAPID_PUBLIC_KEY", "")).strip()


def push_vapid_private_key() -> str:
    return str(os.environ.get("PUSH_VAPID_PRIVATE_KEY", "")).strip()


def push_vapid_subject() -> str:
    return str(os.environ.get("PUSH_VAPID_SUBJECT", "mailto:your-email@example.com")).strip()


def push_notifications_enabled() -> bool:
    return bool(push_vapid_public_key() and push_vapid_private_key())


def discord_activity_webhook_url() -> str:
    return str(os.environ.get("DISCORD_ACTIVITY_WEBHOOK_URL", "")).strip()


def discord_activity_notifications_enabled() -> bool:
    return bool(discord_activity_webhook_url())


def frontend_origin() -> str:
    return str(
        os.environ.get(
            "FRONTEND_ORIGIN",
            "https://YOUR_CLOUD_RUN_URL",
        )
    ).strip()


def push_subscription_id(endpoint: str) -> str:
    return hashlib.sha256(endpoint.encode("utf-8")).hexdigest()


def validate_push_subscription(subscription: dict[str, Any]) -> dict[str, Any]:
    endpoint = str(subscription.get("endpoint", "")).strip()
    keys = subscription.get("keys") if isinstance(subscription.get("keys"), dict) else {}
    p256dh = str(keys.get("p256dh", "")).strip()
    auth = str(keys.get("auth", "")).strip()
    if not endpoint or not p256dh or not auth:
        raise ValueError("endpoint / keys.p256dh / keys.auth が必要です。")
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
        "expirationTime": subscription.get("expirationTime"),
    }


def save_push_subscription(subscription: dict[str, Any], actor_email: str, user_agent: str = "") -> dict[str, Any]:
    normalized = validate_push_subscription(subscription)
    doc_id = push_subscription_id(normalized["endpoint"])
    existing = get_firestore_document("households", household_id(), PUSH_SUBSCRIPTION_COLLECTION, doc_id)
    existing_payload = decode_firestore_document(existing) if existing else {}
    timestamp = datetime.now(timezone.utc).isoformat()
    payload = {
        "id": doc_id,
        "endpoint": normalized["endpoint"],
        "keys": normalized["keys"],
        "expirationTime": normalized.get("expirationTime"),
        "userEmail": actor_email,
        "userAgent": str(user_agent or "").strip(),
        "createdAt": str(existing_payload.get("createdAt") or timestamp),
        "updatedAt": timestamp,
    }
    put_firestore_document(payload, "households", household_id(), PUSH_SUBSCRIPTION_COLLECTION, doc_id)
    return payload


def delete_push_subscription_by_endpoint(endpoint: str) -> bool:
    normalized = str(endpoint or "").strip()
    if not normalized:
        return False
    delete_firestore_document("households", household_id(), PUSH_SUBSCRIPTION_COLLECTION, push_subscription_id(normalized))
    return True


def load_push_subscriptions() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for document in list_firestore_documents(PUSH_SUBSCRIPTION_COLLECTION):
        payload = decode_firestore_document(document)
        payload["id"] = payload.get("id") or document.get("name", "").rsplit("/", 1)[-1]
        rows.append(payload)
    return rows


def build_push_notification_payload(
    collection_key: str,
    action: str,
    actor_email: str,
    record: dict[str, Any],
    activity_entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    action_label = {
        "create": "登録",
        "delete": "削除",
    }.get(action, action)
    subject = build_notification_subject(collection_key, record)
    serial_code = str(record.get("serialCode", "")).strip()
    body_parts = [
        str(record.get("date", "")).strip() or "日付未設定",
        format_notification_amount(record.get("amount")),
        subject,
        person_display_name(actor_email),
    ]
    if serial_code:
        body_parts.append(serial_code)
    return {
        "title": f"{collection_display_name(collection_key)}を{action_label}",
        "body": " / ".join([part for part in body_parts if part]),
        "tag": f"kakeibo-{collection_key}-{action}",
        "data": {
            "url": "/",
            "collectionKey": collection_key,
            "action": action,
            "recordId": str(record.get("id", "")).strip(),
            "activityLogId": str((activity_entry or {}).get("id", "")).strip(),
        },
    }


def send_pwa_push_notification(
    collection_key: str,
    action: str,
    actor_email: str,
    record: dict[str, Any],
    activity_entry: dict[str, Any] | None = None,
) -> None:
    if not push_notifications_enabled():
        return

    subscriptions = load_push_subscriptions()
    if not subscriptions:
        return

    payload = json.dumps(
        build_push_notification_payload(collection_key, action, actor_email, record, activity_entry),
        ensure_ascii=False,
    )
    vapid_claims = {"sub": push_vapid_subject()}

    for subscription in subscriptions:
        endpoint = str(subscription.get("endpoint", "")).strip()
        keys = subscription.get("keys") if isinstance(subscription.get("keys"), dict) else {}
        if not endpoint or not str(keys.get("p256dh", "")).strip() or not str(keys.get("auth", "")).strip():
            continue
        try:
            webpush(
                subscription_info={
                    "endpoint": endpoint,
                    "keys": {
                        "p256dh": str(keys.get("p256dh", "")).strip(),
                        "auth": str(keys.get("auth", "")).strip(),
                    },
                },
                data=payload,
                vapid_private_key=push_vapid_private_key(),
                vapid_claims=vapid_claims,
                ttl=60,
            )
        except WebPushException as error:
            status_code = getattr(getattr(error, "response", None), "status_code", None)
            app.logger.warning(
                "PWA push notification failed: status=%s collection=%s action=%s recordId=%s activityLogId=%s endpoint=%s",
                status_code,
                collection_key,
                action,
                str(record.get("id", "")).strip(),
                str((activity_entry or {}).get("id", "")).strip(),
                endpoint,
            )
            if status_code in {404, 410}:
                delete_push_subscription_by_endpoint(endpoint)
        except Exception as error:
            app.logger.warning(
                "PWA push notification error: %s collection=%s action=%s recordId=%s activityLogId=%s endpoint=%s",
                error,
                collection_key,
                action,
                str(record.get("id", "")).strip(),
                str((activity_entry or {}).get("id", "")).strip(),
                endpoint,
            )


def build_discord_activity_notification_payload(
    collection_key: str,
    action: str,
    actor_email: str,
    record: dict[str, Any],
    activity_entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    push_payload = build_push_notification_payload(collection_key, action, actor_email, record, activity_entry)
    if collection_key == "expenses" and action == "create":
        content_lines = [
            f"**{push_payload.get('title', '')}**",
            *build_expense_discord_notification_lines(record, actor_email),
            frontend_origin(),
        ]
    elif collection_key == "householdIncomes":
        content_lines = [
            f"**{push_payload.get('title', '')}**",
            *build_household_income_discord_notification_lines(record, actor_email),
            frontend_origin(),
        ]
    else:
        content_lines = [
            f"**{push_payload.get('title', '')}**",
            str(push_payload.get("body", "")).strip(),
            frontend_origin(),
        ]
    return {"content": "\n".join([line for line in content_lines if line])}


def send_discord_activity_notification(
    collection_key: str,
    action: str,
    actor_email: str,
    record: dict[str, Any],
    activity_entry: dict[str, Any] | None = None,
) -> None:
    if not discord_activity_notifications_enabled():
        return

    try:
        response = requests.post(
            discord_activity_webhook_url(),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "kakeibo-web-activity-bot/1.0",
            },
            json=build_discord_activity_notification_payload(
                collection_key,
                action,
                actor_email,
                record,
                activity_entry,
            ),
            timeout=15,
        )
        response.raise_for_status()
    except Exception as error:
        app.logger.warning(
            "Discord activity notification failed: %s collection=%s action=%s recordId=%s activityLogId=%s",
            error,
            collection_key,
            action,
            str(record.get("id", "")).strip(),
            str((activity_entry or {}).get("id", "")).strip(),
        )


def shorten_error_message(value: Any, limit: int = 300) -> str:
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit - 1]}…"


def extract_gemini_error_message(error_body: Any) -> str:
    if isinstance(error_body, dict):
        nested = error_body.get("error")
        if isinstance(nested, dict):
            return str(nested.get("message") or nested.get("status") or error_body).strip()
        return str(error_body.get("message") or error_body).strip()
    return str(error_body or "").strip()


def gemini_model_candidates() -> list[str]:
    primary_model = str(os.environ.get("GEMINI_MODEL", DEFAULT_MODEL) or "").strip() or DEFAULT_MODEL
    fallback_models = str(os.environ.get("GEMINI_MODEL_FALLBACKS", DEFAULT_FALLBACK_MODEL) or "").strip()
    fallback_candidates = [item.strip() for item in fallback_models.split(",") if item.strip()]
    candidates: list[str] = []
    for model_name in (primary_model, *(fallback_candidates or [DEFAULT_FALLBACK_MODEL])):
        if model_name and model_name not in candidates:
            candidates.append(model_name)
    return candidates[: gemini_max_attempts()] or [DEFAULT_MODEL]


def gemini_allowed_models() -> set[str]:
    raw = str(
        os.environ.get(
            "GEMINI_ALLOWED_MODELS",
            ",".join(sorted(ALLOWED_GEMINI_MODELS)),
        )
        or ""
    ).strip()
    configured = {item.strip() for item in raw.split(",") if item.strip()}
    return configured & ALLOWED_GEMINI_MODELS


def gemini_allowed_model_options() -> set[str]:
    raw = str(
        os.environ.get(
            "GEMINI_ALLOWED_MODEL_OPTIONS",
            ",".join(sorted(DEFAULT_ALLOWED_MODEL_OPTIONS)),
        )
        or ""
    ).strip()
    configured = {item.strip() for item in raw.split(",") if item.strip()}
    return configured & DEFAULT_ALLOWED_MODEL_OPTIONS


def resolve_gemini_model_option(raw_option: Any) -> tuple[dict[str, Any] | None, str, str]:
    option = str(raw_option or "").strip()
    if not option:
        option = str(os.environ.get("GEMINI_DEFAULT_MODEL_OPTION", DEFAULT_MODEL_OPTION) or "").strip()
    if not option:
        option = DEFAULT_MODEL_OPTION
    allowed_options = gemini_allowed_model_options()
    if option not in allowed_options or option not in MODEL_OPTION_CONFIG:
        return None, "Gemini model option is not allowed.", "GEMINI_MODEL_OPTION_NOT_ALLOWED"

    option_config = MODEL_OPTION_CONFIG[option]
    allowed_models = gemini_allowed_models()
    model_candidates = [model for model in option_config["models"] if model in allowed_models]
    if not model_candidates or len(model_candidates) != len(option_config["models"]):
        return None, "Gemini model is not allowed.", "GEMINI_MODEL_NOT_ALLOWED"

    api_key_env = str(option_config["apiKeyEnv"])
    api_key = str(os.environ.get(api_key_env, "") or "").strip()
    if not api_key:
        if option_config["apiTier"] == "paid":
            return None, "Paid Gemini API key is not configured. Select a Free API model.", GEMINI_ERROR_PAID_KEY_NOT_CONFIGURED
        return None, "GEMINI_FREE_API_KEY is not configured.", GEMINI_ERROR_AUTH

    return {
        "selectedModelOption": option,
        "selectedApiTier": option_config["apiTier"],
        "apiKeyEnv": api_key_env,
        "apiKey": api_key,
        "modelCandidates": model_candidates,
    }, "", ""


def gemini_max_output_tokens() -> int:
    raw = str(os.environ.get("GEMINI_MAX_OUTPUT_TOKENS", str(DEFAULT_GEMINI_MAX_OUTPUT_TOKENS)) or "").strip()
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = DEFAULT_GEMINI_MAX_OUTPUT_TOKENS
    return max(1, min(value, DEFAULT_GEMINI_MAX_OUTPUT_TOKENS))


def gemini_max_attempts() -> int:
    raw = str(os.environ.get("GEMINI_MAX_RETRIES", str(DEFAULT_GEMINI_MAX_RETRIES)) or "").strip()
    try:
        retries = int(raw)
    except (TypeError, ValueError):
        retries = DEFAULT_GEMINI_MAX_RETRIES
    return max(1, min(retries, DEFAULT_GEMINI_MAX_RETRIES) + 1)


def require_gemini_model_policy_config() -> tuple[bool, str]:
    if str(os.environ.get("GEMINI_DISABLE_PAID_FALLBACK", "true")).strip().lower() != "true":
        return False, "GEMINI_DISABLE_PAID_FALLBACK must be true."
    if str(os.environ.get("GEMINI_ENABLE_PAID_FALLBACK", "false")).strip().lower() == "true":
        return False, "GEMINI_ENABLE_PAID_FALLBACK must not be true."
    if str(os.environ.get("GEMINI_API_KEY", "")).strip() or str(os.environ.get("GOOGLE_API_KEY", "")).strip():
        return False, "Paid Gemini API key environment variables are not allowed."
    allowed_models = gemini_allowed_models()
    if not allowed_models:
        return False, "GEMINI_ALLOWED_MODELS has no allowed Gemini models."
    allowed_options = gemini_allowed_model_options()
    if not allowed_options:
        return False, "GEMINI_ALLOWED_MODEL_OPTIONS has no allowed model options."
    return True, ""


def gemini_error_response_body(response: requests.Response) -> dict[str, Any]:
    try:
        error_body = response.json()
    except ValueError:
        return {"message": "Gemini error response was not valid JSON."}
    return error_body if isinstance(error_body, dict) else {"message": "Gemini error response was not an object."}


def gemini_request_exception_reason(error: requests.RequestException) -> str:
    if isinstance(error, requests.Timeout):
        return "timeout"
    if isinstance(error, requests.ConnectionError):
        return "temporary_network_error"
    return "request_exception"


def should_fallback_gemini_request_exception(error: requests.RequestException) -> bool:
    return isinstance(error, (requests.Timeout, requests.ConnectionError))


def should_fallback_gemini_http_status(status_code: int) -> bool:
    return status_code in GEMINI_TEMPORARY_HTTP_STATUSES


def extract_gemini_error_status(error_body: dict[str, Any]) -> str:
    error_data = error_body.get("error") if isinstance(error_body.get("error"), dict) else error_body
    status = str(error_data.get("status", "") if isinstance(error_data, dict) else "").strip().upper()
    return status


def classify_gemini_error_response(response: requests.Response, error_body: dict[str, Any]) -> str:
    status_code = response.status_code
    error_status = extract_gemini_error_status(error_body)
    if status_code == 429 or error_status == "RESOURCE_EXHAUSTED":
        return GEMINI_ERROR_RATE_LIMIT
    if status_code in {401, 403}:
        return GEMINI_ERROR_AUTH
    if status_code in {503, 504} or error_status in {"UNAVAILABLE", "DEADLINE_EXCEEDED"}:
        return GEMINI_ERROR_TEMPORARY
    return "GEMINI_HTTP_ERROR"


def should_cross_model_fallback(
    selected_model_option: str,
    selected_api_tier: str,
    current_model: str,
    next_model: str,
    current_error_code: str,
) -> bool:
    if selected_api_tier != "free":
        return False
    if selected_model_option == "free_gemini35" and current_model == "gemini-3.5-flash":
        return current_error_code == GEMINI_ERROR_RATE_LIMIT and next_model == "gemini-2.5-flash"
    if current_model == "gemini-2.5-flash" and next_model == "gemini-2.5-flash-lite":
        return current_error_code in {
            GEMINI_ERROR_RATE_LIMIT,
            GEMINI_ERROR_TEMPORARY,
            GEMINI_ERROR_EMPTY_RESPONSE,
            GEMINI_ERROR_INVALID_JSON,
            GEMINI_ERROR_MAX_TOKENS,
        }
    return False


def gemini_error_code_for_http_status(status_code: int) -> str:
    if status_code == 429:
        return GEMINI_ERROR_RATE_LIMIT
    if status_code in {401, 403}:
        return GEMINI_ERROR_AUTH
    if status_code in {503, 504}:
        return GEMINI_ERROR_TEMPORARY
    return "GEMINI_HTTP_ERROR"


def gemini_error_code_for_finish_reason(finish_reason: str) -> str:
    normalized = str(finish_reason or "").strip().upper()
    if normalized == "MAX_TOKENS":
        return GEMINI_ERROR_MAX_TOKENS
    if normalized in GEMINI_SAFETY_FINISH_REASONS:
        return GEMINI_ERROR_SAFETY_BLOCK
    return GEMINI_ERROR_INVALID_JSON


def coerce_receipt_result_aliases(result: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(result)
    if not normalized.get("storeName") and normalized.get("store"):
        normalized["storeName"] = normalized.get("store")
    total_value = normalized.get("grossAmount", normalized.get("total"))
    if normalized.get("grossAmount") in (None, "") and normalized.get("total") not in (None, ""):
        normalized["grossAmount"] = normalized.get("total")
    if normalized.get("amount") in (None, "") and total_value not in (None, ""):
        point_credit = to_number(normalized.get("pointCredit")) or 0
        total_number = to_number(total_value)
        normalized["amount"] = int(round(total_number - point_credit)) if total_number is not None else total_value
    if "pointCredit" not in normalized:
        normalized["pointCredit"] = 0
    if not isinstance(normalized.get("items"), list):
        normalized["items"] = []
    if not isinstance(normalized.get("memoWarnings"), list):
        normalized["memoWarnings"] = []
    if not isinstance(normalized.get("taxSummary"), list):
        normalized["taxSummary"] = []
    return normalized


def build_gemini_payload(parts: list[dict[str, Any]], schema: dict[str, Any], *, max_output_tokens: int | None = None) -> dict[str, Any]:
    return {
        "contents": [{"parts": parts}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": max_output_tokens or gemini_max_output_tokens(),
            "responseMimeType": "application/json",
            "responseSchema": schema,
        },
    }


def parse_gemini_candidate(data: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    candidates = data.get("candidates") if isinstance(data.get("candidates"), list) else []
    first_candidate = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
    finish_reason = str(first_candidate.get("finishReason", "") or "")
    content = first_candidate.get("content") if isinstance(first_candidate.get("content"), dict) else {}
    parts_list = content.get("parts") if isinstance(content.get("parts"), list) else []
    first_part = parts_list[0] if parts_list and isinstance(parts_list[0], dict) else {}
    text = str(first_part.get("text", "") or "")
    parsed_result = None
    if text:
        try:
            parsed_result = json.loads(text)
        except (json.JSONDecodeError, TypeError):
            parsed_result = extract_json_object(text)
    meta = {
        "finishReason": finish_reason,
        "candidateTextLength": len(text),
        "emptyResponse": not candidates or not parts_list or not text,
    }
    return parsed_result if isinstance(parsed_result, dict) else None, meta


def call_gemini_model(api_key: str, model_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
    request_started_at = datetime.now(timezone.utc)
    response = requests.post(
        endpoint,
        params={"key": api_key},
        headers={"Content-Type": "application/json"},
        json=payload,
        timeout=60,
    )
    latency_ms = int((datetime.now(timezone.utc) - request_started_at).total_seconds() * 1000)
    return {"response": response, "latencyMs": latency_ms, "responseBodyBytes": len(response.content or b"")}


def build_repair_payload(raw_text: str) -> dict[str, Any]:
    repair_prompt = "\n".join(
        [
            "次のテキストはGeminiのレシート解析JSON応答ですが、JSONとして壊れている可能性があります。",
            "内容を補足・創作せず、JSONオブジェクトだけに修復してください。",
            "レシート本文全文ではなく、与えられた応答内の項目だけを使ってください。",
        ]
    )
    return build_gemini_payload(
        [{"text": repair_prompt}, {"text": str(raw_text or "")}],
        GEMINI_REPAIR_RESPONSE_SCHEMA,
        max_output_tokens=min(gemini_max_output_tokens(), 1024),
    )


def build_minimal_receipt_prompt(categories: list[Any]) -> str:
    return "\n".join(
        [
            "あなたは家計簿入力支援AIです。",
            "レシート画像または本文から、家計簿登録に最低限必要なJSONだけを返してください。",
            "商品明細の復元に固執せず、店名・日付・合計金額を最優先してください。",
            "キーは storeName, date, grossAmount, amount, category, memo, items, memoWarnings。",
            f"category は次の候補から選んでください: {', '.join(str(item) for item in categories)}",
            "grossAmount と amount は合計金額です。合計金額が読めない場合はJSONを作らず失敗して構いません。",
            "items は空配列でよいです。",
            "推定が含まれる場合は memo または memoWarnings に短く不確実性を書いてください。",
            "必ずJSONオブジェクトだけを返してください。",
        ]
    )


def build_ai_usage_log_entry(payload: dict[str, Any]) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).isoformat()
    doc_id = f"{timestamp.replace(':', '').replace('-', '').replace('.', '')}-{os.urandom(4).hex()}"
    return {
        "id": doc_id,
        "timestamp": timestamp,
        "modelOption": str(payload.get("modelOption") or payload.get("selectedModelOption") or "").strip(),
        "keyTier": str(payload.get("keyTier") or payload.get("selectedApiTier") or "").strip(),
        "selectedModelOption": str(payload.get("selectedModelOption", "")).strip(),
        "selectedApiTier": str(payload.get("selectedApiTier", "")).strip(),
        "model": str(payload.get("model", "")).strip(),
        "primaryModel": str(payload.get("primaryModel", "")).strip(),
        "usedModel": str(payload.get("usedModel", "")).strip(),
        "fallbackUsed": bool(payload.get("fallbackUsed")),
        "fallbackReason": str(payload.get("fallbackReason", "")).strip(),
        "fallbackChain": payload.get("fallbackChain") if isinstance(payload.get("fallbackChain"), list) else [],
        "attemptIndex": NumberOrZero(payload.get("attemptIndex")),
        "fallbackAttemptIndex": NumberOrZero(payload.get("fallbackAttemptIndex")),
        "modelCandidates": payload.get("modelCandidates") if isinstance(payload.get("modelCandidates"), list) else [],
        "errorCode": str(payload.get("errorCode", "")).strip(),
        "finishReason": str(payload.get("finishReason", "")).strip(),
        "recoveryMode": str(payload.get("recoveryMode", "")).strip(),
        "recoveryUsed": bool(payload.get("recoveryUsed")),
        "recoveryAttempts": payload.get("recoveryAttempts") if isinstance(payload.get("recoveryAttempts"), list) else [],
        "responseTextLength": NumberOrZero(payload.get("responseTextLength")),
        "parseErrorType": str(payload.get("parseErrorType", "")).strip(),
        "sourceType": str(payload.get("sourceType", "")).strip(),
        "imageCount": NumberOrZero(payload.get("imageCount")),
        "requestBodyBytes": NumberOrZero(payload.get("requestBodyBytes")),
        "responseBodyBytes": NumberOrZero(payload.get("responseBodyBytes")),
        "httpStatus": NumberOrZero(payload.get("httpStatus")),
        "latencyMs": NumberOrZero(payload.get("latencyMs")),
        "usageMetadata": payload.get("usageMetadata") if isinstance(payload.get("usageMetadata"), dict) else {},
        "responseId": str(payload.get("responseId", "")).strip(),
        "resultItemsCount": NumberOrZero(payload.get("resultItemsCount")),
        "errorMessageShort": shorten_error_message(payload.get("errorMessageShort")),
    }


def write_ai_usage_log(entry: dict[str, Any]) -> None:
    put_firestore_document(
        entry,
        "households",
        household_id(),
        AI_USAGE_LOG_COLLECTION,
        entry["id"],
    )


def load_record(collection_key: str, record_id: str) -> dict[str, Any] | None:
    document = get_firestore_document("households", household_id(), FIRESTORE_COLLECTIONS[collection_key], record_id)
    if not document:
        return None
    payload = decode_firestore_document(document)
    payload["id"] = payload.get("id") or record_id
    return payload


def save_record(
    collection_key: str,
    record: dict[str, Any],
    actor_email: str,
    expected_updated_at: str = "",
    force: bool = False,
) -> tuple[int, dict[str, Any]]:
    record_id = str(record.get("id", "")).strip()
    if not record_id:
        raise ValueError("id is required.")
    existing = load_record(collection_key, record_id)
    if existing and expected_updated_at and not force:
        current_updated_at = str(existing.get("updatedAt", "")).strip()
        if current_updated_at and current_updated_at != expected_updated_at:
            return 409, {
                "error": "Record was updated on another device.",
                "code": "record_conflict",
                "currentRecord": existing,
            }
    record_id, payload, settings, serial_updated = prepare_record_payload(collection_key, record, actor_email, existing)
    put_firestore_document(payload, "households", household_id(), FIRESTORE_COLLECTIONS[collection_key], record_id)
    if serial_updated:
        save_shared_settings(settings, actor_email)
    activity_entry = build_activity_log_entry(
        collection_key,
        "update" if existing else "create",
        actor_email,
        payload,
        before_state=existing,
        after_state=payload,
    )
    write_activity_log(activity_entry)
    if not existing:
        send_pwa_push_notification(collection_key, "create", actor_email, payload, activity_entry)
        send_discord_activity_notification(collection_key, "create", actor_email, payload, activity_entry)
    return 200 if existing else 201, {
        "record": payload,
        "activityLog": activity_entry,
        "serialCounters": settings.get("serialCounters") if isinstance(settings, dict) else {},
    }


def delete_record(
    collection_key: str,
    record_id: str,
    actor_email: str,
    expected_updated_at: str = "",
    force: bool = False,
) -> tuple[int, dict[str, Any]]:
    existing = load_record(collection_key, record_id)
    if not existing:
        return 200, {"deleted": True, "recordId": record_id}
    if expected_updated_at and not force:
        current_updated_at = str(existing.get("updatedAt", "")).strip()
        if current_updated_at and current_updated_at != expected_updated_at:
            return 409, {
                "error": "Record was updated on another device.",
                "code": "record_conflict",
                "currentRecord": existing,
            }
    delete_firestore_document("households", household_id(), FIRESTORE_COLLECTIONS[collection_key], record_id)
    activity_entry = build_activity_log_entry(
        collection_key,
        "delete",
        actor_email,
        existing,
        before_state=existing,
        after_state=None,
    )
    write_activity_log(activity_entry)
    send_pwa_push_notification(collection_key, "delete", actor_email, existing, activity_entry)
    send_discord_activity_notification(collection_key, "delete", actor_email, existing, activity_entry)
    return 200, {"deleted": True, "recordId": record_id, "activityLog": activity_entry}


def save_shared_state(payload: dict[str, Any], actor_email: str) -> None:
    for key, collection_name in FIRESTORE_COLLECTIONS.items():
        records = payload.get(key)
        normalized_records = records if isinstance(records, list) else []
        
        # 安全ガード: 既存データがあるのに送信データが空の場合、上書き（全削除）を拒否
        existing_docs = list_firestore_documents(collection_name)
        if len(existing_docs) > 0 and len(normalized_records) == 0:
            print(f"Safety Guard: Blocked overwriting collection '{key}' with empty records. Existing count: {len(existing_docs)}.")
            raise RuntimeError(f"Safety Guard: Prevented accidental deletion of all records in '{key}'. Existing document count: {len(existing_docs)}.")
            
        for existing in existing_docs:
            document_id = existing.get("name", "").rsplit("/", 1)[-1]
            if document_id:
                delete_firestore_document("households", household_id(), collection_name, document_id)
        for record in normalized_records:
            record_id = str(record.get("id", "")).strip()
            if not record_id:
                continue
            put_firestore_document(record, "households", household_id(), collection_name, record_id)

    categories = payload.get("categories")
    other_payment_methods = payload.get("otherPaymentMethods")
    serial_counters = payload.get("serialCounters")
    dashboard_budget_config = payload.get("dashboardBudgetConfig")
    category_master_config = payload.get("categoryMasterConfig")
    settlement_rules = payload.get("settlementRules")
    recurring_template_config = payload.get("recurringTemplateConfig")
    household_pool_config = payload.get("householdPoolConfig")
    monthly_close_config = payload.get("monthlyCloseConfig")
    save_shared_settings(
        {
            "categories": categories if isinstance(categories, list) else [],
            "otherPaymentMethods": other_payment_methods if isinstance(other_payment_methods, list) else [],
            "serialCounters": serial_counters if isinstance(serial_counters, dict) else {},
            "dashboardBudgetConfig": dashboard_budget_config if isinstance(dashboard_budget_config, dict) else {},
            "categoryMasterConfig": category_master_config if isinstance(category_master_config, dict) else {},
            "settlementRules": settlement_rules if isinstance(settlement_rules, dict) else {},
            "householdPoolConfig": household_pool_config if isinstance(household_pool_config, dict) else {},
            "recurringTemplateConfig": recurring_template_config if isinstance(recurring_template_config, dict) else {},
            "monthlyCloseConfig": monthly_close_config if isinstance(monthly_close_config, dict) else {},
        },
        actor_email,
    )


def cors_headers() -> dict[str, str]:
    origin = request.headers.get("Origin", "")
    allowed = allowed_origins()
    if origin and (not allowed or origin in allowed):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Kakeibo-Session",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }

    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Kakeibo-Session",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    }


def json_response(payload: dict[str, Any], status: int = 200):
    response = jsonify(payload)
    response.status_code = status
    for key, value in cors_headers().items():
        response.headers[key] = value
    return response


def should_disable_cache(path: str) -> bool:
    normalized = str(path or "/")
    if normalized == "/" or normalized.startswith("/api/"):
        return True
    return normalized.endswith((".html", ".js", ".css"))


def auth_required_payload() -> tuple[dict[str, Any] | None, Any | None]:
    try:
        return verify_state_request(), None
    except PermissionError as error:
        return None, json_response({"error": str(error)}, 401)
    except Exception as error:
        return None, json_response({"error": f"Auth verification failed: {error}"}, 401)


@app.after_request
def apply_cors(response):
    for key, value in cors_headers().items():
        response.headers[key] = value
    if should_disable_cache(request.path):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response


@app.route("/health", methods=["GET"])
def health():
    return json_response({"ok": True})

@app.route("/api/auth/session", methods=["OPTIONS", "GET", "DELETE"])
def auth_session():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    if request.method == "GET":
        user, diagnostics = inspect_cookie_session()
        session_data = None
        if not user:
            header_user, header_diagnostics = inspect_header_session()
            if header_user:
                user = header_user
                diagnostics = {
                    "cookiePresent": False,
                    "sessionFound": bool(header_diagnostics.get("sessionFound")),
                    "sessionValid": bool(header_diagnostics.get("sessionValid")),
                    "expiresAt": str(header_diagnostics.get("expiresAt", "")).strip(),
                    "reason": "authenticated_via_header",
                    "headerPresent": bool(header_diagnostics.get("headerPresent")),
                }
                session_data = get_auth_session(str(user.get("sessionId", "")).strip())
        if not user:
            response = json_response({
                "authenticated": False,
                "user": None,
                "session": None,
                "diagnostics": diagnostics,
            })
            if diagnostics.get("cookiePresent"):
                clear_auth_session_cookie(response)
            return response
        if not session_data:
            session_data = get_auth_session(str(user.get("sessionId", "")).strip())
        response = json_response({
            "authenticated": True,
            "user": {
                "email": user.get("email", ""),
                "name": user.get("name", ""),
                "provider": "google",
            },
            "session": build_session_meta_payload(session_data or {
                "id": user.get("sessionId", ""),
                "expiresAt": user.get("sessionExpiresAt", ""),
            }),
            "diagnostics": diagnostics,
        })
        if session_data:
            set_auth_session_cookie(response, str(session_data.get("id", "")).strip())
        return response

    session_id = str(request.cookies.get(session_cookie_name(), "")).strip() or str(request.headers.get("X-Kakeibo-Session", "")).strip()
    if session_id:
        try:
            delete_auth_session(session_id)
        except Exception:
            pass
    response = json_response({"ok": True, "authenticated": False})
    return clear_auth_session_cookie(response)


@app.route("/api/auth/session/google", methods=["OPTIONS", "POST"])
def auth_session_google():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    payload = request.get_json(silent=True) or {}
    credential = str(payload.get("credential", "")).strip()
    if not credential:
        return json_response({"error": "credential is required."}, 400)
    try:
        user = verify_google_token_string(credential)
    except PermissionError as error:
        return json_response({"error": str(error)}, 401)
    except Exception as error:
        return json_response({"error": f"Auth verification failed: {error}"}, 401)

    current_session_id = str(request.cookies.get(session_cookie_name(), "")).strip() or str(request.headers.get("X-Kakeibo-Session", "")).strip()
    if current_session_id:
        try:
            delete_auth_session(current_session_id)
        except Exception:
            pass

    session_data = create_auth_session(user)
    response = json_response({
        "ok": True,
        "authenticated": True,
        "user": {
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "provider": "google",
        },
        "session": build_session_meta_payload(session_data),
    })
    return set_auth_session_cookie(response, session_data["id"])


@app.route("/api/auth/session/restore", methods=["OPTIONS", "POST"])
def auth_session_restore():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    payload = request.get_json(silent=True) or {}
    session_id = str(payload.get("sessionId", "")).strip()
    if not session_id:
        return json_response({"error": "sessionId is required."}, 400)

    session_data = get_auth_session(session_id)
    if not session_data:
        response = json_response({"error": "session not found."}, 401)
        return clear_auth_session_cookie(response)

    expires_at = parse_iso_datetime(session_data.get("expiresAt"))
    if not expires_at or expires_at <= utc_now():
        try:
            delete_auth_session(session_id)
        except Exception:
            pass
        response = json_response({"error": "session expired."}, 401)
        return clear_auth_session_cookie(response)

    email = str(session_data.get("email", "")).strip().lower()
    if not email or email not in allowed_emails():
        response = json_response({"error": "session email is not allowed."}, 401)
        return clear_auth_session_cookie(response)

    response = json_response({
        "ok": True,
        "authenticated": True,
        "user": {
            "email": email,
            "name": str(session_data.get("name", "") or email).strip(),
            "provider": "google",
        },
        "session": build_session_meta_payload(session_data),
    })
    return set_auth_session_cookie(response, session_id)


@app.route("/", methods=["GET"])
def root():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>", methods=["GET"])
def frontend_assets(path: str):
    target = BASE_DIR / path
    if target.is_file():
        return send_from_directory(BASE_DIR, path)
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/api/receipt/analyze", methods=["OPTIONS", "POST"])
def analyze_receipt():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    payload = request.get_json(silent=True) or {}
    image_base64 = payload.get("imageBase64", "")
    images = payload.get("images") or []  # [{base64, mimeType}, ...]
    source_text = str(payload.get("sourceText", "") or "").strip()
    mime_type = payload.get("mimeType", "image/jpeg")
    categories = payload.get("categories") or []
    model_policy_ok, model_policy_error = require_gemini_model_policy_config()
    if not model_policy_ok:
        return json_response({"error": model_policy_error}, 500)
    resolved_model_option, model_option_error, model_option_error_code = resolve_gemini_model_option(payload.get("modelOption"))
    if not resolved_model_option:
        return json_response({"error": model_option_error, "code": model_option_error_code}, 400)
    api_key = resolved_model_option["apiKey"]
    selected_model_option = resolved_model_option["selectedModelOption"]
    selected_api_tier = resolved_model_option["selectedApiTier"]
    model_candidates = resolved_model_option["modelCandidates"]
    primary_model = model_candidates[0]

    if not image_base64 and not images and not source_text:
        return json_response({"error": "images または sourceText のどちらかが必要です。"}, 400)

    if source_text:
        prompt = "\n".join(
            [
                "あなたは家計簿入力支援AIです。",
                "貼り付けられた Amazon / 楽天などの注文確認メール本文を読み、家計簿入力用 JSON のみ返してください。",
                "おすすめ商品や広告、フッター、再購入案内、これにも注目、著作権表記は無視してください。",
                "キーは storeName, amount, grossAmount, pointCredit, category, date, memo, paymentMethod, invoiceNumber, items, taxSummary, memoWarnings。",
                f"category は次の候補から選んでください: {', '.join(categories)}",
                "amount は家計簿上の支出額（grossAmount - pointCredit）を数値で返してください。",
                "grossAmount は注文総額、pointCredit は今回付与予定ポイントです。なければ 0。",
                "date は注文日時や受信日時から YYYY-MM-DD 形式で返してください。",
                "paymentMethod は本文に支払い方法があれば文字列で返してください。なければ空文字。",
                "invoiceNumber は注文メールに含まれていれば返し、通常なければ空文字。",
                "items は複数商品がある場合は必ず配列で返してください。各要素は name, storeName, rawAmount, amountType, amount, category, memo, quantity, taxRate, taxIncludedAmount, taxIncludedAmountBasis, confidence, note を持ちます。",
                "items.storeName には店舗名ではなく商品名・明細名を入れてください。全商品を『Amazon』『楽天市場』『無印良品』のような店舗名だけにするのは禁止です。",
                "items.name と items.storeName は同じ商品名でよいです。既存互換のため storeName も必ず入れてください。",
                "同じ注文内で複数商品がある場合は、各 item の storeName ができるだけ別の商品名になるように抽出してください。",
                "taxIncludedAmount は税込金額です。本文に税込金額が明記されている場合はその金額を使い、taxIncludedAmountBasis は receipt_explicit にしてください。",
                "税抜金額しかなく税率が明確な場合だけ税込換算し、taxIncludedAmountBasis は calculated にしてください。端数処理が不明な場合は無理に補正しないでください。",
                "税率や税込/税抜が不明な場合は taxRate=null, taxIncludedAmount=null, taxIncludedAmountBasis=unknown, amountType=unknown にしてください。税率が不明なのに8%/10%を断定しないでください。",
                "items.amount は各商品の保存参考額として税込金額が明確なら税込金額、税込不明なら読み取れた金額を入れてください。送料や値引きが独立している場合は、それも明細として分けてよいです。",
                "rawAmount は本文から直接読めた商品行の金額、amountType は tax_included / tax_excluded / unknown のいずれかにしてください。",
                "confidence は high / medium / low のいずれかにしてください。読み取りが怪しい商品は confidence=low にし、note に理由を短く入れてください。",
                "taxSummary は税率別の配列で返してください。各要素は taxRate, taxIncludedTotal, taxableSubtotal, taxAmount, basis を持ちます。分からない値は null にしてください。",
                "memoWarnings は読み取り不確実な点を短い文字列配列で返してください。問題がなければ空配列にしてください。",
                "差額調整、合計調整、帳尻合わせのためのダミー明細は絶対に作らないでください。合計が合わない場合は、明細の取りこぼしや 9/0/8 の読み違いを疑って明細を見直してください。",
                "items の税込み合計が grossAmount と合わない場合でも、無理に補正したりダミー明細を作ったりしないでください。取りこぼしや判読不能明細は memoWarnings に短く残してください。",
                "商品別明細の合計と注文総額が合わない場合でも、grossAmount は注文総額を優先し、商品別明細のために総額を変えないでください。",
                "複数商品メールでは、注文全体を 1件にまとめるための grossAmount / pointCredit / amount も返しつつ、items で商品ごとの明細候補を返してください。",
                "単一商品の場合 items は空配列でよいです。",
                "ポイント付与が本文にあれば必ず pointCredit に入れてください。",
                "memo には、本文から読み取れた商品名と単価・数量を『商品名 単価×数量』形式で列挙してください。例: 牛乳 198×2 / パン 145 / 送料 550。grossAmount や合計行は含めず、商品明細だけ残してください。商品が多すぎて入らない場合は上位から記載してください。",
                "必ず JSON オブジェクトだけを返してください。",
            ]
        )
    else:
        prompt = "\n".join(
            [
                "あなたは家計簿入力支援AIです。",
                "レシート画像またはPDFを読んで JSON のみ返してください。",
                "キーは storeName, amount, grossAmount, pointCredit, category, date, memo, paymentMethod, invoiceNumber, items, taxSummary, memoWarnings。",
                f"category は次の候補から選んでください: {', '.join(categories)}",
                "amount は家計簿上の支出額（grossAmount - pointCredit）を数値で返してください。",
                "grossAmount はレシート総額、pointCredit はポイント還元が分かる場合のみ数値で返し、なければ 0。",
                "date は YYYY-MM-DD 形式。",
                "paymentMethod はレシートに記載された支払い方法を文字列で返してください（例: 楽天ペイ、PayPay、現金、クレジットカード、Suica）。記載がなければ空文字。",
                "invoiceNumber はレシートに記載されたTから始まる適格請求書発行事業者登録番号（インボイス番号）を返してください。記載がなければ空文字。",
                "複数の商品明細が読み取れるレシートでは items を配列で返してください。各要素は name, storeName, rawAmount, amountType, amount, category, memo, quantity, taxRate, taxIncludedAmount, taxIncludedAmountBasis, confidence, note を持ちます。",
                "items.storeName には店舗名ではなく商品名・明細名を入れてください。全商品を『無印良品』のような店舗名だけにするのは禁止です。",
                "items.name と items.storeName は同じ商品名でよいです。既存互換のため storeName も必ず入れてください。",
                "同じレシート内で複数商品がある場合は、読み取れる商品行を上から順に個別の item として返してください。判読不能な商品行は創作せず、memoWarnings に短く残してください。",
                "【税率の読み方】日本のスーパーのレシートは商品名の末尾や右側に ※ や ☆ などの記号で税率区分を示すことがあります（例: ※=軽減税率8%、記号なし=標準税率10%）。または税率欄（%列）が印字される場合もあります。各商品の税率区分を正確に読み取り、taxRate に 8 または 10 を入れてください。",
                "taxIncludedAmount は税込金額です。レシートの商品行に税込金額が明記されている場合は、その金額を使い、taxIncludedAmountBasis は receipt_explicit にしてください。",
                "税抜金額しかなく、税率が明確な場合だけ税込換算し、taxIncludedAmountBasis は calculated にしてください。税込換算に使った税抜値は rawAmount または taxExcludedAmount に残してください。",
                "税率や税込/税抜が不明な場合は taxRate=null, taxIncludedAmount=null, taxIncludedAmountBasis=unknown, amountType=unknown にしてください。税率が不明なのに8%/10%を断定しないでください。",
                "端数処理が不明な場合は無理に補正しないでください。商品別明細の合計とレシート総額が合わない場合は、レシート総額を優先してください。",
                "items.amount は各商品の保存参考額として税込金額が明確なら税込金額、税込不明なら読み取れた金額を入れてください。税率8%と10%の商品が混在している場合でも、各商品ごとに正しい税率を個別に適用してください。値引きや割引が独立している場合は負数の明細として返してよいです。",
                "rawAmount はレシートから直接読めた商品行の金額、amountType は tax_included / tax_excluded / unknown のいずれかにしてください。",
                "confidence は high / medium / low のいずれかにしてください。読み取りが怪しい商品は confidence=low にし、note に理由を短く入れてください。",
                "taxSummary は税率別の配列で返してください。各要素は taxRate, taxIncludedTotal, taxableSubtotal, taxAmount, basis を持ちます。分からない値は null にしてください。",
                "memoWarnings は読み取り不確実な点を短い文字列配列で返してください。問題がなければ空配列にしてください。",
                "商品名を創作しないでください。不明な金額を作らないでください。",
                "差額調整、合計調整、帳尻合わせのためのダミー明細は絶対に作らないでください。レシート総額と items 合計が合わない場合は、明細の取りこぼしや 9/0/8 の読み違いを疑って再確認してください。特に 590/599 や 650/659 のような1桁違いに注意してください。",
                "返答前に、items の税込み合計と grossAmount の差を確認してください。差額が残る場合でも、帳尻合わせはせず、欠けている可能性や判読不能箇所を memoWarnings に短く書いてください。",
                "商品別明細のためにレシート総額を変えないでください。家計簿保存ではレシート総額を主役にします。",
                "小計、会計合計、消費税等、お預り、お釣り、ポイント、決済情報は商品明細として items に入れないでください。",
                "単一明細しか読めない場合のみ items は空配列でよいです。",
                "必ず JSON オブジェクトだけを返してください。",
            ]
        )

    if source_text:
        parts = [{"text": prompt}, {"text": f"本文:\n{source_text}"}]
    elif images:
        image_parts = [
            {"inlineData": {"mimeType": img.get("mimeType", "image/jpeg"), "data": img.get("base64", "")}}
            for img in images if img.get("base64")
        ]
        parts = [{"text": prompt}] + image_parts
    else:
        parts = [{"text": prompt}, {"inlineData": {"mimeType": mime_type, "data": image_base64}}]

    gemini_payload = build_gemini_payload(parts, GEMINI_RECEIPT_RESPONSE_SCHEMA)
    source_type = "text" if source_text else "image"
    image_count = len(images) if images else (1 if image_base64 else 0)
    request_body_bytes = len(
        json.dumps(gemini_payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    gemini_response = None
    latency_ms = 0
    response_body_bytes = 0
    error_body: Any = {}
    request_exception: requests.RequestException | None = None
    usage_metadata: dict[str, Any] = {}
    response_id = ""
    result: dict[str, Any] | None = None
    used_model = primary_model
    fallback_reason = ""
    fallback_attempt_index = 0
    parse_error_message = ""
    error_code = ""
    finish_reason = ""
    recovery_mode = "standard"
    recovery_used = False
    response_text_length = 0
    parse_error_type = ""
    recovery_attempts: list[dict[str, Any]] = []

    def run_gemini_attempt(candidate_model: str, payload_for_attempt: dict[str, Any], mode: str, attempt_index: int) -> tuple[dict[str, Any] | None, str]:
        nonlocal gemini_response, latency_ms, response_body_bytes, error_body, request_exception
        nonlocal usage_metadata, response_id, used_model, fallback_attempt_index, parse_error_message
        nonlocal error_code, finish_reason, recovery_mode, recovery_used, response_text_length, parse_error_type

        used_model = candidate_model
        fallback_attempt_index = model_candidates.index(candidate_model) if candidate_model in model_candidates else attempt_index
        recovery_mode = mode
        recovery_used = recovery_used or mode != "standard" or fallback_attempt_index > 0
        request_exception = None
        usage_metadata = {}
        response_id = ""
        parse_error_message = ""
        text_for_repair = ""
        attempt_record: dict[str, Any] = {
            "attemptIndex": attempt_index,
            "model": candidate_model,
            "recoveryMode": mode,
        }
        try:
            call_result = call_gemini_model(api_key, candidate_model, payload_for_attempt)
            gemini_response = call_result["response"]
            latency_ms = call_result["latencyMs"]
            response_body_bytes = call_result["responseBodyBytes"]
        except requests.RequestException as error:
            request_exception = error
            error_reason = gemini_request_exception_reason(error)
            error_body = {"message": "Gemini request failed.", "reason": error_reason}
            error_code = GEMINI_ERROR_TEMPORARY if should_fallback_gemini_request_exception(error) else "GEMINI_REQUEST_ERROR"
            parse_error_type = error_reason
            attempt_record.update({"errorCode": error_code, "parseErrorType": parse_error_type})
            recovery_attempts.append(attempt_record)
            return None, text_for_repair

        attempt_record["httpStatus"] = gemini_response.status_code
        if not gemini_response.ok:
            error_body = gemini_error_response_body(gemini_response)
            error_code = classify_gemini_error_response(gemini_response, error_body)
            parse_error_type = f"http_{gemini_response.status_code}"
            attempt_record.update({"errorCode": error_code, "parseErrorType": parse_error_type})
            recovery_attempts.append(attempt_record)
            return None, text_for_repair

        try:
            data = gemini_response.json()
        except ValueError:
            error_code = GEMINI_ERROR_INVALID_JSON
            parse_error_type = "response_envelope_json"
            parse_error_message = "Gemini response envelope was not valid JSON."
            attempt_record.update({"errorCode": error_code, "parseErrorType": parse_error_type})
            recovery_attempts.append(attempt_record)
            return None, text_for_repair
        if not isinstance(data, dict):
            error_code = GEMINI_ERROR_INVALID_JSON
            parse_error_type = "response_envelope_type"
            parse_error_message = "Gemini response envelope was not an object."
            attempt_record.update({"errorCode": error_code, "parseErrorType": parse_error_type})
            recovery_attempts.append(attempt_record)
            return None, text_for_repair

        usage_metadata = data.get("usageMetadata", {}) if isinstance(data.get("usageMetadata"), dict) else {}
        response_id = str(data.get("responseId", "") or "")
        parsed_result, candidate_meta = parse_gemini_candidate(data)
        finish_reason = str(candidate_meta.get("finishReason", "") or "")
        response_text_length = NumberOrZero(candidate_meta.get("candidateTextLength"))
        text_for_repair = ""
        candidates = data.get("candidates") if isinstance(data.get("candidates"), list) else []
        first_candidate = candidates[0] if candidates and isinstance(candidates[0], dict) else {}
        content = first_candidate.get("content") if isinstance(first_candidate.get("content"), dict) else {}
        parts_list = content.get("parts") if isinstance(content.get("parts"), list) else []
        first_part = parts_list[0] if parts_list and isinstance(parts_list[0], dict) else {}
        if first_part:
            text_for_repair = str(first_part.get("text", "") or "")
        attempt_record.update({
            "finishReason": finish_reason,
            "responseTextLength": response_text_length,
        })

        if not isinstance(parsed_result, dict):
            error_code = GEMINI_ERROR_EMPTY_RESPONSE if candidate_meta.get("emptyResponse") else gemini_error_code_for_finish_reason(finish_reason)
            parse_error_type = "empty_response" if error_code == GEMINI_ERROR_EMPTY_RESPONSE else "json_parse"
            parse_error_message = (
                "Gemini response was empty."
                if error_code == GEMINI_ERROR_EMPTY_RESPONSE
                else "Gemini response was not valid JSON."
            )
            attempt_record.update({"errorCode": error_code, "parseErrorType": parse_error_type})
            recovery_attempts.append(attempt_record)
            return None, text_for_repair

        error_code = ""
        parse_error_type = ""
        attempt_record.update({"errorCode": "", "parseErrorType": "", "success": True})
        recovery_attempts.append(attempt_record)
        return coerce_receipt_result_aliases(parsed_result), text_for_repair

    attempt_counter = 0
    minimal_payload_cache: dict[str, Any] | None = None

    def minimal_payload_for_request() -> dict[str, Any]:
        nonlocal minimal_payload_cache
        if minimal_payload_cache is not None:
            return minimal_payload_cache
        minimal_prompt = build_minimal_receipt_prompt(categories)
        if source_text:
            minimal_parts = [{"text": minimal_prompt}, {"text": f"本文:\n{source_text}"}]
        elif images:
            minimal_parts = [{"text": minimal_prompt}] + image_parts
        else:
            minimal_parts = [{"text": minimal_prompt}, {"inlineData": {"mimeType": mime_type, "data": image_base64}}]
        minimal_payload_cache = build_gemini_payload(
            minimal_parts,
            GEMINI_MINIMAL_RECEIPT_RESPONSE_SCHEMA,
            max_output_tokens=min(gemini_max_output_tokens(), 768),
        )
        return minimal_payload_cache

    def run_model_with_recovery(candidate_model: str) -> bool:
        nonlocal attempt_counter, result
        parsed, repair_text = run_gemini_attempt(candidate_model, gemini_payload, "standard", attempt_counter)
        attempt_counter += 1
        if isinstance(parsed, dict):
            result = parsed
            return True
        if error_code in {GEMINI_ERROR_RATE_LIMIT, GEMINI_ERROR_TEMPORARY, GEMINI_ERROR_SAFETY_BLOCK, GEMINI_ERROR_AUTH}:
            return False

        if repair_text and error_code == GEMINI_ERROR_INVALID_JSON:
            repaired, _ = run_gemini_attempt(candidate_model, build_repair_payload(repair_text), "repair", attempt_counter)
            attempt_counter += 1
            if isinstance(repaired, dict):
                result = repaired
                return True
            if error_code in {GEMINI_ERROR_RATE_LIMIT, GEMINI_ERROR_TEMPORARY, GEMINI_ERROR_SAFETY_BLOCK, GEMINI_ERROR_AUTH}:
                return False

        if error_code not in {GEMINI_ERROR_SAFETY_BLOCK, GEMINI_ERROR_AUTH, GEMINI_ERROR_RATE_LIMIT, GEMINI_ERROR_TEMPORARY}:
            minimal, _ = run_gemini_attempt(candidate_model, minimal_payload_for_request(), "minimal", attempt_counter)
            attempt_counter += 1
            if isinstance(minimal, dict) and to_number(minimal.get("grossAmount") or minimal.get("amount")) is not None:
                result = minimal
                return True
        return False

    candidate_index = 0
    while candidate_index < len(model_candidates):
        candidate_model = model_candidates[candidate_index]
        if run_model_with_recovery(candidate_model):
            break
        next_model = model_candidates[candidate_index + 1] if candidate_index + 1 < len(model_candidates) else ""
        if next_model and should_cross_model_fallback(
            selected_model_option,
            selected_api_tier,
            candidate_model,
            next_model,
            error_code,
        ):
            fallback_reason = fallback_reason or (error_code.lower() if error_code else "model_fallback")
            candidate_index += 1
            continue
        break

    fallback_chain = [
        {
            "attemptIndex": NumberOrZero(item.get("attemptIndex")),
            "model": str(item.get("model", "")).strip(),
            "recoveryMode": str(item.get("recoveryMode", "")).strip(),
            "errorCode": str(item.get("errorCode", "")).strip(),
        }
        for item in recovery_attempts
        if isinstance(item, dict)
    ]
    final_attempt_index = NumberOrZero(fallback_chain[-1].get("attemptIndex")) if fallback_chain else 0

    ai_meta = {
        "modelOption": selected_model_option,
        "keyTier": selected_api_tier,
        "selectedModelOption": selected_model_option,
        "selectedApiTier": selected_api_tier,
        "primaryModel": primary_model,
        "usedModel": used_model,
        "fallbackUsed": fallback_attempt_index > 0,
        "fallbackReason": fallback_reason if fallback_attempt_index > 0 else "",
        "fallbackChain": fallback_chain,
        "attemptIndex": final_attempt_index,
        "recoveryUsed": recovery_used,
        "recoveryMode": recovery_mode,
        "errorCode": error_code,
        "finishReason": finish_reason,
    }
    usage_log_common = {
        "modelOption": selected_model_option,
        "keyTier": selected_api_tier,
        "selectedModelOption": selected_model_option,
        "selectedApiTier": selected_api_tier,
        "model": used_model,
        "primaryModel": primary_model,
        "usedModel": used_model,
        "fallbackUsed": ai_meta["fallbackUsed"],
        "fallbackReason": ai_meta["fallbackReason"],
        "fallbackChain": fallback_chain,
        "attemptIndex": final_attempt_index,
        "fallbackAttemptIndex": fallback_attempt_index,
        "modelCandidates": model_candidates,
        "errorCode": error_code,
        "finishReason": finish_reason,
        "recoveryMode": recovery_mode,
        "recoveryUsed": recovery_used,
        "recoveryAttempts": recovery_attempts,
        "responseTextLength": response_text_length,
        "parseErrorType": parse_error_type,
        "sourceType": source_type,
        "imageCount": image_count,
        "requestBodyBytes": request_body_bytes,
        "responseBodyBytes": response_body_bytes,
        "httpStatus": gemini_response.status_code if gemini_response is not None else 0,
        "latencyMs": latency_ms,
        "usageMetadata": usage_metadata,
        "responseId": response_id,
    }

    if request_exception is not None and (gemini_response is None or not gemini_response.ok):
        try:
            write_ai_usage_log(
                build_ai_usage_log_entry(
                    {
                        **usage_log_common,
                        "responseBodyBytes": 0,
                        "httpStatus": 0,
                        "resultItemsCount": 0,
                        "errorMessageShort": error_body.get("message", "Gemini request failed."),
                    }
                )
            )
        except Exception as log_error:
            app.logger.warning("Failed to write aiUsageLogs for request exception: %s", log_error)
        return json_response(
            {"error": "Gemini request failed.", "code": error_code or GEMINI_ERROR_TEMPORARY, "aiMeta": ai_meta},
            502,
        )

    if gemini_response is None:
        return json_response({"error": "Gemini response was empty.", "code": GEMINI_ERROR_EMPTY_RESPONSE, "aiMeta": ai_meta}, 502)

    if not gemini_response.ok:
        try:
            write_ai_usage_log(
                build_ai_usage_log_entry(
                    {
                        **usage_log_common,
                        "usageMetadata": {},
                        "responseId": "",
                        "resultItemsCount": 0,
                        "errorMessageShort": extract_gemini_error_message(error_body),
                    }
                )
            )
        except Exception as log_error:
            app.logger.warning("Failed to write aiUsageLogs for error response: %s", log_error)
        return json_response(
            {
                "error": {
                    "status": gemini_response.status_code,
                    "details": error_body,
                },
                "code": error_code or gemini_error_code_for_http_status(gemini_response.status_code),
                "aiMeta": ai_meta,
            },
            gemini_response.status_code,
        )

    if not isinstance(result, dict):
        try:
            write_ai_usage_log(
                build_ai_usage_log_entry(
                    {
                        **usage_log_common,
                        "resultItemsCount": 0,
                        "errorMessageShort": parse_error_message or "Gemini response was not valid JSON.",
                    }
                )
            )
        except Exception as log_error:
            app.logger.warning("Failed to write aiUsageLogs for invalid JSON: %s", log_error)
        user_error = "AI応答の形式が崩れたため再試行しましたが、JSONとして復元できませんでした。撮り直し、別のFreeモデル選択、または手入力を試してください。"
        if error_code == GEMINI_ERROR_MAX_TOKENS:
            user_error = "AI応答が長すぎて途中で切れました。最小JSONでも復元できなかったため、撮り直しまたは手入力を試してください。"
        elif error_code == GEMINI_ERROR_EMPTY_RESPONSE:
            user_error = "AI応答本文が空でした。撮り直し、別のFreeモデル選択、または手入力を試してください。"
        elif error_code == GEMINI_ERROR_SAFETY_BLOCK:
            user_error = "AIの安全フィルタにより解析結果を返せませんでした。画像を確認して撮り直すか、手入力してください。"
        return json_response(
            {
                "error": user_error,
                "code": error_code or GEMINI_ERROR_INVALID_JSON,
                "aiMeta": ai_meta,
            },
            502,
        )

    result = normalize_receipt_result_amounts(result, source_type)

    result_items_count = len(result.get("items", [])) if isinstance(result.get("items"), list) else 0
    try:
        write_ai_usage_log(
            build_ai_usage_log_entry(
                {
                    **usage_log_common,
                    "resultItemsCount": result_items_count,
                    "errorMessageShort": "",
                }
            )
        )
    except Exception as log_error:
        app.logger.warning("Failed to write aiUsageLogs for success response: %s", log_error)

    return json_response({"result": result, "aiMeta": ai_meta})


@app.route("/api/receipt/intake", methods=["OPTIONS", "POST"])
def receipt_intake():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    if not receipt_temp_bucket_name():
        return json_response(
            {"error": "RECEIPT_TEMP_BUCKET が未設定です。", "code": "receipt_temp_bucket_missing"},
            503,
        )

    upload = request.files.get("file")
    if not upload:
        return json_response({"error": "file is required."}, 400)

    file_bytes = upload.read()
    if not file_bytes:
        return json_response({"error": "empty file is not allowed."}, 400)

    try:
        asset = create_receipt_asset(
            file_bytes=file_bytes,
            file_name=upload.filename or "receipt-image",
            mime_type=upload.mimetype or "application/octet-stream",
            owner_email=auth_payload["email"],
        )
        return json_response(
            {
                "asset": asset,
                "serviceAccountEmail": drive_runtime_service_account_email(),
            },
            201,
        )
    except Exception as error:
        return json_response({"error": f"Failed to intake receipt image: {error}"}, 500)


@app.route("/api/receipt/finalize", methods=["OPTIONS", "POST"])
def receipt_finalize():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    payload = request.get_json(silent=True) or {}
    asset_id = str(payload.get("assetId", "")).strip()
    record_ids = payload.get("recordIds") if isinstance(payload.get("recordIds"), list) else []
    file_context = payload.get("fileContext") if isinstance(payload.get("fileContext"), dict) else {}

    if not asset_id:
        return json_response({"error": "assetId is required."}, 400)
    if not record_ids:
        return json_response({"error": "recordIds is required."}, 400)

    normalized_record_ids = [str(record_id or "").strip() for record_id in record_ids if str(record_id or "").strip()]
    if not normalized_record_ids:
        return json_response({"error": "recordIds is required."}, 400)

    existing_records: list[dict[str, Any]] = []
    for record_id in normalized_record_ids:
        record = load_record("expenses", record_id)
        if not record:
            return json_response({"error": f"Expense not found: {record_id}"}, 404)
        existing_records.append(record)

    already_uploaded = [
        record for record in existing_records
        if str(record.get("receiptDriveFileId", "") or record.get("receiptFileId", "")).strip()
    ]
    if len(already_uploaded) == len(existing_records):
        return json_response(
            {
                "records": existing_records,
                "receipt": {
                    "receiptUrl": str(already_uploaded[0].get("receiptDriveUrl") or already_uploaded[0].get("receiptUrl") or "").strip(),
                    "receiptFileId": str(already_uploaded[0].get("receiptDriveFileId") or already_uploaded[0].get("receiptFileId") or "").strip(),
                    "receiptUploadedAt": str(already_uploaded[0].get("receiptUploadedAt", "")).strip(),
                    "receiptUploadStatus": str(already_uploaded[0].get("receiptUploadStatus", "")).strip() or "success",
                    "receiptUploaderName": str(already_uploaded[0].get("receiptUploaderName", "")).strip(),
                },
                "alreadyUploaded": True,
            }
        )

    try:
        asset = load_receipt_asset(asset_id)
        merged_file_context = {
            **build_receipt_drive_group_context(existing_records),
            **file_context,
        }
        filename = build_receipt_drive_filename(
            file_context=merged_file_context,
            owner_email=asset["ownerEmail"] or auth_payload["email"],
            source_file_name=asset["originalFileName"],
            mime_type=asset["mimeType"],
        )
        try:
            uploaded = upload_receipt_bytes_to_drive(
                file_bytes=asset["bytes"],
                mime_type=asset["mimeType"],
                filename=filename,
                owner_email=asset["ownerEmail"] or auth_payload["email"],
            )
            next_fields = {
                "receiptUrl": uploaded["url"],
                "receiptFileId": uploaded["id"],
                "receiptDriveUrl": uploaded["url"],
                "receiptDriveFileId": uploaded["id"],
                "receiptUploadedAt": uploaded["uploadedAt"],
                "receiptUploadStatus": "success",
                "receiptUploaderName": uploaded.get("uploaderName") or person_display_name(asset["ownerEmail"] or auth_payload["email"]),
                "receiptStorageAssetId": asset_id,
                "receiptStorageStatus": "finalized",
                "receiptStorageUploadedAt": asset.get("uploadedAt", ""),
                "receiptStorageFinalizedAt": uploaded["uploadedAt"],
            }
            should_delete_temp_asset = True
        except PermissionError as drive_error:
            permanent_asset = promote_receipt_asset_to_permanent(asset_id)
            fallback_uploaded_at = datetime.now(timezone.utc).isoformat()
            app.logger.warning(
                "Drive receipt upload denied; promoted asset to permanent storage: assetId=%s objectName=%s error=%s",
                asset_id,
                permanent_asset.get("objectName", ""),
                drive_error,
            )
            next_fields = {
                "receiptUrl": receipt_asset_app_url(asset_id),
                "receiptFileId": f"gcs:{asset_id}",
                "receiptDriveUrl": "",
                "receiptDriveFileId": "",
                "receiptUploadedAt": fallback_uploaded_at,
                "receiptUploadStatus": "storage_fallback",
                "receiptUploadError": str(drive_error),
                "receiptUploaderName": person_display_name(asset["ownerEmail"] or auth_payload["email"]),
                "receiptStorageAssetId": asset_id,
                "receiptStorageStatus": "permanent",
                "receiptStorageUploadedAt": asset.get("uploadedAt", ""),
                "receiptStorageFinalizedAt": fallback_uploaded_at,
            }
            should_delete_temp_asset = False
        updated_records = []
        for record_id in normalized_record_ids:
            updated = patch_expense_receipt_fields(record_id, next_fields, auth_payload["email"])
            if updated:
                updated_records.append(updated)
        if should_delete_temp_asset:
            try:
                delete_receipt_asset(asset_id)
            except Exception as cleanup_error:
                app.logger.warning("Failed to remove temporary receipt asset %s: %s", asset_id, cleanup_error)
        return json_response(
            {
                "records": updated_records,
                "receipt": next_fields,
            }
        )
    except FileNotFoundError as error:
        return json_response({"error": str(error), "code": "receipt_asset_missing"}, 404)
    except Exception as error:
        return json_response({"error": f"Failed to finalize receipt image: {error}"}, 500)


@app.route("/api/receipt/assets/<asset_id>", methods=["OPTIONS", "GET"])
def receipt_asset_download(asset_id: str):
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    try:
        asset = load_receipt_asset(str(asset_id or "").strip())
        return send_file(
            io.BytesIO(asset["bytes"]),
            mimetype=asset["mimeType"],
            download_name=asset["originalFileName"] or "receipt-image",
            as_attachment=False,
            max_age=0,
        )
    except FileNotFoundError as error:
        return json_response({"error": str(error), "code": "receipt_asset_missing"}, 404)
    except Exception as error:
        return json_response({"error": f"Failed to load receipt image: {error}"}, 500)


@app.route("/api/receipt/drive-normalize", methods=["OPTIONS", "POST"])
def receipt_drive_normalize():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    try:
        expenses = load_all_expenses()
        groups_by_file_id: dict[str, list[dict[str, Any]]] = {}
        for expense in expenses:
            drive_file_id = str(expense.get("receiptDriveFileId") or expense.get("receiptFileId") or "").strip()
            if not drive_file_id or drive_file_id.startswith("gcs:"):
                continue
            receipt_url = str(expense.get("receiptDriveUrl") or expense.get("receiptUrl") or "").strip()
            if receipt_url and not receipt_url.startswith("https://drive.google.com/") and not drive_file_id:
                continue
            groups_by_file_id.setdefault(drive_file_id, []).append(expense)

        checked = 0
        renamed = 0
        relinked = 0
        failures: list[str] = []

        for drive_file_id, records in groups_by_file_id.items():
            checked += 1
            try:
                metadata = load_drive_file_metadata(drive_file_id)

                original_file_name = ""
                original_mime_type = ""
                attachment_index = None

                for record in records:
                    assets = record.get("receiptAssets") or []
                    for asset in assets:
                        if str(asset.get("driveFileId") or asset.get("id") or "").strip() == drive_file_id:
                            original_file_name = str(asset.get("fileName") or "").strip()
                            original_mime_type = str(asset.get("mimeType") or "").strip()
                            if len(assets) > 1:
                                try:
                                    attachment_index = assets.index(asset) + 1
                                except ValueError:
                                    pass
                            break
                    if original_file_name:
                        break

                file_context = build_receipt_drive_group_context(records)
                if attachment_index:
                    file_context["attachmentIndex"] = attachment_index

                canonical_name = build_receipt_drive_filename_from_context(
                    file_context=file_context,
                    source_file_name=str(metadata.get("name", "")).strip(),
                    mime_type=str(metadata.get("mimeType", "")).strip(),
                    original_file_name=original_file_name,
                    original_mime_type=original_mime_type,
                )
                current_name = str(metadata.get("name", "")).strip()
                if current_name != canonical_name:
                    metadata = rename_drive_file(drive_file_id, canonical_name)
                    renamed += 1

                canonical_url = str(metadata.get("webViewLink", "")).strip() or f"https://drive.google.com/file/d/{drive_file_id}/view"
                normalized_fields = {
                    "receiptUrl": canonical_url,
                    "receiptFileId": drive_file_id,
                    "receiptDriveUrl": canonical_url,
                    "receiptDriveFileId": drive_file_id,
                    "receiptUploadStatus": "success",
                    "receiptUploadError": "",
                }
                for record in records:
                    needs_patch = any(str(record.get(key, "")).strip() != str(value).strip() for key, value in normalized_fields.items())
                    if not needs_patch:
                        continue
                    patched = patch_expense_receipt_fields(str(record.get("id", "")).strip(), normalized_fields, auth_payload["email"])
                    if patched:
                        relinked += 1
            except Exception as error:
                first_record = records[0] if records else {}
                failures.append(f"{str(first_record.get('serialCode') or drive_file_id).strip()}: {error}")

        return json_response(
            {
                "checked": checked,
                "renamed": renamed,
                "relinked": relinked,
                "failures": failures[:20],
            }
        )
    except Exception as error:
        return json_response({"error": f"Failed to normalize Drive receipt files: {error}"}, 500)



@app.route("/api/state", methods=["OPTIONS", "GET", "PUT"])
def shared_state():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    if request.method == "GET":
        try:
            state_payload = load_shared_state()
            return json_response(
                {
                    "storageMode": "firestore",
                    "householdId": household_id(),
                    "state": state_payload,
                }
            )
        except Exception as error:
            return json_response({"error": f"Failed to load shared state: {error}"}, 500)

    payload = request.get_json(silent=True) or {}
    next_state = payload.get("state") or {}
    if not isinstance(next_state, dict):
        return json_response({"error": "state must be an object."}, 400)

    try:
        save_shared_state(next_state, auth_payload["email"])
        state_payload = load_shared_state()
        return json_response(
            {
                "storageMode": "firestore",
                "householdId": household_id(),
                "state": state_payload,
            }
        )
    except Exception as error:
        return json_response({"error": f"Failed to save shared state: {error}"}, 500)


@app.route("/api/settings/main", methods=["OPTIONS", "GET", "PATCH"])
def shared_settings_main():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    if request.method == "GET":
        try:
            settings = load_shared_settings()
            return json_response({"settings": settings})
        except Exception as error:
            return json_response({"error": f"Failed to load shared settings: {error}"}, 500)

    payload = request.get_json(silent=True) or {}
    fields = payload.get("fields")
    if not isinstance(fields, dict):
        return json_response({"error": "fields must be an object."}, 400)
    sanitized_fields = {
        key: fields.get(key)
        for key in PATCHABLE_SHARED_SETTINGS_KEYS
        if key in fields
    }
    if not sanitized_fields:
        return json_response({"error": "No patchable shared settings fields were provided."}, 400)
    expected_updated_at = str(payload.get("expectedUpdatedAt", "")).strip()
    force = bool(payload.get("force"))
    try:
        patch_shared_settings(
            sanitized_fields,
            auth_payload["email"],
            expected_updated_at=expected_updated_at,
            force=force,
        )
        state_payload = load_shared_state()
        return json_response(
            {
                "storageMode": "firestore",
                "householdId": household_id(),
                "state": state_payload,
            }
        )
    except SharedSettingsConflictError as error:
        return json_response(
            {
                "error": str(error),
                "code": "shared_settings_conflict",
                "currentSettings": error.current_settings,
            },
            409,
        )
    except Exception as error:
        return json_response({"error": f"Failed to patch shared settings: {error}"}, 500)


@app.route("/api/activity-logs", methods=["OPTIONS", "GET"])
def activity_logs():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    try:
        return json_response({"activityLogs": load_activity_logs()})
    except Exception as error:
        return json_response({"error": f"Failed to load activity logs: {error}"}, 500)


@app.route("/api/push-config", methods=["OPTIONS", "GET"])
def push_config():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    return json_response(
        {
            "enabled": push_notifications_enabled(),
            "vapidPublicKey": push_vapid_public_key(),
            "subject": push_vapid_subject(),
        }
    )


@app.route("/api/push-subscriptions", methods=["OPTIONS", "POST", "DELETE"])
def push_subscriptions():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    payload = request.get_json(silent=True) or {}

    if request.method == "POST":
        subscription = payload.get("subscription") if isinstance(payload.get("subscription"), dict) else {}
        if not isinstance(subscription, dict) or not subscription:
            return json_response({"error": "subscription must be an object."}, 400)
        try:
            saved = save_push_subscription(
                subscription,
                auth_payload["email"],
                request.headers.get("User-Agent", ""),
            )
            return json_response({"subscription": saved}, 200)
        except Exception as error:
            return json_response({"error": f"Failed to save push subscription: {error}"}, 400)

    subscription = payload.get("subscription") if isinstance(payload.get("subscription"), dict) else {}
    endpoint = str(payload.get("endpoint", "") or subscription.get("endpoint", "")).strip()
    if not endpoint:
        return json_response({"error": "endpoint is required."}, 400)
    try:
        delete_push_subscription_by_endpoint(endpoint)
        return json_response({"deleted": True, "endpoint": endpoint}, 200)
    except Exception as error:
        return json_response({"error": f"Failed to delete push subscription: {error}"}, 400)


@app.route("/api/expense-overview", methods=["OPTIONS", "GET"])
def expense_overview():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    try:
        return json_response({"overview": build_expense_overview()})
    except Exception as error:
        return json_response({"error": f"Failed to load expense overview: {error}"}, 500)


@app.route("/api/expenses-browse", methods=["OPTIONS", "GET"])
def expenses_browse():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    limit = request.args.get("limit", "25")
    cursor = request.args.get("cursor", "")
    month_filter = request.args.get("month", "")
    try:
        payload = load_expense_list_page(limit=int(limit or 25), cursor=cursor, month_filter=month_filter)
        return json_response(payload)
    except Exception as error:
        return json_response({"error": f"Failed to load expense list page: {error}"}, 500)


@app.route("/api/expenses-all", methods=["OPTIONS", "GET"])
def expenses_all():
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    _, error_response = auth_required_payload()
    if error_response:
        return error_response

    try:
        return json_response({"expenses": load_all_expenses()})
    except Exception as error:
        return json_response({"error": f"Failed to load all expenses: {error}"}, 500)


@app.route("/api/<collection_path>", methods=["OPTIONS", "POST"])
@app.route("/api/<collection_path>/<record_id>", methods=["OPTIONS", "GET", "PUT", "DELETE"])
def shared_record(collection_path: str, record_id: str | None = None):
    if request.method == "OPTIONS":
        return ("", 204, cors_headers())

    collection_key = get_collection_key_from_path(collection_path)
    if not collection_key:
        return json_response({"error": "Unknown collection."}, 404)

    auth_payload, error_response = auth_required_payload()
    if error_response:
        return error_response

    if request.method == "GET":
        if not record_id:
            return json_response({"error": "record_id is required."}, 400)
        try:
            record = load_record(collection_key, record_id)
            if not record:
                return json_response({"error": "Record not found."}, 404)
            return json_response({"record": record})
        except Exception as error:
            return json_response({"error": f"Failed to load record: {error}"}, 500)

    if request.method == "DELETE":
        if not record_id:
            return json_response({"error": "record_id is required."}, 400)
        payload = request.get_json(silent=True) or {}
        try:
            status_code, response_payload = delete_record(
                collection_key,
                record_id,
                auth_payload["email"],
                expected_updated_at=str(payload.get("expectedUpdatedAt", "")).strip(),
                force=bool(payload.get("force")),
            )
            return json_response(response_payload, status_code)
        except Exception as error:
            return json_response({"error": f"Failed to delete record: {error}"}, 500)

    payload = request.get_json(silent=True) or {}
    record = payload.get("record") or {}
    if not isinstance(record, dict):
        return json_response({"error": "record must be an object."}, 400)
    if record_id:
        record["id"] = record_id

    try:
        status_code, response_payload = save_record(
            collection_key,
            record,
            auth_payload["email"],
            expected_updated_at=str(payload.get("expectedUpdatedAt", "")).strip(),
            force=bool(payload.get("force")),
        )
        return json_response(response_payload, status_code)
    except Exception as error:
        return json_response({"error": f"Failed to save record: {error}"}, 500)


def extract_json_object(text: str) -> dict[str, Any] | None:
    cleaned = str(text or "").strip()
    if not cleaned:
        return None

    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, flags=re.DOTALL | re.IGNORECASE)
    if fenced:
        try:
            parsed = json.loads(fenced.group(1))
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass

    start = cleaned.find("{")
    if start < 0:
        return None

    in_string = False
    escape = False
    depth = 0
    for index in range(start, len(cleaned)):
        char = cleaned[index]
        if escape:
            escape = False
            continue
        if char == "\\" and in_string:
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(cleaned[start:index + 1])
                    return parsed if isinstance(parsed, dict) else None
                except json.JSONDecodeError:
                    return None

    return None


def verify_scheduler_oidc_token(token_str: str) -> str:
    token_str = str(token_str or "").strip()
    if not token_str:
        raise PermissionError("OIDC token is empty.")

    scheduler_sa = "firestore-backup-sa@YOUR_FIREBASE_PROJECT_ID.iam.gserviceaccount.com"
    auth_request = google_auth_requests.Request()
    
    try:
        url_aud = request.url
        payload = id_token.verify_oauth2_token(
            token_str,
            auth_request,
            audience=url_aud,
        )
    except Exception as e:
        try:
            payload = id_token.verify_oauth2_token(
                token_str,
                auth_request,
                audience=google_client_id(),
            )
        except Exception as e2:
            try:
                payload = id_token.verify_token(token_str, auth_request)
            except Exception as e3:
                raise PermissionError(f"OIDC token verification failed: {e} / {e2} / {e3}")

    email = str(payload.get("email", "")).strip().lower()
    if not email:
        raise PermissionError("No email in OIDC token.")
        
    if email != scheduler_sa and email not in allowed_emails():
        raise PermissionError(f"Email '{email}' is not authorized for backups.")

    return email


def get_latest_backup_zip_bytes() -> tuple[bytes, str]:
    PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"
    BUCKET_NAME = "YOUR_FIREBASE_PROJECT_ID-firestore-backups"
    
    client = google_storage.Client(project=PROJECT_ID)
    bucket = client.bucket(BUCKET_NAME)
    
    blobs = client.list_blobs(BUCKET_NAME, prefix="daily-", delimiter="/")
    list(blobs)
    prefixes = list(blobs.prefixes)
    
    if not prefixes:
        blobs = client.list_blobs(BUCKET_NAME, prefix="daily/", delimiter="/")
        list(blobs)
        prefixes = list(blobs.prefixes)
        if not prefixes:
            prefixes = ["daily/"]
            
    prefixes_sorted = sorted([p for p in prefixes if p.startswith("daily-")], reverse=True)
    if prefixes_sorted:
        latest_prefix = prefixes_sorted[0]
    else:
        latest_prefix = "daily/"
        
    prefix_name = latest_prefix.strip("/")
    
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
        target_blobs = client.list_blobs(BUCKET_NAME, prefix=latest_prefix)
        count = 0
        for blob in target_blobs:
            if blob.name.endswith("/"):
                continue
            file_data = blob.download_as_bytes()
            zip_file.writestr(blob.name, file_data)
            count += 1
            
        if count == 0:
            raise FileNotFoundError(f"No backup files found under {latest_prefix}")
            
        expenses_raw = list_firestore_documents("expenses")
        expenses = decode_query_documents(expenses_raw)
        
        transfers_raw = list_firestore_documents("transfers")
        transfers = decode_query_documents(transfers_raw)
        
        child_transactions_raw = list_firestore_documents("childTransactions")
        child_transactions = decode_query_documents(child_transactions_raw)
        
        household_incomes_raw = list_firestore_documents("householdIncomes")
        household_incomes = decode_query_documents(household_incomes_raw)
        
        activity_logs_raw = list_firestore_documents(ACTIVITY_LOG_COLLECTION)
        activity_logs = decode_query_documents(activity_logs_raw)
        
        ai_usage_logs = load_ai_usage_logs()
        
        settings = load_shared_settings()
        
        tokyo_tz = timezone(timedelta(hours=9))
        now_tokyo = datetime.now(tokyo_tz)
        
        backupDateKey = now_tokyo.strftime("%Y%m%d")
        backupCreatedAt = now_tokyo.isoformat()
        latestGcsPrefix = prefix_name
        
        firestoreExportDateKey = ""
        m = re.search(r'daily-(\d{8})-(\d{6})', latestGcsPrefix)
        if m:
            try:
                utc_dt = datetime.strptime(f"{m.group(1)}-{m.group(2)}", "%Y%m%d-%H%M%S").replace(tzinfo=timezone.utc)
                tokyo_dt = utc_dt.astimezone(tokyo_tz)
                firestoreExportDateKey = tokyo_dt.strftime("%Y%m%d")
            except Exception:
                firestoreExportDateKey = ""
        else:
            m2 = re.search(r'daily-(\d{8})', latestGcsPrefix)
            if m2:
                firestoreExportDateKey = m2.group(1)
            else:
                firestoreExportDateKey = ""
            
        readable_backup = {
            "version": "6.26",
            "backupDate": backupCreatedAt,
            "householdId": household_id(),
            "settings": settings,
            "expenses": expenses,
            "transfers": transfers,
            "childTransactions": child_transactions,
            "householdIncomes": household_incomes,
            "activityLogs": activity_logs,
            "aiUsageLogs": ai_usage_logs
        }
        json_data = json.dumps(readable_backup, ensure_ascii=False, indent=2)
        zip_file.writestr(f"json/kakeibo_readable_backup_{backupDateKey}.json", json_data.encode("utf-8"))
        
        expenses_rows = build_expense_export_rows(expenses)
        expenses_csv = convert_rows_to_csv_string(expenses_rows)
        zip_file.writestr("csv/expenses_import.csv", expenses_csv.encode("utf-8"))
        
        categories = settings.get("categories") or []
        codebook_rows = build_codebook_rows(categories, settings)
        codebook_csv = convert_rows_to_csv_string(codebook_rows)
        zip_file.writestr("csv/codebook.csv", codebook_csv.encode("utf-8"))
        
        summary_monthly_rows = build_monthly_summary_rows(expenses)
        summary_monthly_csv = convert_rows_to_csv_string(summary_monthly_rows)
        zip_file.writestr("csv/summary_monthly.csv", summary_monthly_csv.encode("utf-8"))
        
        rules = settings.get("settlementRules") or {}
        settlement_rules_rows = build_settlement_rule_rows(rules)
        settlement_rules_csv = convert_rows_to_csv_string(settlement_rules_rows)
        zip_file.writestr("csv/settlement_rules.csv", settlement_rules_csv.encode("utf-8"))
        
        target_year = str(datetime.now(tokyo_tz).year)
        pool_config = settings.get("householdPoolConfig") or {}
        settlement_report_rows = generate_settlement_report_rows(
            expenses, transfers, child_transactions, household_incomes, rules, pool_config, target_year
        )
        settlement_report_csv = convert_rows_to_csv_string(settlement_report_rows)
        zip_file.writestr("csv/settlement_report.csv", settlement_report_csv.encode("utf-8"))
        
        txn_transfers_rows = build_transfer_export_rows(transfers)
        txn_transfers_csv = convert_rows_to_csv_string(txn_transfers_rows)
        zip_file.writestr("csv/txn_transfers.csv", txn_transfers_csv.encode("utf-8"))
        
        household_incomes_rows = build_household_income_export_rows(household_incomes)
        household_incomes_csv = convert_rows_to_csv_string(household_incomes_rows)
        zip_file.writestr("csv/household_incomes.csv", household_incomes_csv.encode("utf-8"))
        
        child_transactions_rows = build_child_transaction_export_rows(child_transactions)
        child_transactions_csv = convert_rows_to_csv_string(child_transactions_rows)
        zip_file.writestr("csv/child_transactions.csv", child_transactions_csv.encode("utf-8"))
        
        def get_csv_meta(csv_str, padded=False):
            import csv
            clean_str = csv_str.lstrip("\ufeff")
            try:
                reader = csv.reader(io.StringIO(clean_str))
                rows = list(reader)
                row_count = len(rows)
                col_count = len(rows[0]) if row_count > 0 else 0
            except Exception:
                lines = [l for l in csv_str.splitlines() if l.strip()]
                row_count = len(lines)
                col_count = len(lines[0].split(",")) if row_count > 0 else 0
            return {
                "rows": row_count,
                "columns": col_count,
                "is_padded": padded
            }
            
        csv_metadata = {
            "csv/expenses_import.csv": get_csv_meta(expenses_csv),
            "csv/codebook.csv": get_csv_meta(codebook_csv),
            "csv/summary_monthly.csv": get_csv_meta(summary_monthly_csv),
            "csv/settlement_rules.csv": get_csv_meta(settlement_rules_csv),
            "csv/settlement_report.csv": get_csv_meta(settlement_report_csv, padded=True),
            "csv/txn_transfers.csv": get_csv_meta(txn_transfers_csv),
            "csv/household_incomes.csv": get_csv_meta(household_incomes_csv),
            "csv/child_transactions.csv": get_csv_meta(child_transactions_csv),
        }

        manifest = {
            "version": "6.26",
            "backupDateKey": backupDateKey,
            "backupDate": backupCreatedAt,
            "backupCreatedAt": backupCreatedAt,
            "householdId": household_id(),
            "latestGcsPrefix": latestGcsPrefix,
            "firestoreExportDateKey": firestoreExportDateKey,
            "collections": {
                "expenses": len(expenses),
                "transfers": len(transfers),
                "childTransactions": len(child_transactions),
                "householdIncomes": len(household_incomes),
                "activityLogs": len(activity_logs),
                "aiUsageLogs": len(ai_usage_logs)
            },
            "csvFiles": [
                "csv/expenses_import.csv",
                "csv/codebook.csv",
                "csv/summary_monthly.csv",
                "csv/settlement_rules.csv",
                "csv/settlement_report.csv",
                "csv/txn_transfers.csv",
                "csv/household_incomes.csv",
                "csv/child_transactions.csv"
            ],
            "csvMetadata": csv_metadata,
            "jsonFiles": [
                f"json/kakeibo_readable_backup_{backupDateKey}.json"
            ],
            "notes": {
                "settlement_report.csv": (
                    "settlement_report.csv は全期間明細ではなく、バックアップ作成時点の現在年を対象にした精算レポートです。"
                    f"（例: バックアップ作成年が {target_year} 年の場合、{target_year}-01 〜 {target_year}-12 を集計対象とします）。"
                    "なお、支出・送金・家計入金・子供口座などの明細CSV（expenses_import.csv, txn_transfers.csv, "
                    "household_incomes.csv, child_transactions.csv）は全期間対象のデータが出力されます。"
                )
            }
        }
        manifest_data = json.dumps(manifest, ensure_ascii=False, indent=2)
        zip_file.writestr("manifest.json", manifest_data.encode("utf-8"))
        
        restore_notes = (
            "# Kakeibo App Backup Restore Guide\n\n"
            f"Backup Date: {backupCreatedAt}\n"
            f"Household ID: {household_id()}\n\n"
            "This backup contains three layers of recovery data:\n\n"
            "1. **Firestore Managed Export Layer** (`daily-YYYYMMDD-HHMMSS/` directory)\n"
            "   - Original physical database export generated by Firestore.\n"
            "   - Use `gcloud firestore import` command to restore to a GCP/Firestore project.\n\n"
            "2. **Readable JSON Layer** (`json/` directory)\n"
            "   - Human and AI-readable structured backup containing settings and all documents.\n"
            "   - Can be used for verification or partial restore by running custom recovery scripts.\n\n"
            "3. **Full CSV Set Layer** (`csv/` directory)\n"
            "   - Contains 8 CSV files (BOM-UTF-8, comma separated, double-quoted) for spreadsheets or AI processing.\n"
            "   - Useful for manual verification and importing/exporting to Google Sheets or Excel.\n"
            "   - **Important Note**: `settlement_report.csv` is compiled based on the current year (当年) at the time of backup generation.\n"
            "     All historical raw data is stored in `expenses_import.csv`, `txn_transfers.csv`, `household_incomes.csv`, `child_transactions.csv` and the readable JSON.\n"
            "     If you need to verify or recalculate settlements for past years, please reconstruct them from the raw data files.\n"
        )
        zip_file.writestr("restore_notes.md", restore_notes.encode("utf-8"))
        
    zip_buffer.seek(0)
    return zip_buffer.getvalue(), prefix_name


def trigger_firestore_backup(output_prefix_dir: str) -> str:
    PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"
    scopes = ["https://www.googleapis.com/auth/datastore", "https://www.googleapis.com/auth/cloud-platform"]
    credentials, project = google.auth.default(scopes=scopes)
    auth_req = google_auth_requests.Request()
    credentials.refresh(auth_req)
    token = credentials.token
    
    url = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default):exportDocuments"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    gcs_prefix = f"gs://YOUR_FIREBASE_PROJECT_ID-firestore-backups/{output_prefix_dir}"
    payload = {
        "outputUriPrefix": gcs_prefix
    }
    
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    response.raise_for_status()
    result = response.json()
    return result.get("name", "")


@app.route("/api/backup", methods=["POST"])
def run_backup_api():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return json_response({"error": "Unauthorized. Bearer token required."}, 401)
    
    token = auth_header.split(" ", 1)[1]
    try:
        email = verify_scheduler_oidc_token(token)
    except PermissionError as e:
        return json_response({"error": str(e)}, 403)
    except Exception as e:
        return json_response({"error": f"Token verification error: {e}"}, 400)
        
    now_str = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    dir_name = f"daily-{now_str}"
    
    try:
        operation_name = trigger_firestore_backup(dir_name)
        print(f"Backup triggered successfully by {email}. Directory: {dir_name}. Operation: {operation_name}")
        return json_response({
            "ok": True,
            "message": "Backup triggered successfully.",
            "directory": dir_name,
            "operation": operation_name,
            "triggeredBy": email
        })
    except Exception as e:
        print(f"Failed to trigger Firestore backup: {e}")
        return json_response({"error": f"Failed to trigger backup: {e}"}, 500)


@app.route("/api/backup/latest-zip", methods=["GET"])
def download_latest_backup_zip_api():
    auth_payload, err_response = auth_required_payload()
    if err_response:
        return err_response
        
    try:
        zip_bytes, prefix_name = get_latest_backup_zip_bytes()
        filename = f"kakeibo_backup_{prefix_name}.zip"
        
        return send_file(
            io.BytesIO(zip_bytes),
            mimetype="application/zip",
            as_attachment=True,
            download_name=filename
        )
    except FileNotFoundError as e:
        return json_response({"error": str(e)}, 404)
    except Exception as e:
        print(f"Failed to generate backup ZIP: {e}")
        return json_response({"error": f"Failed to zip backup: {e}"}, 500)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
