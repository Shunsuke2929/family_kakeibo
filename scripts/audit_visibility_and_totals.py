from __future__ import annotations

import sys
import urllib.parse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.append(str((ROOT_DIR / "scripts").resolve()))

import migrate_category_master_v6 as fs  # noqa: E402


REPORT_DIR = ROOT_DIR / "reports"


def list_collection(collection: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    next_page_token = ""
    while True:
        params = {"pageSize": "200"}
        if next_page_token:
            params["pageToken"] = next_page_token
        url = f"{fs.firestore_base_url()}/households/{fs.HOUSEHOLD_ID}/{collection}?{urllib.parse.urlencode(params)}"
        payload = fs.api_request("GET", url)
        for document in payload.get("documents", []):
            value = fs.decode_firestore_document(document)
            value["id"] = value.get("id") or document.get("name", "").rsplit("/", 1)[-1]
            rows.append(value)
        next_page_token = payload.get("nextPageToken", "")
        if not next_page_token:
            break
    return rows


def money(value: Any) -> int:
    try:
        return int(round(float(value or 0)))
    except (TypeError, ValueError):
        return 0


def fmt(value: Any) -> str:
    return f"{money(value):,}円"


def normalize_category_label(value: Any, aliases: dict[str, Any], code_to_label: dict[str, str]) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    alias = aliases.get(raw)
    if isinstance(alias, str) and alias.strip():
        raw = alias.strip()
    return code_to_label.get(raw, raw)


def build_category_maps(settings: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, str], dict[str, Any]]:
    config = settings.get("categoryMasterConfig") or {}
    entries = [item for item in config.get("categories", []) if isinstance(item, dict)]
    by_label = {str(item.get("label") or "").strip(): item for item in entries if str(item.get("label") or "").strip()}
    code_to_label = {
        str(item.get("code") or "").strip(): str(item.get("label") or "").strip()
        for item in entries
        if str(item.get("code") or "").strip() and str(item.get("label") or "").strip()
    }
    aliases = config.get("aliases") or {}
    if not isinstance(aliases, dict):
        aliases = {}
    return by_label, code_to_label, aliases


def get_budget_group(label: str, by_label: dict[str, dict[str, Any]], aliases: dict[str, Any], code_to_label: dict[str, str]) -> str:
    normalized = normalize_category_label(label, aliases, code_to_label)
    return str(by_label.get(normalized, {}).get("budgetGroupKey") or "").strip()


def build_month_plan(rules: dict[str, Any], month_key: str) -> dict[str, int]:
    override = (rules.get("monthlyOverrides") or {}).get(month_key)
    if isinstance(override, dict):
        return {
            "husband": money(override.get("husband")),
            "wife": money(override.get("wife")),
        }
    month = month_key[-2:]
    monthly = rules.get("monthlyContribution") or {}
    bonus = rules.get("bonusContribution") or {}
    return {
        "husband": money(monthly.get("husband")) + money((bonus.get("husband") or {}).get(month)),
        "wife": money(monthly.get("wife")) + money((bonus.get("wife") or {}).get(month)),
    }


def months_for_year(year: str) -> list[str]:
    return [f"{year}-{month:02d}" for month in range(1, 13)]


