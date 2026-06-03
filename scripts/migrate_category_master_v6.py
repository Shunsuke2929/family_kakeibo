from __future__ import annotations

import argparse
import copy
import hashlib
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ID = "YOUR_FIREBASE_PROJECT_ID"
HOUSEHOLD_ID = "shunwife-home"
GCLOUD_PATH = r"C:\Program Files (x86)\Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_DIR = ROOT_DIR / "reports"

DEFAULT_CATEGORIES = [
    "食料品",
    "外食費",
    "日用品",
    "育児特別費",
    "医療費",
    "ガソリン代",
    "家賃",
    "電気代",
    "ガス代",
    "水道代",
    "携帯代",
    "ネット回線",
    "自動車ローン",
    "家電・家具・住環境整備",
    "交際・宿泊・イベント",
    "車保険",
    "自動車税",
    "ふるさと納税",
    "固定費",
    "娯楽費",
    "その他",
]

CATEGORY_SORT_ORDER_MAP = {
    "食料品": 10,
    "外食費": 20,
    "日用品": 30,
    "育児特別費": 40,
    "医療費": 50,
    "ガソリン代": 60,
    "家賃": 70,
    "電気代": 80,
    "ガス代": 90,
    "水道代": 100,
    "携帯代": 110,
    "ネット回線": 120,
    "自動車ローン": 130,
    "家電・家具・住環境整備": 140,
    "交際・宿泊・イベント": 150,
    "車保険": 160,
    "自動車税": 170,
    "ふるさと納税": 180,
    "固定費": 200,
    "娯楽費": 210,
    "その他": 240,
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
    "電気代": "utility_electricity",
    "ガス代": "utility_gas",
    "水道代": "utility_water",
    "携帯代": "communication_mobile",
    "ネット回線": "communication_internet",
    "自動車ローン": "car_loan",
    "ガソリン代": "car_fuel",
    "駐車場・高速代": "car_parking_toll",
    "車整備": "car_maintenance",
    "車保険": "car_insurance",
    "自動車税": "car_tax",
}

CATEGORY_ALIAS_MAP = {
    "食費": "食料品",
    "外食": "外食費",
    "交通": "日用品",
    "交通費": "日用品",
    "医療": "医療費",
    "趣味・娯楽": "娯楽費",
    "育児日用品": "日用品",
    "ベビー日用品": "日用品",
    "子供特別費": "育児特別費",
    "育児特別費": "育児特別費",
    "ベビー特別費": "育児特別費",
    "出産・妊婦健診医療": "医療費",
    "出産・妊婦健診系医療": "医療費",
    "fixed_cost": "固定費",
    "hobby": "娯楽費",
    "other": "その他",
    "子供日常費": "日用品",
    "子供費用": "日用品",
    "旧: 子供費用": "日用品",
    "child_child_daily": "日用品",
    "child_child_expense": "日用品",
    "child_child_special": "育児特別費",
    "家電": "家電・家具・住環境整備",
    "家具": "家電・家具・住環境整備",
    "住環境整備": "家電・家具・住環境整備",
    "家電家具": "家電・家具・住環境整備",
    "旅行": "交際・宿泊・イベント",
    "宿泊": "交際・宿泊・イベント",
    "交際費": "交際・宿泊・イベント",
    "イベント": "交際・宿泊・イベント",
    "妊婦健診": "医療費",
    "出産医療": "医療費",
    "birth_medical_special": "医療費",
    "medical_birth_special": "医療費",
    "衣服": "その他",
    "住居": "その他",
    "特別費": "その他",
    "不明": "その他",
    "家賃・住宅費": "家賃",
    "電気": "電気代",
    "ガス": "ガス代",
    "水道": "水道代",
    "携帯電話": "携帯代",
    "スマホ": "携帯代",
    "インターネット": "ネット回線",
    "通信費": "ネット回線",
    "高速代": "駐車場・高速代",
    "駐車場代": "駐車場・高速代",
    "車両整備": "車整備",
    "自動車保険": "車保険",
}

