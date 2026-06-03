(function registerKakeiboSettlementFeature(global) {
  function normalizeTransferSettlementScope(item) {
    return item?.settlementScope === "household_pool" ? "household_pool" : "private_lending";
  }

  function addTransferAmountToSummary(summary, item, amount) {
    if (item.fromPerson === "husband" && item.toPerson === "wife") {
      summary.husbandToWifeTotal += amount;
    } else if (item.fromPerson === "wife" && item.toPerson === "husband") {
      summary.wifeToHusbandTotal += amount;
    }
  }

  function buildSettlementReportForRange(ctx, startMonth, endMonth) {
    const {
      state,
      currentYear,
      getMonthsInRange,
      buildSettlementMonthPlan,
      getSettlementFamilyPayer,
      normalizeHouseholdPoolConfig,
      normalizeSettlementRules,
      sumAmounts,
      formatCurrency,
    } = ctx;

    const rules = normalizeSettlementRules(state.settlementRules);
    const normalizedStartMonth = /^\d{4}-\d{2}$/.test(startMonth || "") ? startMonth : `${currentYear()}-01`;
    const normalizedEndMonth = /^\d{4}-\d{2}$/.test(endMonth || "") ? endMonth : normalizedStartMonth;
    const startDate = `${normalizedStartMonth}-01`;
    const endDate = `${normalizedEndMonth}-31`;
    const months = getMonthsInRange(normalizedStartMonth, normalizedEndMonth);
    const targetYear = normalizedEndMonth.slice(0, 4) || normalizedStartMonth.slice(0, 4) || currentYear();
    const yearStartMonth = `${targetYear}-01`;
    const yearStartDate = `${yearStartMonth}-01`;
    const summary = {
      husband: { target: 0, directPayments: 0, householdDelta: 0 },
      wife: { target: 0, directPayments: 0, householdDelta: 0 },
    };
    const monthlyBreakdown = months.map((monthKey) => {
      const monthPlan = buildSettlementMonthPlan(rules, monthKey);
      summary.husband.target += monthPlan.target.husband;
      summary.wife.target += monthPlan.target.wife;
      return monthPlan;
    });
    const familyExpenses = state.expenses.filter((item) => {
      const personalExpense = item?.personalExpense || "family";
      if (personalExpense !== "family") return false;
      if (!item?.date) return false;
      return item.date >= startDate && item.date <= endDate;
    });
    familyExpenses.forEach((item) => {
      const payer = getSettlementFamilyPayer(item, rules);
      const amount = Number(item.amount || 0);
      summary[payer].directPayments += amount;
      const monthKey = String(item?.date || "").slice(0, 7);
      const monthPlan = monthlyBreakdown.find((entry) => entry.monthKey === monthKey);
      if (monthPlan) {
        monthPlan.directPayments[payer] += amount;
        monthPlan.directPayments.total += amount;
      }
    });
    const householdPoolConfig = normalizeHouseholdPoolConfig(state.householdPoolConfig);
    const poolOpening = householdPoolConfig.openingBalances?.[targetYear] || { husband: 0, wife: 0 };
    const poolSummary = {
      year: targetYear,
      opening: {
        husband: Number(poolOpening.husband || 0),
        wife: Number(poolOpening.wife || 0),
        total: Number(poolOpening.husband || 0) + Number(poolOpening.wife || 0),
      },
      assumedContribution: { husband: 0, wife: 0, total: 0 },
      temporaryIncome: { husband: 0, wife: 0, total: 0 },
      directPayments: { husband: 0, wife: 0, total: 0 },
      transferNet: { husband: 0, wife: 0, total: 0 },
      currentBalance: { husband: 0, wife: 0, total: 0 },
    };
    getMonthsInRange(yearStartMonth, normalizedEndMonth).forEach((monthKey) => {
      const monthPlan = buildSettlementMonthPlan(rules, monthKey);
      poolSummary.assumedContribution.husband += monthPlan.target.husband;
      poolSummary.assumedContribution.wife += monthPlan.target.wife;
      poolSummary.assumedContribution.total += monthPlan.target.total;
    });
    const poolFamilyExpenses = state.expenses.filter((item) => {
      const personalExpense = item?.personalExpense || "family";
      if (personalExpense !== "family") return false;
      if (!item?.date) return false;
      return item.date >= yearStartDate && item.date <= endDate;
    });
    poolFamilyExpenses.forEach((item) => {
      const payer = getSettlementFamilyPayer(item, rules);
      const amount = Number(item.amount || 0);
      poolSummary.directPayments[payer] += amount;
      poolSummary.directPayments.total += amount;
    });
    const poolHouseholdIncomes = (Array.isArray(state.householdIncomes) ? state.householdIncomes : []).filter((item) => {
      if (!item?.date) return false;
      return item.date >= yearStartDate && item.date <= endDate;
    });
    poolHouseholdIncomes.forEach((item) => {
      const holder = item?.holder === "wife" ? "wife" : "husband";
      const amount = Number(item.amount || 0);
      poolSummary.temporaryIncome[holder] += amount;
      poolSummary.temporaryIncome.total += amount;
    });
    const transferSummary = {
      husbandToWifeTotal: 0,
      wifeToHusbandTotal: 0,
      netTransferBalance: 0,
    };
    const poolTransferSummary = {
      husbandToWifeTotal: 0,
      wifeToHusbandTotal: 0,
      netTransferBalance: 0,
    };
    const privateTransferSummary = {
      husbandToWifeTotal: 0,
      wifeToHusbandTotal: 0,
      netTransferBalance: 0,
    };
    state.transfers.forEach((item) => {
      const amount = Number(item.amount || 0);
      if (!amount || !item?.date) return;
      const scope = normalizeTransferSettlementScope(item);
      if (scope === "household_pool") {
        if (item.date >= startDate && item.date <= endDate) {
          addTransferAmountToSummary(transferSummary, item, amount);
        }
        if (rules.includeTransfersInSettlement && item.date >= yearStartDate && item.date <= endDate) {
          addTransferAmountToSummary(poolTransferSummary, item, amount);
        }
        return;
      }
      if (item.date >= yearStartDate && item.date <= endDate) {
        addTransferAmountToSummary(privateTransferSummary, item, amount);
      }
    });
    transferSummary.netTransferBalance = transferSummary.wifeToHusbandTotal - transferSummary.husbandToWifeTotal;
    poolTransferSummary.netTransferBalance = poolTransferSummary.wifeToHusbandTotal - poolTransferSummary.husbandToWifeTotal;
    privateTransferSummary.netTransferBalance = privateTransferSummary.wifeToHusbandTotal - privateTransferSummary.husbandToWifeTotal;
    poolSummary.transferNet.husband = poolTransferSummary.netTransferBalance;
    poolSummary.transferNet.wife = -poolTransferSummary.netTransferBalance;
    poolSummary.currentBalance.husband = poolSummary.opening.husband + poolSummary.assumedContribution.husband + poolSummary.temporaryIncome.husband - poolSummary.directPayments.husband + poolSummary.transferNet.husband;
    poolSummary.currentBalance.wife = poolSummary.opening.wife + poolSummary.assumedContribution.wife + poolSummary.temporaryIncome.wife - poolSummary.directPayments.wife + poolSummary.transferNet.wife;
    poolSummary.currentBalance.total = poolSummary.currentBalance.husband + poolSummary.currentBalance.wife;
    ["husband", "wife"].forEach((person) => {
      summary[person].householdDelta = summary[person].directPayments - summary[person].target;
    });
    monthlyBreakdown.forEach((monthPlan) => {
      monthPlan.householdDelta.husband = monthPlan.directPayments.husband - monthPlan.target.husband;
      monthPlan.householdDelta.wife = monthPlan.directPayments.wife - monthPlan.target.wife;
      monthPlan.householdDelta.total = monthPlan.directPayments.total - monthPlan.target.total;
      if (monthPlan.householdDelta.husband < 0 && monthPlan.householdDelta.wife > 0) {
        const amount = Math.round(Math.min(Math.abs(monthPlan.householdDelta.husband), monthPlan.householdDelta.wife));
        monthPlan.householdSettlement = {
          from: "husband",
          to: "wife",
          amount,
          balanceWifeToHusband: -amount,
        };
      } else if (monthPlan.householdDelta.wife < 0 && monthPlan.householdDelta.husband > 0) {
        const amount = Math.round(Math.min(Math.abs(monthPlan.householdDelta.wife), monthPlan.householdDelta.husband));
        monthPlan.householdSettlement = {
          from: "wife",
          to: "husband",
          amount,
          balanceWifeToHusband: amount,
        };
      }
    });
    const husbandDelta = summary.husband.householdDelta;
    const wifeDelta = summary.wife.householdDelta;
    let householdSettlement = {
      from: "",
      to: "",
      amount: 0,
      balanceWifeToHusband: 0,
      description: "家計費だけで見ると、差額はありません。",
    };
    if (husbandDelta < 0 && wifeDelta > 0) {
      const amount = Math.round(Math.min(Math.abs(husbandDelta), wifeDelta));
      householdSettlement = {
        from: "husband",
        to: "wife",
        amount,
        balanceWifeToHusband: -amount,
        description: `家計費だけで見ると、夫→妻 ${formatCurrency(amount)} が目安です。`,
      };
    } else if (wifeDelta < 0 && husbandDelta > 0) {
      const amount = Math.round(Math.min(Math.abs(wifeDelta), husbandDelta));
      householdSettlement = {
        from: "wife",
        to: "husband",
        amount,
        balanceWifeToHusband: amount,
        description: `家計費だけで見ると、妻→夫 ${formatCurrency(amount)} が目安です。`,
      };
    }
    const finalBalanceWifeToHusband = householdSettlement.balanceWifeToHusband;
    let finalSettlement = {
      from: "",
      to: "",
      amount: 0,
      balanceWifeToHusband: finalBalanceWifeToHusband,
      description: "家計費プール残高として翌年へ繰り越す前提です。個人間貸借とは統合しません。",
    };
    if (finalBalanceWifeToHusband > 0) {
      finalSettlement = {
        from: "wife",
        to: "husband",
        amount: Math.round(finalBalanceWifeToHusband),
        balanceWifeToHusband: finalBalanceWifeToHusband,
        description: `家計費プール残高として翌年へ繰り越す前提です。個人間貸借とは統合しません。`,
      };
    } else if (finalBalanceWifeToHusband < 0) {
      finalSettlement = {
        from: "husband",
        to: "wife",
        amount: Math.round(Math.abs(finalBalanceWifeToHusband)),
        balanceWifeToHusband: finalBalanceWifeToHusband,
        description: `家計費プール残高として翌年へ繰り越す前提です。個人間貸借とは統合しません。`,
      };
    }
    return {
      startMonth: normalizedStartMonth,
      endMonth: normalizedEndMonth,
      months,
      rules,
      summary,
      monthlyBreakdown,
      transferSummary,
      poolTransferSummary,
      privateTransferSummary,
      poolSummary,
      householdSettlement,
      finalSettlement,
      familyExpenseTotal: sumAmounts(familyExpenses),
      transferIncluded: Boolean(rules.includeTransfersInSettlement),
      recommendation: finalSettlement.description,
    };
  }

  function buildSettlementReport(ctx) {
    const { startMonth, endMonth } = ctx.getSettlementPeriodRange();
    return buildSettlementReportForRange(ctx, startMonth, endMonth);
  }

  function getSettlementVisualTone(value) {
    const amount = Number(value || 0);
    if (amount > 0) return "positive";
    if (amount < 0) return "negative";
    return "neutral";
  }

  function buildSettlementEquationItem(ctx, item) {
    const { escapeHtml } = ctx;
    return `
      <div class="settlement-equation-item ${item.tone || ""}">
        <span class="settlement-equation-sign">${escapeHtml(item.sign || "")}</span>
        <div>
          <small>${escapeHtml(item.label || "")}</small>
          <strong>${escapeHtml(item.value || "")}</strong>
        </div>
      </div>
    `;
  }

  function buildSettlementPersonWalletCard(ctx, report, person) {
    const {
      escapeHtml,
      formatCurrency,
      formatSignedCurrency,
      formatBalanceCurrency,
      getHouseholdPoolBalanceTone,
    } = ctx;
    const pool = report.poolSummary;
    const opening = Number(pool.opening[person.key] || 0);
    const contribution = Number(pool.assumedContribution[person.key] || 0);
    const income = Number(pool.temporaryIncome[person.key] || 0);
    const spending = Number(pool.directPayments[person.key] || 0);
    const transfer = Number(pool.transferNet[person.key] || 0);
    const balance = Number(pool.currentBalance[person.key] || 0);
    return `
      <article class="settlement-wallet-card ${person.key}">
        <div class="settlement-wallet-head">
          <span>${escapeHtml(person.label)}の家計費プール</span>
          <strong class="settlement-delta ${getHouseholdPoolBalanceTone(balance)}">${escapeHtml(formatBalanceCurrency(balance))}</strong>
        </div>
        <div class="settlement-wallet-formula" aria-label="${escapeHtml(person.label)}の家計費プール計算式">
          <span>${escapeHtml(formatCurrency(opening))}</span>
          <b>+</b>
          <span>${escapeHtml(formatCurrency(contribution))}</span>
          <b>+</b>
          <span>${escapeHtml(formatCurrency(income))}</span>
          <b>-</b>
          <span>${escapeHtml(formatCurrency(spending))}</span>
          <b>${transfer >= 0 ? "+" : "-"}</b>
          <span>${escapeHtml(formatCurrency(Math.abs(transfer)))}</span>
        </div>
        <div class="settlement-wallet-breakdown">
          <span>年初</span><strong>${escapeHtml(formatCurrency(opening))}</strong>
          <span>総拠出</span><strong>${escapeHtml(formatCurrency(contribution))}</strong>
          <span>臨時入金</span><strong>${escapeHtml(formatCurrency(income))}</strong>
          <span>家計費支払</span><strong>-${escapeHtml(formatCurrency(spending))}</strong>
          <span>プール移動</span><strong class="settlement-delta ${getSettlementVisualTone(transfer)}">${escapeHtml(formatSignedCurrency(transfer))}</strong>
        </div>
      </article>
    `;
  }

  function buildSettlementProcessMarkup(ctx, report) {
    const {
      escapeHtml,
      currentYear,
      formatCurrency,
      formatSignedCurrency,
      formatBalanceCurrency,
      getHouseholdPoolHolderSummary,
      getTransferNetSummaryLabel,
    } = ctx;
    const items = Array.isArray(report?.monthlyBreakdown) ? report.monthlyBreakdown : [];
    if (!items.length) return "";
    const overrideCount = items.filter((item) => item.usedOverride).length;
    const targetTotal = Number(report?.summary?.husband?.target || 0) + Number(report?.summary?.wife?.target || 0);
    const familyExpenseTotal = Number(report?.familyExpenseTotal || 0);
    const annualDelta = familyExpenseTotal - targetTotal;
    const annualDeltaClass = annualDelta > 0 ? "negative" : annualDelta < 0 ? "positive" : "";
    const householdBudgetBalanceLabel = annualDelta > 0 ? "家計費の超過" : "家計費の残り";
    const householdBudgetBalanceValue = formatCurrency(Math.abs(annualDelta));
    const yearLabel = String(report?.startMonth || "").slice(0, 4) || currentYear();
    const openingTotal = Number(report?.poolSummary?.opening?.total || 0);
    const temporaryIncomeTotal = Number(report?.poolSummary?.temporaryIncome?.total || 0);
    const currentPoolBalance = Number(report?.poolSummary?.currentBalance?.total || 0);
    const transferNetBalance = Number(report?.poolTransferSummary?.netTransferBalance || 0);
    const equationItems = [
      { sign: "", label: "年初残高", value: formatCurrency(openingTotal), tone: "base" },
      { sign: "+", label: "総拠出額", value: formatCurrency(targetTotal), tone: "plus" },
      { sign: "+", label: "臨時収入", value: formatCurrency(temporaryIncomeTotal), tone: "plus" },
      { sign: "-", label: "家計費", value: formatCurrency(familyExpenseTotal), tone: "minus" },
      { sign: "=", label: "家計費プール残高", value: formatBalanceCurrency(currentPoolBalance), tone: "result" },
    ];
    return [
      `<section class="settlement-visual-section">`,
      `<div class="settlement-report-section-title"><strong>年末精算</strong></div>`,
      `<article class="settlement-process-card">
        <div class="settlement-process-head">
          <div>
            <strong>${escapeHtml(yearLabel)}年の家計費プール</strong>
          </div>
          <span class="dashboard-reference-chip">年末確認</span>
        </div>
        <div class="settlement-equation-strip">${equationItems.map((item) => buildSettlementEquationItem(ctx, item)).join("")}</div>
        <div class="settlement-process-metrics">
          <div class="info-chip block">
            <span>${escapeHtml(householdBudgetBalanceLabel)}</span>
            <strong class="settlement-delta ${annualDeltaClass}">${escapeHtml(householdBudgetBalanceValue)}</strong>
          </div>
          <div class="info-chip block">
            <span>家計費プール移動</span>
            <strong class="settlement-delta ${transferNetBalance > 0 ? "positive" : transferNetBalance < 0 ? "negative" : ""}">${escapeHtml(getTransferNetSummaryLabel(transferNetBalance))}</strong>
          </div>
          <div class="info-chip block">
            <span>翌年繰り越し候補</span>
            <strong>${escapeHtml(formatBalanceCurrency(currentPoolBalance))}</strong>
          </div>
          <div class="info-chip block">
            <span>総拠出の内訳</span>
            <strong>${escapeHtml(formatCurrency(targetTotal))}</strong>
            <small>${overrideCount ? `月別上書き ${overrideCount}件` : "通常設定"}</small>
          </div>
        </div>
      </article>`,
      `</section>`,
    ].join("");
  }

  function renderSettlementReport(ctx) {
    const {
      els,
      state,
      currentYear,
      escapeHtml,
      formatCurrency,
      formatSignedCurrency,
      formatBalanceCurrency,
      getHouseholdPoolHolderSummary,
      getSettlementDirectionLabel,
      getHouseholdPoolBalanceTone,
      getTransferNetSummaryLabel,
      getCrossBurdenYearSummary,
      openSummaryDetailModal,
      setText,
    } = ctx;
    if (!els.summarySettlementSummary || !els.summarySettlementCards || !els.summarySettlementReport) return;
    const report = buildSettlementReport(ctx);
    state.settlementTransferDraft = null;
    const targetYear = String(report.startMonth || "").slice(0, 4) || currentYear();
    const crossBurden = typeof getCrossBurdenYearSummary === "function"
      ? getCrossBurdenYearSummary(targetYear)
      : { husbandPaidForWife: 0, husbandPaidForWifeCount: 0, husbandPaidForWifeItems: [], wifePaidForHusband: 0, wifePaidForHusbandCount: 0, wifePaidForHusbandItems: [] };
    els.summarySettlementSummary.textContent = "";
    els.summarySettlementSummary.classList.add("hidden");
    if (els.summarySettlementApplyTransferButton) {
      els.summarySettlementApplyTransferButton.classList.add("hidden");
      els.summarySettlementApplyTransferButton.disabled = true;
    }
    if (els.summarySettlementActionMessage) {
      setText(els.summarySettlementActionMessage, "");
      els.summarySettlementActionMessage.classList.add("hidden");
    }
    const people = [
      { key: "husband", label: "夫" },
      { key: "wife", label: "妻" },
    ];
    const finalBalanceTotal = Number(report.poolSummary.currentBalance.total || 0);
    const finalHolderSummary = getHouseholdPoolHolderSummary(report.poolSummary.currentBalance);
    const privateSettlementDelta = crossBurden.husbandPaidForWife - crossBurden.wifePaidForHusband;
    const privateSettlementText = privateSettlementDelta > 0
      ? `妻→夫 ${formatCurrency(privateSettlementDelta)}`
      : privateSettlementDelta < 0
        ? `夫→妻 ${formatCurrency(Math.abs(privateSettlementDelta))}`
        : "差額なし";
    const privateTransferNet = Number(report.privateTransferSummary?.netTransferBalance || 0);
    const privateRemainingDelta = privateSettlementDelta - privateTransferNet;
    const privateRemainingText = privateRemainingDelta > 0
      ? `妻→夫 ${formatCurrency(privateRemainingDelta)}`
      : privateRemainingDelta < 0
        ? `夫→妻 ${formatCurrency(Math.abs(privateRemainingDelta))}`
        : "差額なし";
    els.summarySettlementCards.innerHTML = "";
    els.summarySettlementCards.classList.add("hidden");
    els.summarySettlementReport.innerHTML = [
      buildSettlementProcessMarkup(ctx, report),
      `<div class="settlement-report-section-title"><strong>② 家計簿のプール金</strong></div>`,
      `<div class="settlement-wallet-grid">${people.map((person) => buildSettlementPersonWalletCard(ctx, report, person)).join("")}</div>`,
      `<div class="settlement-report-row header"><span>対象</span><span>総拠出額</span><span>家計費支払</span><span>差額</span></div>`,
      ...people.map((person) => {
        const row = report.summary[person.key];
        const deltaClass = row.householdDelta > 0 ? "positive" : row.householdDelta < 0 ? "negative" : "";
        return `
          <div class="settlement-report-row">
            <strong>${escapeHtml(person.label)}</strong>
            <span>${escapeHtml(formatCurrency(row.target))}</span>
            <span>${escapeHtml(formatCurrency(row.directPayments))}</span>
            <span class="settlement-delta ${deltaClass}">${escapeHtml(formatSignedCurrency(row.householdDelta))}</span>
          </div>
        `;
      }),
      `<div class="settlement-report-section-title"><strong>③ 翌年繰り越し</strong></div>`,
      `<div class="settlement-final-grid">
        <article class="settlement-final-card primary">
          <span>2027年へ繰り越す候補</span>
          <strong>${escapeHtml(formatBalanceCurrency(finalBalanceTotal))}</strong>
          <small>${escapeHtml(finalHolderSummary)}</small>
        </article>
        <article class="settlement-final-card">
          <span>家計費プール移動</span>
          <strong>${escapeHtml(getTransferNetSummaryLabel(report.poolTransferSummary.netTransferBalance))}</strong>
          <small>家計費プール移動のみ</small>
        </article>
      </div>`,
      `<div class="settlement-report-section-title"><strong>④ 個人間貸借・個人負担分</strong></div>`,
      `<div class="mini-summary-grid settlement-private-summary">
        <button class="mini-summary-card mini-summary-button" type="button" data-settlement-private-detail="husbandPaidForWife">
          <span>夫が妻負担を支払い</span>
          <strong>${escapeHtml(formatCurrency(crossBurden.husbandPaidForWife))}</strong>
          <small>${escapeHtml(String(crossBurden.husbandPaidForWifeCount || 0))}件</small>
        </button>
        <button class="mini-summary-card mini-summary-button" type="button" data-settlement-private-detail="wifePaidForHusband">
          <span>妻が夫負担を支払い</span>
          <strong>${escapeHtml(formatCurrency(crossBurden.wifePaidForHusband))}</strong>
          <small>${escapeHtml(String(crossBurden.wifePaidForHusbandCount || 0))}件</small>
        </button>
      </div>`,
      `<div class="settlement-report-row header compact"><span>夫 → 妻</span><span>妻 → 夫</span><span>差し引き</span><span>補足</span></div>`,
      `<div class="settlement-report-row compact">
        <span>${escapeHtml(formatCurrency(report.privateTransferSummary.husbandToWifeTotal))}</span>
        <span>${escapeHtml(formatCurrency(report.privateTransferSummary.wifeToHusbandTotal))}</span>
        <span class="settlement-delta ${privateTransferNet > 0 ? "positive" : privateTransferNet < 0 ? "negative" : ""}">${escapeHtml(formatSignedCurrency(privateTransferNet))}</span>
        <small>${escapeHtml(getTransferNetSummaryLabel(privateTransferNet))}</small>
      </div>`,
      `<div class="settlement-final-grid">
        <article class="settlement-final-card">
          <span>私費立替</span>
          <strong>${escapeHtml(privateSettlementDelta === 0 ? "差額なし" : formatCurrency(Math.abs(privateSettlementDelta)))}</strong>
          <small>${escapeHtml(privateSettlementText)}</small>
        </article>
        <article class="settlement-final-card primary">
          <span>個人間貸借 残り</span>
          <strong>${escapeHtml(privateRemainingDelta === 0 ? "差額なし" : formatCurrency(Math.abs(privateRemainingDelta)))}</strong>
          <small>${escapeHtml(privateRemainingText)}</small>
        </article>
      </div>`,
    ].join("");
    els.summarySettlementReport.querySelectorAll("[data-settlement-private-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-settlement-private-detail");
        if (key === "husbandPaidForWife") {
          openSummaryDetailModal?.(
            `${targetYear}年 夫が妻負担を支払った明細`,
            `${crossBurden.husbandPaidForWifeCount}件 / 合計 ${formatCurrency(crossBurden.husbandPaidForWife)}`,
            crossBurden.husbandPaidForWifeItems || [],
          );
          return;
        }
        openSummaryDetailModal?.(
          `${targetYear}年 妻が夫負担を支払った明細`,
          `${crossBurden.wifePaidForHusbandCount}件 / 合計 ${formatCurrency(crossBurden.wifePaidForHusband)}`,
          crossBurden.wifePaidForHusbandItems || [],
        );
      });
    });
  }

  function getSettlementTransferDraft(report) {
    return null;
  }

  function applySettlementTransferDraftToForm(ctx) {
    ctx?.els?.summarySettlementActionMessage?.classList.add("hidden");
  }

  function openSettlementReportForMonth(ctx, monthKey) {
    const { currentMonth, currentYear, switchTab, setSummaryViewMode, els, renderSummary, scrollToElementTop } = ctx;
    const targetMonth = monthKey || currentMonth();
    const targetYear = String(targetMonth).slice(0, 4) || currentYear();
    switchTab("summary");
    setSummaryViewMode("settlement");
    if (els.summaryYear) els.summaryYear.value = targetYear;
    if (els.summarySettlementYear) els.summarySettlementYear.value = targetYear;
    renderSummary();
    scrollToElementTop(els.summarySettlementReport);
  }

  global.KakeiboSettlementFeature = {
    buildSettlementReportForRange,
    buildSettlementReport,
    buildSettlementProcessMarkup,
    renderSettlementReport,
    getSettlementTransferDraft,
    applySettlementTransferDraftToForm,
    openSettlementReportForMonth,
  };
})(window);