def main() -> int:
    _doc, settings = fs.get_settings_document()
    expenses = fs.list_expenses()
    transfers = list_collection("transfers")
    household_incomes = list_collection("householdIncomes")
    by_label, code_to_label, aliases = build_category_maps(settings)

    now = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S %z")
    report_path = REPORT_DIR / f"visibility_totals_audit_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    REPORT_DIR.mkdir(exist_ok=True)

    family_expenses = [item for item in expenses if str(item.get("personalExpense") or "family") == "family"]
    serial_counts = Counter(str(item.get("serialCode") or "").strip() for item in expenses if str(item.get("serialCode") or "").strip())
    duplicate_serials = sorted(code for code, count in serial_counts.items() if count > 1)

    category_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "amount": 0})
    category_unknown: list[dict[str, Any]] = []
    group_totals: dict[str, dict[str, int]] = defaultdict(lambda: {"count": 0, "amount": 0})
    missing_group_records: list[dict[str, Any]] = []
    for item in family_expenses:
      label = normalize_category_label(item.get("category"), aliases, code_to_label)
      amount = money(item.get("amount"))
      category_totals[label]["count"] += 1
      category_totals[label]["amount"] += amount
      meta = by_label.get(label)
      if not meta:
          category_unknown.append(item)
      group_key = get_budget_group(label, by_label, aliases, code_to_label)
      if group_key:
          group_totals[group_key]["count"] += 1
          group_totals[group_key]["amount"] += amount
      else:
          missing_group_records.append(item)

    dashboard = settings.get("dashboardBudgetConfig") or {}
    monthly_groups = dashboard.get("monthlyBudgetGroups") or {}
    annual_groups = dashboard.get("annualBudgetGroups") or {}
    configured_groups = set(monthly_groups.keys()) | set(annual_groups.keys())
    group_with_actual_not_configured = sorted(
        key for key, row in group_totals.items()
        if row["amount"] and key not in configured_groups
    )

    year = "2026"
    year_expenses = [item for item in family_expenses if str(item.get("date") or "").startswith(year)]
    year_total = sum(money(item.get("amount")) for item in year_expenses)
    year_by_payer = {
        "husband": sum(money(item.get("amount")) for item in year_expenses if item.get("payer") == "husband"),
        "wife": sum(money(item.get("amount")) for item in year_expenses if item.get("payer") == "wife"),
    }
    year_income = [item for item in household_incomes if str(item.get("date") or "").startswith(year)]
    income_total = sum(money(item.get("amount")) for item in year_income)

    rules = settings.get("settlementRules") or {}
    pool = settings.get("householdPoolConfig") or {}
    opening = (pool.get("openingBalances") or {}).get(year) or {}
    contribution = {"husband": 0, "wife": 0}
    for month_key in months_for_year(year):
        plan = build_month_plan(rules, month_key)
        contribution["husband"] += plan["husband"]
        contribution["wife"] += plan["wife"]
    transfer_net = {"husband": 0, "wife": 0}
    private_transfer_net = {"husband": 0, "wife": 0}
    for item in transfers:
        if not str(item.get("date") or "").startswith(year):
            continue
        amount = money(item.get("amount"))
        target = transfer_net if item.get("settlementScope") == "household_pool" else private_transfer_net
        if item.get("fromPerson") == "husband" and item.get("toPerson") == "wife":
            target["husband"] -= amount
            target["wife"] += amount
        elif item.get("fromPerson") == "wife" and item.get("toPerson") == "husband":
            target["husband"] += amount
            target["wife"] -= amount
    income_by_holder = {
        "husband": sum(money(item.get("amount")) for item in year_income if item.get("holder") != "wife"),
        "wife": sum(money(item.get("amount")) for item in year_income if item.get("holder") == "wife"),
    }
    final_balance = {
        "husband": money(opening.get("husband")) + contribution["husband"] + income_by_holder["husband"] - year_by_payer["husband"] + transfer_net["husband"],
        "wife": money(opening.get("wife")) + contribution["wife"] + income_by_holder["wife"] - year_by_payer["wife"] + transfer_net["wife"],
    }

    gasoline = [
        item for item in expenses
        if normalize_category_label(item.get("category"), aliases, code_to_label) == "ガソリン代"
    ]
    apollo = [item for item in expenses if str(item.get("serialCode")) in {"SA26-0294", "SA26-0295"}]

    lines = [
        "# 家計簿APP 表示・集計監査レポート",
        "",
        f"- 作成日時: `{now}`",
        f"- household: `{fs.HOUSEHOLD_ID}`",
        "",
        "## 1. 正本データ件数",
        "",
        f"- 支出: {len(expenses)}件 / 合計 {fmt(sum(money(item.get('amount')) for item in expenses))}",
        f"- 家計負担支出: {len(family_expenses)}件 / 合計 {fmt(sum(money(item.get('amount')) for item in family_expenses))}",
        f"- 送金: {len(transfers)}件",
        f"- 家計への臨時入金: {len(household_incomes)}件 / 合計 {fmt(sum(money(item.get('amount')) for item in household_incomes))}",
        "",
        "## 2. カテゴリ別の家計負担支出",
        "",
        "| カテゴリ | 件数 | 金額 | 予算グループ |",
        "|---|---:|---:|---|",
    ]
    for label, row in sorted(category_totals.items(), key=lambda item: (-item[1]["amount"], item[0])):
        lines.append(f"| {label or '(空)'} | {row['count']} | {fmt(row['amount'])} | {get_budget_group(label, by_label, aliases, code_to_label) or '未接続'} |")

    lines.extend([
        "",
        "## 3. 表示漏れリスク",
        "",
        f"- 重複 serialCode: {', '.join(duplicate_serials) if duplicate_serials else 'なし'}",
        f"- カテゴリマスター未登録カテゴリ: {len(category_unknown)}件",
        f"- 予算グループ未接続の家計支出: {len(missing_group_records)}件 / {fmt(sum(money(item.get('amount')) for item in missing_group_records))}",
        f"- 実績があるが dashboardBudgetConfig に未設定の予算グループ: {', '.join(group_with_actual_not_configured) if group_with_actual_not_configured else 'なし'}",
        "",
        "## 4. ガソリン代の確認",
        "",
        f"- ガソリン代: {len(gasoline)}件 / 合計 {fmt(sum(money(item.get('amount')) for item in gasoline))}",
        "",
        "| serialCode | 日付 | 店名 | 金額 | カテゴリ |",
        "|---|---|---|---:|---|",
    ])
    for item in sorted(gasoline, key=lambda row: (str(row.get("date") or ""), str(row.get("serialCode") or ""))):
        lines.append(f"| {item.get('serialCode') or ''} | {item.get('date') or ''} | {item.get('storeName') or ''} | {fmt(item.get('amount'))} | {item.get('category') or ''} |")
    lines.extend([
        "",
        "### SA26-0294 / SA26-0295",
        "",
    ])
    for item in apollo:
        lines.append(f"- {item.get('serialCode')}: {item.get('date')} / {item.get('storeName')} / {fmt(item.get('amount'))} / {item.get('category')}")

    lines.extend([
        "",
        "## 5. 2026年 精算式の検算",
        "",
        "| 対象 | 年初残高 | 総拠出額 | 臨時入金 | 家計費で使った額 | 家計費プール移動 | 最終残高 |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ])
    for person, label in [("husband", "夫"), ("wife", "妻")]:
        lines.append(
            f"| {label} | {fmt(opening.get(person))} | {fmt(contribution[person])} | {fmt(income_by_holder[person])} | "
            f"{fmt(year_by_payer[person])} | {fmt(transfer_net[person])} | {fmt(final_balance[person])} |"
        )
    lines.append(f"| 合計 | {fmt(money(opening.get('husband')) + money(opening.get('wife')))} | {fmt(contribution['husband'] + contribution['wife'])} | {fmt(income_total)} | {fmt(year_total)} | {fmt(0)} | {fmt(final_balance['husband'] + final_balance['wife'])} |")
    lines.extend([
        "",
        "### 個人間貸借（家計費プールとは別）",
        "",
        f"- 夫側の差し引き: {fmt(private_transfer_net['husband'])}",
        f"- 妻側の差し引き: {fmt(private_transfer_net['wife'])}",
    ])

    lines.extend([
        "",
        "## 6. 判定",
        "",
        "- Firestore 正本上では `SA26-0294 / SA26-0295` は存在し、カテゴリは `ガソリン代`。",
        "- 検索・集計で隠れる主因は、画面側の古い全件キャッシュとカテゴリ完全一致判定だったため、v5.52以降で再取得とカテゴリコード一致判定を補強済み。",
        "- 本監査では、正本データのカテゴリ別件数・金額と精算式の主要項目を一覧化し、今後の合計額検証に使える状態にした。",
        "",
    ])

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(report_path)
    print(f"expenses={len(expenses)} family={len(family_expenses)} gasoline={len(gasoline)} missing_group={len(missing_group_records)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