CATEGORY_LABEL_BY_CODE = {
    "food": "食料品",
    "daily_goods": "日用品",
    "dining_out": "外食費",
    "medical": "医療費",
    "birth_medical_special": "医療費",
    "medical_birth_special": "医療費",
    "hobby": "娯楽費",
    "fixed_cost": "固定費",
    "home_appliance_home_improvement": "家電・家具・住環境整備",
    "event_travel_gift": "交際・宿泊・イベント",
    "hometown_tax": "ふるさと納税",
    "housing_rent": "家賃",
    "utility_electricity": "電気代",
    "utility_gas": "ガス代",
    "utility_water": "水道代",
    "communication_mobile": "携帯代",
    "communication_internet": "ネット回線",
    "car_loan": "自動車ローン",
    "car_fuel": "ガソリン代",
    "car_parking_toll": "駐車場・高速代",
    "car_maintenance": "車整備",
    "car_insurance": "車保険",
    "car_tax": "自動車税",
    "child_child_special": "育児特別費",
    "other": "その他",
}

CATEGORY_BUDGET_GROUP_KEY_MAP = {
    "food": "food",
    "daily_goods": "daily_goods",
    "dining_out": "dining_out",
    "housing_rent": "housing_rent",
    "utility_electricity": "utilities_home",
    "utility_gas": "utilities_home",
    "utility_water": "utility_water",
    "communication_mobile": "communication_total",
    "communication_internet": "communication_total",
    "medical": "medical_regular",
    "car_fuel": "car_fuel",
    "car_loan": "car_loan",
    "car_parking_toll": "",
    "car_maintenance": "",
    "child_child_special": "child_child_special",
    "home_appliance_home_improvement": "home_appliance_home_improvement",
    "event_travel_gift": "event_travel_gift",
    "car_insurance": "car_tax_insurance",
    "car_tax": "car_tax_insurance",
    "hometown_tax": "hometown_tax",
    "birth_medical_special": "medical_regular",
    "medical_birth_special": "medical_regular",
    "fixed_cost": "home_appliance_home_improvement",
    "hobby": "event_travel_gift",
    "other": "",
}

