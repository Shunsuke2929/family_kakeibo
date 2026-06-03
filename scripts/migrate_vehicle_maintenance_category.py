from __future__ import annotations

import argparse
import copy
import importlib.util
import json
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
BASE_SCRIPT_PATH = ROOT_DIR / "scripts" / "migrate_category_master_v6.py"
REPORT_DIR = ROOT_DIR / "reports"


def load_base_module():
    spec = importlib.util.spec_from_file_location("category_master_base", BASE_SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


base = load_base_module()


VEHICLE_LABEL = "車両維持費"
VEHICLE_CODE = "vehicle_maintenance_total"
VEHICLE_GROUP = "vehicle_maintenance_total"
OLD_VEHICLE_LABELS = {"車整備", "車保険", "自動車税", "自動車保険", "車両整備"}
OLD_VEHICLE_CODES = {"car_maintenance", "car_insurance", "car_tax", VEHICLE_CODE}


base.DEFAULT_CATEGORIES = [
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
    VEHICLE_LABEL,
    "ふるさと納税",
    "固定費",
    "娯楽費",
    "その他",
]

base.CATEGORY_SORT_ORDER_MAP = {
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
    VEHICLE_LABEL: 160,
    "ふるさと納税": 180,
    "固定費": 200,
    "娯楽費": 210,
    "その他": 240,
}

base.CATEGORY_CODE_MAP.update({
    "車整備": VEHICLE_CODE,
    "車保険": VEHICLE_CODE,
    "自動車税": VEHICLE_CODE,
    VEHICLE_LABEL: VEHICLE_CODE,
})

base.CATEGORY_ALIAS_MAP.update({
    "車両整備": VEHICLE_LABEL,
    "自動車保険": VEHICLE_LABEL,
    "車整備": VEHICLE_LABEL,
    "車保険": VEHICLE_LABEL,
    "自動車税": VEHICLE_LABEL,
    "car_maintenance": VEHICLE_LABEL,
    "car_insurance": VEHICLE_LABEL,
    "car_tax": VEHICLE_LABEL,
    VEHICLE_CODE: VEHICLE_LABEL,
})

base.CATEGORY_LABEL_BY_CODE.update({
    "car_maintenance": VEHICLE_LABEL,
    "car_insurance": VEHICLE_LABEL,
    "car_tax": VEHICLE_LABEL,
    VEHICLE_CODE: VEHICLE_LABEL,
})

base.CATEGORY_BUDGET_GROUP_KEY_MAP.update({
    "car_maintenance": VEHICLE_GROUP,
    "car_insurance": VEHICLE_GROUP,
    "car_tax": VEHICLE_GROUP,
    VEHICLE_CODE: VEHICLE_GROUP,
})

base.DEFAULT_CATEGORY_MASTER_CONFIG = {
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
        {"code": VEHICLE_CODE, "label": VEHICLE_LABEL, "active": True, "sortOrder": 160, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": VEHICLE_GROUP},
        {"code": "hometown_tax", "label": "ふるさと納税", "active": True, "sortOrder": 180, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "hometown_tax"},
        {"code": "fixed_cost", "label": "固定費", "active": True, "sortOrder": 200, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement"},
        {"code": "hobby", "label": "娯楽費", "active": True, "sortOrder": 210, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift"},
        {"code": "car_parking_toll", "label": "駐車場・高速代", "active": True, "sortOrder": 220, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": ""},
        {"code": "other", "label": "その他", "active": True, "sortOrder": 240, "bucket": "uncategorized", "budgetMode": "none", "settlementScope": "family", "budgetGroupKey": ""},
    ],
}


def normalize_category_label(category: Any) -> str:
    label = str(category or "").strip()
    if not label:
        return ""
    return base.CATEGORY_ALIAS_MAP.get(label) or base.CATEGORY_LABEL_BY_CODE.get(label) or label


def normalize_category_code(code: Any, label: Any = "") -> str:
    normalized_label = normalize_category_label(label or code)
    if normalized_label and base.CATEGORY_CODE_MAP.get(normalized_label):
        return base.CATEGORY_CODE_MAP[normalized_label]
    raw_code = str(code or "").strip()
    if raw_code in {"child_child_daily", "child_child_expense"}:
        return "daily_goods"
    if raw_code in {"medical_birth_special", "birth_medical_special"}:
        return "medical"
    if raw_code in OLD_VEHICLE_CODES:
        return VEHICLE_CODE
    if raw_code == "child_child_special":
        return "child_child_special"
    return raw_code or base.make_stable_code(normalized_label, "custom")


base.normalize_category_label = normalize_category_label
base.normalize_category_code = normalize_category_code


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
            elif raw_category in OLD_VEHICLE_LABELS or raw_category in OLD_VEHICLE_CODES:
                next_category = VEHICLE_LABEL
                reason = "車両維持費へ統合"
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


def write_report(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = REPORT_DIR / f"vehicle_maintenance_category_migration_{timestamp}.json"
    md_path = REPORT_DIR / f"vehicle_maintenance_category_migration_{timestamp}.md"
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
    markdown.append("# 車両維持費カテゴリ移行レポート\n")
    markdown.append(f"- 実行日時: {report['generatedAt']}")
    markdown.append(f"- household: `{base.HOUSEHOLD_ID}`")
    markdown.append(f"- apply: `{report['apply']}`\n")
    markdown.append("## 集計サマリー\n")
    markdown.append(base.render_markdown_table(["項目", "値"], summary_rows))
    markdown.append("## settings/main.categories の変更\n")
    markdown.append(base.render_markdown_table(["変更前", "変更後", "理由"], settings_rows))
    markdown.append("## settings/main.categoryMasterConfig の変更\n")
    markdown.append(base.render_markdown_table(["変更前 code", "変更前 label", "変更後 code", "変更後 label", "理由"], master_rows))
    markdown.append("## expense.category の変更\n")
    markdown.append(base.render_markdown_table(["ID", "日付", "店名", "変更前", "変更後", "理由"], expense_rows))
    md_path.write_text("\n".join(markdown), encoding="utf-8")
    return md_path, json_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Firestore の車カテゴリを 車両維持費 へ統合します。")
    parser.add_argument("--apply", action="store_true", help="Firestore に実際に反映します。省略時は監査のみです。")
    args = parser.parse_args()

    _settings_document, settings = base.get_settings_document()
    expenses = base.list_expenses()

    migrated_categories, settings_category_actions = base.migrate_categories_list(settings.get("categories") or [])
    migrated_master, master_actions = base.migrate_category_master_config(
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
        if isinstance(next_settings.get("dashboardBudgetConfig"), dict):
            annual = dict(next_settings["dashboardBudgetConfig"].get("annualBudgetGroups") or {})
            if "vehicle_maintenance_total" not in annual and "car_tax_insurance" in annual:
                annual["vehicle_maintenance_total"] = annual.pop("car_tax_insurance")
            next_settings["dashboardBudgetConfig"]["annualBudgetGroups"] = annual
        base.put_document(next_settings, "households", base.HOUSEHOLD_ID, "settings", "main")
        settings_updated = True
        if expense_changes:
            base.apply_expense_changes(expenses, expense_changes)
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
