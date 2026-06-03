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
BASE_SCRIPT_PATH = ROOT_DIR / "scripts" / "migrate_vehicle_maintenance_category.py"
REPORT_DIR = ROOT_DIR / "reports"


def load_base_module():
    spec = importlib.util.spec_from_file_location("vehicle_migration_base", BASE_SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


vehicle_base = load_base_module()
base = vehicle_base.base


UTILITY_LABEL = "電気・ガス"
UTILITY_CODE = "utilities_home"
UTILITY_GROUP = "utilities_home"
OLD_UTILITY_LABELS = {"電気代", "ガス代", "電気", "ガス", "電気ガス", "電気＋ガス"}
OLD_UTILITY_CODES = {"utility_electricity", "utility_gas", UTILITY_CODE}


base.DEFAULT_CATEGORIES = [
    "食料品",
    "外食費",
    "日用品",
    "育児特別費",
    "医療費",
    "ガソリン代",
    "家賃",
    UTILITY_LABEL,
    "水道代",
    "携帯代",
    "ネット回線",
    "自動車ローン",
    "家電・家具・住環境整備",
    "交際・宿泊・イベント",
    "車両維持費",
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
    UTILITY_LABEL: 80,
    "水道代": 100,
    "携帯代": 110,
    "ネット回線": 120,
    "自動車ローン": 130,
    "家電・家具・住環境整備": 140,
    "交際・宿泊・イベント": 150,
    "車両維持費": 160,
    "ふるさと納税": 180,
    "固定費": 200,
    "娯楽費": 210,
    "その他": 240,
}

base.CATEGORY_CODE_MAP.update({
    UTILITY_LABEL: UTILITY_CODE,
    "電気代": UTILITY_CODE,
    "ガス代": UTILITY_CODE,
})

base.CATEGORY_ALIAS_MAP.update({
    "電気": UTILITY_LABEL,
    "ガス": UTILITY_LABEL,
    "電気代": UTILITY_LABEL,
    "ガス代": UTILITY_LABEL,
    "電気ガス": UTILITY_LABEL,
    "電気＋ガス": UTILITY_LABEL,
    "utility_electricity": UTILITY_LABEL,
    "utility_gas": UTILITY_LABEL,
    UTILITY_CODE: UTILITY_LABEL,
})

base.CATEGORY_LABEL_BY_CODE.update({
    UTILITY_CODE: UTILITY_LABEL,
    "utility_electricity": UTILITY_LABEL,
    "utility_gas": UTILITY_LABEL,
})

base.CATEGORY_BUDGET_GROUP_KEY_MAP.update({
    UTILITY_CODE: UTILITY_GROUP,
    "utility_electricity": UTILITY_GROUP,
    "utility_gas": UTILITY_GROUP,
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
        {"code": UTILITY_CODE, "label": UTILITY_LABEL, "active": True, "sortOrder": 80, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": UTILITY_GROUP},
        {"code": "utility_water", "label": "水道代", "active": True, "sortOrder": 100, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "utility_water"},
        {"code": "communication_mobile", "label": "携帯代", "active": True, "sortOrder": 110, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total"},
        {"code": "communication_internet", "label": "ネット回線", "active": True, "sortOrder": 120, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "communication_total"},
        {"code": "car_loan", "label": "自動車ローン", "active": True, "sortOrder": 130, "bucket": "fixed_household", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_loan"},
        {"code": "home_appliance_home_improvement", "label": "家電・家具・住環境整備", "active": True, "sortOrder": 140, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement"},
        {"code": "event_travel_gift", "label": "交際・宿泊・イベント", "active": True, "sortOrder": 150, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift"},
        {"code": "vehicle_maintenance_total", "label": "車両維持費", "active": True, "sortOrder": 160, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "vehicle_maintenance_total"},
        {"code": "hometown_tax", "label": "ふるさと納税", "active": True, "sortOrder": 180, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "hometown_tax"},
        {"code": "fixed_cost", "label": "固定費", "active": True, "sortOrder": 200, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "home_appliance_home_improvement"},
        {"code": "hobby", "label": "娯楽費", "active": True, "sortOrder": 210, "bucket": "special_annual", "budgetMode": "annual", "settlementScope": "family", "budgetGroupKey": "event_travel_gift"},
        {"code": "car_parking_toll", "label": "駐車場・高速代", "active": True, "sortOrder": 220, "bucket": "car_variable", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "car_parking_toll"},
        {"code": "other", "label": "その他", "active": True, "sortOrder": 240, "bucket": "uncategorized", "budgetMode": "monthly", "settlementScope": "family", "budgetGroupKey": "other"},
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
    if raw_code in OLD_UTILITY_CODES:
        return UTILITY_CODE
    if raw_code in {"child_child_daily", "child_child_expense"}:
        return "daily_goods"
    if raw_code in {"medical_birth_special", "birth_medical_special"}:
        return "medical"
    if raw_code in {"car_maintenance", "car_insurance", "car_tax", "vehicle_maintenance_total"}:
        return "vehicle_maintenance_total"
    if raw_code == "child_child_special":
        return "child_child_special"
    return raw_code or base.make_stable_code(normalized_label, "custom")


base.normalize_category_label = normalize_category_label
base.normalize_category_code = normalize_category_code


def normalize_recurring_template_config(config: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, str]]]:
    if not isinstance(config, dict):
        return config, []
    next_config = copy.deepcopy(config)
    templates = next_config.get("templates")
    if not isinstance(templates, list):
        return next_config, []
    actions: list[dict[str, str]] = []
    for template in templates:
        if not isinstance(template, dict):
            continue
        before = str(template.get("category") or "").strip()
        after = normalize_category_label(before)
        if before and after and before != after:
            template["category"] = after
            actions.append({
                "templateId": str(template.get("id") or ""),
                "label": str(template.get("label") or template.get("storeName") or ""),
                "before": before,
                "after": after,
                "reason": "固定費テンプレの旧カテゴリを電気・ガスへ統合",
            })
    return next_config, actions


def audit_expenses(expenses: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], Counter]:
    changes: list[dict[str, Any]] = []
    reason_counter: Counter = Counter()
    for expense in expenses:
        raw_category = str(expense.get("category") or "").strip()
        normalized = normalize_category_label(raw_category)
        if not raw_category or normalized != raw_category:
            next_category = normalized or raw_category
            reason = "空欄のため要確認" if not raw_category else "旧カテゴリを現行ラベルへ正規化"
            if raw_category in OLD_UTILITY_LABELS or raw_category in OLD_UTILITY_CODES:
                next_category = UTILITY_LABEL
                reason = "電気・ガスへ統合"
            elif raw_category in {"birth_medical_special", "medical_birth_special"}:
                next_category = "医療費"
                reason = "出産系医療カテゴリを医療費へ統合"
            elif raw_category in {"child_child_daily", "child_child_expense", "子供日常費", "子供費用", "旧: 子供費用"}:
                next_category = "日用品"
                reason = "日用品へ統合"
            elif raw_category in {"車整備", "車保険", "自動車税", "自動車保険", "車両整備", "car_maintenance", "car_insurance", "car_tax", "vehicle_maintenance_total"}:
                next_category = "車両維持費"
                reason = "車両維持費へ統合"
            changes.append({
                "id": expense.get("id", ""),
                "date": expense.get("date", ""),
                "storeName": expense.get("storeName", ""),
                "serialCode": expense.get("serialCode", ""),
                "amount": expense.get("amount", 0),
                "before": raw_category or "（空欄）",
                "after": next_category or "（空欄）",
                "reason": reason,
            })
            reason_counter[reason] += 1
    return changes, reason_counter


def write_report(report: dict[str, Any]) -> tuple[Path, Path]:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = REPORT_DIR / f"utility_home_category_migration_{timestamp}.json"
    md_path = REPORT_DIR / f"utility_home_category_migration_{timestamp}.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    summary_rows = [
        ["支出レコード総数", report["summary"]["expenseCount"]],
        ["支出カテゴリ更新件数", report["summary"]["expenseChanges"]],
        ["電気代→電気・ガス", report["summary"]["electricityChanges"]],
        ["ガス代→電気・ガス", report["summary"]["gasChanges"]],
        ["settings/main.categories 差分件数", report["summary"]["settingsCategoryActions"]],
        ["categoryMasterConfig 差分件数", report["summary"]["masterActions"]],
        ["固定費テンプレカテゴリ差分件数", report["summary"]["recurringTemplateActions"]],
        ["設定保存の適用", "はい" if report["summary"]["settingsUpdated"] else "いいえ"],
        ["支出更新の適用", "はい" if report["summary"]["expenseUpdated"] else "いいえ"],
    ]
    settings_rows = [[item["before"], item["after"], item["reason"]] for item in report["settingsCategoryActions"]]
    master_rows = [[item["beforeCode"], item["beforeLabel"], item["afterCode"], item["afterLabel"], item["reason"]] for item in report["masterActions"]]
    template_rows = [[item["templateId"], item["label"], item["before"], item["after"], item["reason"]] for item in report["recurringTemplateActions"]]
    expense_rows = [[item["id"], item["serialCode"], item["date"], item["storeName"], item["amount"], item["before"], item["after"], item["reason"]] for item in report["expenseChanges"]]

    markdown = []
    markdown.append("# 電気・ガスカテゴリ移行レポート\n")
    markdown.append(f"- 実行日時: {report['generatedAt']}")
    markdown.append(f"- household: `{base.HOUSEHOLD_ID}`")
    markdown.append(f"- apply: `{report['apply']}`\n")
    markdown.append("## 集計サマリー\n")
    markdown.append(base.render_markdown_table(["項目", "値"], summary_rows))
    markdown.append("## settings/main.categories の変更\n")
    markdown.append(base.render_markdown_table(["変更前", "変更後", "理由"], settings_rows))
    markdown.append("## settings/main.categoryMasterConfig の変更\n")
    markdown.append(base.render_markdown_table(["変更前 code", "変更前 label", "変更後 code", "変更後 label", "理由"], master_rows))
    markdown.append("## recurringTemplateConfig の変更\n")
    markdown.append(base.render_markdown_table(["templateId", "名称", "変更前", "変更後", "理由"], template_rows))
    markdown.append("## expense.category の変更\n")
    markdown.append(base.render_markdown_table(["ID", "支出コード", "日付", "店名", "金額", "変更前", "変更後", "理由"], expense_rows))
    md_path.write_text("\n".join(markdown), encoding="utf-8")
    return md_path, json_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Firestore の電気代・ガス代カテゴリを 電気・ガス へ統合します。")
    parser.add_argument("--apply", action="store_true", help="Firestore に実際に反映します。省略時は監査のみです。")
    args = parser.parse_args()

    _settings_document, settings = base.get_settings_document()
    expenses = base.list_expenses()

    migrated_categories, settings_category_actions = base.migrate_categories_list(settings.get("categories") or [])
    migrated_master, master_actions = base.migrate_category_master_config(
        settings.get("categoryMasterConfig") if isinstance(settings.get("categoryMasterConfig"), dict) else {},
        migrated_categories,
    )
    recurring_config, recurring_actions = normalize_recurring_template_config(
        settings.get("recurringTemplateConfig") if isinstance(settings.get("recurringTemplateConfig"), dict) else {}
    )
    expense_changes, reason_counter = audit_expenses(expenses)

    settings_updated = False
    expense_updated = False
    if args.apply:
        next_settings = copy.deepcopy(settings)
        next_settings["categories"] = migrated_categories
        next_settings["categoryMasterConfig"] = migrated_master
        next_settings["recurringTemplateConfig"] = recurring_config
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
            "electricityChanges": sum(1 for item in expense_changes if item["before"] in {"電気代", "電気", "utility_electricity"}),
            "gasChanges": sum(1 for item in expense_changes if item["before"] in {"ガス代", "ガス", "utility_gas"}),
            "settingsCategoryActions": len(settings_category_actions),
            "masterActions": len(master_actions),
            "recurringTemplateActions": len(recurring_actions),
            "settingsUpdated": settings_updated,
            "expenseUpdated": expense_updated,
            "reasonCounter": dict(reason_counter),
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
        "recurringTemplateActions": recurring_actions,
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