DEFAULT_CATEGORY_MASTER_CONFIG = {
    "version": 6,
    "categories": [
        {"code": "food", "label": "食料品", "active": True, "sortOrder": 10, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "food"},
        {"code": "dining_out", "label": "外食費", "active": True, "sortOrder": 20, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "dining_out"},
        {"code": "daily_goods", "label": "日用品", "active": True, "sortOrder": 30, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "daily_goods"},
        {"code": "child_child_special", "label": "育児特別費", "active": True, "sortOrder": 40, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "child_child_special"},
        {"code": "medical", "label": "医療費", "active": True, "sortOrder": 50, "bucket": "core_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "medical_regular"},
        {"code": "car_fuel", "label": "ガソリン代", "active": True, "sortOrder": 60, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_fuel"},
        {"code": "housing_rent", "label": "家賃", "active": True, "sortOrder": 70, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "housing_rent"},
        {"code": "utility_electricity", "label": "電気代", "active": True, "sortOrder": 80, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utilities_home"},
        {"code": "utility_gas", "label": "ガス代", "active": True, "sortOrder": 90, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utilities_home"},
        {"code": "utility_water", "label": "水道代", "active": True, "sortOrder": 100, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utility_water"},
        {"code": "communication_mobile", "label": "携帯代", "active": True, "sortOrder": 110, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total"},
        {"code": "communication_internet", "label": "ネット回線", "active": True, "sortOrder": 120, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total"},
        {"code": "car_loan", "label": "自動車ローン", "active": True, "sortOrder": 130, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_loan"},
        {"code": "home_appliance_home_improvement", "label": "家電・家具・住環境整備", "active": True, "sortOrder": 140, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement"},
        {"code": "event_travel_gift", "label": "交際・宿泊・イベント", "active": True, "sortOrder": 150, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift"},
        {"code": "car_insurance", "label": "車保険", "active": True, "sortOrder": 160, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "car_tax_insurance"},
        {"code": "car_tax", "label": "自動車税", "active": True, "sortOrder": 170, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "car_tax_insurance"},
        {"code": "hometown_tax", "label": "ふるさと納税", "active": True, "sortOrder": 180, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "hometown_tax"},
        {"code": "fixed_cost", "label": "固定費", "active": True, "sortOrder": 200, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement"},
        {"code": "hobby", "label": "娯楽費", "active": True, "sortOrder": 210, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift"},
        {"code": "car_parking_toll", "label": "駐車場・高速代", "active": True, "sortOrder": 220, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": ""},
        {"code": "car_maintenance", "label": "車整備", "active": True, "sortOrder": 230, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": ""},
        {"code": "other", "label": "その他", "active": True, "sortOrder": 240, "bucket": "uncategorized", "budgetMode": "none", "settlementScope": "family", "budgetGroupKey": ""},
    ],
}


def run_command(args: list[str]) -> str:
    completed = subprocess.run(args, capture_output=True, text=True, check=True)
    return completed.stdout.strip()


def get_access_token() -> str:
    return run_command([GCLOUD_PATH, "auth", "print-access-token"])


def firestore_base_url() -> str:
    return f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents"


def api_request(method: str, url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None
    headers = {
        "Authorization": f"Bearer {get_access_token()}",
        "Content-Type": "application/json",
    }
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: {exc.code} {detail}") from exc


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
        return {"arrayValue": {"values": [encode_firestore_value(item) for item in value]}}
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
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [decode_firestore_value(item) for item in value.get("arrayValue", {}).get("values", [])]
    if "mapValue" in value:
        return {
            key: decode_firestore_value(item)
            for key, item in value.get("mapValue", {}).get("fields", {}).items()
        }
    return None


def encode_firestore_document(payload: dict[str, Any]) -> dict[str, Any]:
    return {"fields": {key: encode_firestore_value(val) for key, val in payload.items()}}


def decode_firestore_document(document: dict[str, Any]) -> dict[str, Any]:
    return {
        key: decode_firestore_value(value)
        for key, value in document.get("fields", {}).items()
    }


def get_settings_document() -> tuple[dict[str, Any], dict[str, Any]]:
    doc = api_request("GET", f"{firestore_base_url()}/households/{HOUSEHOLD_ID}/settings/main")
    return doc, decode_firestore_document(doc)


def list_expenses() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    next_page_token = ""
    while True:
        params = {"pageSize": "200"}
        if next_page_token:
            params["pageToken"] = next_page_token
        url = f"{firestore_base_url()}/households/{HOUSEHOLD_ID}/expenses?{urllib.parse.urlencode(params)}"
        payload = api_request("GET", url)
        for document in payload.get("documents", []):
            value = decode_firestore_document(document)
            value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
            rows.append(value)
        next_page_token = payload.get("nextPageToken", "")
        if not next_page_token:
            break
    return rows


def put_document(payload: dict[str, Any], *segments: str) -> None:
    url = f"{firestore_base_url()}/{'/'.join(urllib.parse.quote(seg, safe='') for seg in segments)}"
    api_request("PATCH", url, encode_firestore_document(payload))


def normalize_category_label(category: Any) -> str:
    label = str(category or "").strip()
    if not label:
        return ""
    return CATEGORY_ALIAS_MAP.get(label) or CATEGORY_LABEL_BY_CODE.get(label) or label


def slugify(text: str) -> str:
    normalized = "".join(char.lower() if char.isalnum() else "_" for char in text)
    normalized = "_".join(part for part in normalized.split("_") if part)
    return normalized or "custom"


def make_stable_code(label: str, prefix: str = "custom") -> str:
    base = slugify(label)
    digest = hashlib.sha1(label.encode("utf-8")).hexdigest()[:6]
    return f"{prefix}_{base}_{digest}"


def normalize_category_code(code: Any, label: Any = "") -> str:
    normalized_label = normalize_category_label(label or code)
    if normalized_label and CATEGORY_CODE_MAP.get(normalized_label):
        return CATEGORY_CODE_MAP[normalized_label]
    raw_code = str(code or "").strip()
    if raw_code in {"child_child_daily", "child_child_expense"}:
        return "daily_goods"
    if raw_code in {"medical_birth_special", "birth_medical_special"}:
        return "medical"
    if raw_code == "child_child_special":
        return "child_child_special"
    return raw_code or make_stable_code(normalized_label, "custom")


def merge_categories(categories: list[str]) -> list[str]:
    merged = list(DEFAULT_CATEGORIES)
    for category in categories:
        label = normalize_category_label(category)
        if label and label not in merged:
            merged.append(label)
    return merged


def build_fallback_category_meta_from_label(label: str, sort_order: int = 9990) -> dict[str, Any]:
    normalized_label = normalize_category_label(label)
    code = normalize_category_code(CATEGORY_CODE_MAP.get(normalized_label) or make_stable_code(normalized_label, "custom"), normalized_label)
    return {
        "code": code,
        "label": normalized_label,
        "active": True,
        "sortOrder": sort_order if isinstance(sort_order, int) else CATEGORY_SORT_ORDER_MAP.get(normalized_label, 9990),
        "bucket": "uncategorized",
        "budgetMode": "none",
        "settlementScope": "family",
        "budgetGroupKey": CATEGORY_BUDGET_GROUP_KEY_MAP.get(code, ""),
    }


def normalize_category_master_entry(entry: dict[str, Any], index: int) -> dict[str, Any]:
    base = build_fallback_category_meta_from_label(
        str(entry.get("label") or entry.get("code") or f"カテゴリ{index + 1}").strip(),
        (index + 1) * 10,
    )
    label = normalize_category_label(entry.get("label") or entry.get("code") or base["label"]) or base["label"]
    code = normalize_category_code(entry.get("code") or base["code"], label)
    raw_label = str(entry.get("label") or "").strip()
    raw_code = str(entry.get("code") or "").strip()
    has_legacy_alias = raw_label != label or normalize_category_code(raw_code, raw_label or label) != raw_code
    return {
        "code": code,
        "label": label,
        "active": True if label in DEFAULT_CATEGORIES else entry.get("active", True) is not False,
        "sortOrder": int(entry["sortOrder"]) if str(entry.get("sortOrder", "")).strip().isdigit() and not has_legacy_alias else CATEGORY_SORT_ORDER_MAP.get(label, base["sortOrder"]),
        "bucket": str(entry.get("bucket") or base["bucket"]).strip() or base["bucket"],
        "budgetMode": str(entry.get("budgetMode") or base["budgetMode"]).strip() or base["budgetMode"],
        "settlementScope": str(entry.get("settlementScope") or base["settlementScope"]).strip() or base["settlementScope"],
        "budgetGroupKey": str(entry.get("budgetGroupKey") or CATEGORY_BUDGET_GROUP_KEY_MAP.get(code) or base["budgetGroupKey"]).strip(),
    }


def migrate_categories_list(raw_categories: list[Any]) -> tuple[list[str], list[dict[str, str]]]:
    final_categories = merge_categories([str(item or "").strip() for item in raw_categories])
    actions: list[dict[str, str]] = []
    raw_joined = [str(item or "").strip() for item in raw_categories if str(item or "").strip()]
    raw_set = set(raw_joined)
    final_set = set(final_categories)
    for raw in raw_joined:
        normalized = normalize_category_label(raw)
        if normalized != raw:
            actions.append({"before": raw, "after": normalized, "reason": "旧ラベルを現行ラベルへ正規化"})
    for label in final_categories:
        if label not in raw_set:
            actions.append({"before": "（未登録）", "after": label, "reason": "新カテゴリマスターに必要なカテゴリを補完"})
    for raw in raw_joined:
        normalized = normalize_category_label(raw)
        if raw not in final_set and normalized != raw:
            actions.append({"before": raw, "after": normalized, "reason": "旧カテゴリ一覧から置換"})
    deduped: list[dict[str, str]] = []
    seen = set()
    for action in actions:
        key = (action["before"], action["after"], action["reason"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(action)
    return final_categories, deduped


def migrate_category_master_config(raw_config: dict[str, Any], raw_categories: list[Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    raw_entries = raw_config.get("categories") if isinstance(raw_config.get("categories"), list) else []
    default_entries = copy.deepcopy(DEFAULT_CATEGORY_MASTER_CONFIG["categories"])
    default_codes = {entry["code"] for entry in default_entries}
    custom_entries: dict[str, dict[str, Any]] = {}
    actions: list[dict[str, Any]] = []

    for index, entry in enumerate(raw_entries):
        if not isinstance(entry, dict):
            continue
        normalized = normalize_category_master_entry(entry, index)
        before_code = str(entry.get("code") or "").strip()
        before_label = str(entry.get("label") or "").strip()
        if normalized["code"] in default_codes:
            default_target = next(item for item in default_entries if item["code"] == normalized["code"])
            if (
                before_code != default_target["code"]
                or before_label != default_target["label"]
                or bool(entry.get("active", True)) != bool(default_target["active"])
                or str(entry.get("budgetGroupKey") or "") != str(default_target["budgetGroupKey"] or "")
                or str(entry.get("budgetMode") or "") != str(default_target["budgetMode"] or "")
                or str(entry.get("bucket") or "") != str(default_target["bucket"] or "")
                or str(entry.get("settlementScope") or "") != str(default_target["settlementScope"] or "")
                or int(entry.get("sortOrder") or 0) != int(default_target["sortOrder"])
            ):
                actions.append({
                    "beforeCode": before_code or "（空）",
                    "beforeLabel": before_label or "（空）",
                    "afterCode": default_target["code"],
                    "afterLabel": default_target["label"],
                    "reason": "既定カテゴリを v6 正本定義へ更新",
                })
            continue

        if normalized["code"] in {"birth_medical_special", "medical_birth_special"}:
            actions.append({
                "beforeCode": before_code or "（空）",
                "beforeLabel": before_label or "（空）",
                "afterCode": "medical",
                "afterLabel": "医療費",
                "reason": "出産系医療カテゴリを医療費へ統合",
            })
            continue

        existing = custom_entries.get(normalized["code"])
        if existing is None:
            custom_entries[normalized["code"]] = normalized
        else:
            existing["active"] = existing["active"] or normalized["active"]

    for label in merge_categories([str(item or "").strip() for item in raw_categories]):
        code = normalize_category_code(label, label)
        if code in default_codes or code in custom_entries:
            continue
        custom_entries[code] = build_fallback_category_meta_from_label(label, CATEGORY_SORT_ORDER_MAP.get(label, 5000))
        actions.append({
            "beforeCode": "（未登録）",
            "beforeLabel": "（未登録）",
            "afterCode": code,
            "afterLabel": label,
            "reason": "カテゴリ一覧に存在するためカスタム定義を補完",
        })

    migrated = {
        "version": DEFAULT_CATEGORY_MASTER_CONFIG["version"],
        "categories": default_entries + sorted(custom_entries.values(), key=lambda item: (int(item.get("sortOrder", 9999)), str(item.get("label", "")))),
    }
    return migrated, actions


def audit_expenses(expenses: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], Counter]:
    changes: list[dict[str, Any]] = []
    reason_counter: Counter = Counter()
    for expense in expenses:
        raw_category = str(expense.get("category") or "").strip()
        normalized = normalize_category_label(raw_category)
        if not raw_category or normalized != raw_category:
            next_category = normalized or raw_category
            reason = "空欄のため要確認" if not raw_category else "旧カテゴリを現行ラベルへ正規化"
            if raw_category in {"birth_medical_special", "medical_birth_special"}:
                next_category = "医療費"
                reason = "出産系医療カテゴリを医療費へ統合"
            elif raw_category in {"child_child_daily", "child_child_expense", "子供日常費", "子供費用", "旧: 子供費用"}:
                next_category = "日用品"
                reason = "日用品へ統合"
            changes.append({
                "id": expense.get("id", ""),
                "date": expense.get("date", ""),
                "storeName": expense.get("storeName", ""),
                "before": raw_category or "（空欄）",
                "after": next_category or "（空欄）",
                "reason": reason,
            })
            reason_counter[reason] += 1
    return changes, reason_counter


def apply_expense_changes(expenses: list[dict[str, Any]], changes: list[dict[str, Any]]) -> int:
    change_by_id = {change["id"]: change for change in changes}
    updated = 0
    for expense in expenses:
        change = change_by_id.get(str(expense.get("id", "")))
        if not change:
            continue
        payload = copy.deepcopy(expense)
        payload["category"] = change["after"] if change["after"] != "（空欄）" else ""
        put_document(payload, "households", HOUSEHOLD_ID, "expenses", str(expense["id"]))
        updated += 1
    return updated


def render_markdown_table(headers: list[str], rows: list[list[Any]]) -> str:
    if not rows:
        return "| なし |\n| --- |\n| 該当なし |\n"
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        values = [str(value).replace("\n", "<br>") for value in row]
        lines.append("| " + " | ".join(values) + " |")
    return "\n".join(lines) + "\n"


def write_report(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = REPORT_DIR / f"category_master_migration_{timestamp}.json"
    md_path = REPORT_DIR / f"category_master_migration_{timestamp}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    summary_rows = [
        ["支出レコード総数", report["summary"]["expenseCount"]],
        ["支出カテゴリ更新件数", report["summary"]["expenseChanges"]],
        ["旧カテゴリ一覧→新一覧の差分件数", report["summary"]["settingsCategoryActions"]],
        ["カテゴリマスター差分件数", report["summary"]["masterActions"]],
        ["設定保存の適用", "はい" if report["summary"]["settingsUpdated"] else "いいえ"],
        ["支出更新の適用", "はい" if report["summary"]["expenseUpdated"] else "いいえ"],
    ]

    settings_rows = [
        [item["before"], item["after"], item["reason"]]
        for item in report["settingsCategoryActions"]
    ]
    master_rows = [
        [item["beforeCode"], item["beforeLabel"], item["afterCode"], item["afterLabel"], item["reason"]]
        for item in report["masterActions"]
    ]
    expense_rows = [
        [item["id"], item["date"], item["storeName"], item["before"], item["after"], item["reason"]]
        for item in report["expenseChanges"]
    ]

    markdown = []
    markdown.append("# カテゴリマスター移行レポート\n")
    markdown.append(f"- 実行日時: {report['generatedAt']}")
    markdown.append(f"- household: `{HOUSEHOLD_ID}`")
    markdown.append(f"- apply: `{report['apply']}`\n")
    markdown.append("## 集計サマリー\n")
    markdown.append(render_markdown_table(["項目", "値"], summary_rows))
    markdown.append("## settings/main.categories の変更\n")
    markdown.append(render_markdown_table(["変更前", "変更後", "理由"], settings_rows))
    markdown.append("## settings/main.categoryMasterConfig の変更\n")
    markdown.append(render_markdown_table(["変更前 code", "変更前 label", "変更後 code", "変更後 label", "理由"], master_rows))
    markdown.append("## expense.category の変更\n")
    markdown.append(render_markdown_table(["ID", "日付", "店名", "変更前", "変更後", "理由"], expense_rows))
    md_path.write_text("\n".join(markdown), encoding="utf-8")
    return md_path, json_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Firestore のカテゴリマスターを v6 に移行します。")
    parser.add_argument("--apply", action="store_true", help="Firestore に実際に反映します。省略時は監査のみです。")
    args = parser.parse_args()

    settings_document, settings = get_settings_document()
    expenses = list_expenses()

    migrated_categories, settings_category_actions = migrate_categories_list(settings.get("categories") or [])
    migrated_master, master_actions = migrate_category_master_config(
        settings.get("categoryMasterConfig") if isinstance(settings.get("categoryMasterConfig"), dict) else {},
        migrated_categories,
    )
    expense_changes, _reason_counter = audit_expenses(expenses)

    settings_updated = False
    expense_updated = False
    if args.apply:
        next_settings = copy.deepcopy(settings)
        next_settings["categories"] = migrated_categories
        next_settings["categoryMasterConfig"] = migrated_master
        put_document(next_settings, "households", HOUSEHOLD_ID, "settings", "main")
        settings_updated = True
        if expense_changes:
            apply_expense_changes(expenses, expense_changes)
            expense_updated = True

    report = {
        "generatedAt": datetime.now().isoformat(),
        "apply": args.apply,
        "summary": {
            "expenseCount": len(expenses),
            "expenseChanges": len(expense_changes),
            "settingsCategoryActions": len(settings_category_actions),
            "masterActions": len(master_actions),
            "settingsUpdated": settings_updated,
            "expenseUpdated": expense_updated,
        },
        "before": {
            "settingsCategories": settings.get("categories") or [],
            "categoryMasterVersion": (settings.get("categoryMasterConfig") or {}).get("version"),
        },
        "after": {
            "settingsCategories": migrated_categories,
            "categoryMasterVersion": migrated_master["version"],
        },
        "settingsCategoryActions": settings_category_actions,
        "masterActions": master_actions,
        "expenseChanges": expense_changes,
    }
    md_path, json_path = write_report(report)
    print(json.dumps({
        "reportMarkdown": str(md_path),
        "reportJson": str(json_path),
        "summary": report["summary"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
