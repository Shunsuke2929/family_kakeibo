(function registerKakeiboSummaryDetailFeature(global) {
  function buildSummaryDetailAttributes(ctx, options = {}) {
    const { escapeHtml } = ctx;
    const detail = String(options.detail || "").trim();
    if (!detail) return "";
    const parts = [
      `data-summary-detail="${escapeHtml(detail)}"`,
    ];
    if (options.period) parts.push(`data-summary-period="${escapeHtml(options.period)}"`);
    if (options.groupKey) parts.push(`data-summary-group-key="${escapeHtml(options.groupKey)}"`);
    if (Array.isArray(options.groupKeys) && options.groupKeys.length) {
      parts.push(`data-summary-group-keys="${escapeHtml(options.groupKeys.join(","))}"`);
    }
    const expectedTotal = Number(options.expectedTotal);
    if (Number.isFinite(expectedTotal)) {
      parts.push(`data-summary-expected-total="${escapeHtml(String(Math.round(expectedTotal)))}"`);
    }
    if (options.title) parts.push(`data-summary-title="${escapeHtml(options.title)}"`);
    return ` ${parts.join(" ")}`;
  }

  function renderHouseholdIncomeDetailCard(ctx, item) {
    const {
      escapeHtml,
      truncateText,
      formatCurrency,
      payerLabels,
      householdIncomeKindLabels,
    } = ctx;
    const holderLabel = payerLabels[item?.holder] || item?.holder || "未設定";
    const kindLabel = householdIncomeKindLabels[item?.kind] || item?.kind || "家計への臨時入金";
    const memo = String(item?.memo || "").trim();
    return `
      <article class="expense-card">
        <div class="expense-topline">
          <div class="expense-mainline">
            <div class="expense-title-row">
              <div class="expense-store">${escapeHtml(item?.sourceName || kindLabel || "家計への臨時入金")}</div>
              <span class="expense-registrant">入金</span>
            </div>
            <div class="expense-subline">【日付】${escapeHtml(item?.date || "")} / 【種別】${escapeHtml(kindLabel)} / 【預かり】${escapeHtml(holderLabel)}</div>
          </div>
          <strong>${escapeHtml(formatCurrency(item?.amount || 0))}</strong>
        </div>
        ${memo ? `<div class="expense-memo-preview">メモ ${escapeHtml(truncateText(memo, 80))}</div>` : ""}
        <div class="badge-row">
          <span class="badge">${escapeHtml(item?.serialCode || "未採番")}</span>
          <span class="badge">家計への臨時入金 ${escapeHtml(formatCurrency(item?.amount || 0))}</span>
        </div>
      </article>
    `;
  }

  function openSummaryDetailModal(ctx, title, summaryText, expenseItems = [], incomeItems = []) {
    const {
      els,
      state,
      setText,
      renderExpenseCardHtml,
      bindExpenseCardEvents,
    } = ctx;
    if (!els.crossBurdenModal || !els.crossBurdenDetailList || !els.crossBurdenModalTitle || !els.crossBurdenModalSummary) return;
    const safeExpenses = Array.isArray(expenseItems) ? expenseItems : [];
    const safeIncomes = Array.isArray(incomeItems) ? incomeItems : [];
    els.crossBurdenModalTitle.textContent = title || "明細";
    setText(els.crossBurdenModalSummary, summaryText || "");
    const expenseHtml = safeExpenses.map(renderExpenseCardHtml).join("");
    const incomeHtml = safeIncomes.map((item) => renderHouseholdIncomeDetailCard(ctx, item)).join("");
    if (!expenseHtml && !incomeHtml) {
      els.crossBurdenDetailList.innerHTML = '<div class="expense-card"><span class="muted">該当する明細はありません。</span></div>';
    } else {
      els.crossBurdenDetailList.innerHTML = [expenseHtml, incomeHtml].filter(Boolean).join("");
      if (safeExpenses.length) bindExpenseCardEvents(els.crossBurdenDetailList, safeExpenses);
    }
    els.crossBurdenModal.classList.remove("hidden");
    els.crossBurdenModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    state.crossBurdenModalOpen = true;
  }

  function getSummaryDetailYear(ctx) {
    const { state, els, currentYear } = ctx;
    if (state.summaryViewMode === "settlement") return els.summarySettlementYear?.value || currentYear();
    if (state.summaryViewMode === "yearly") return els.summaryYear?.value || currentYear();
    return (els.summaryMonth?.value || ctx.currentMonth()).slice(0, 4) || currentYear();
  }

  function getSummaryDetailMonth(ctx) {
    return ctx.els.summaryMonth?.value || ctx.currentMonth();
  }

  function filterFamilyExpensesByPeriod(ctx, period) {
    const monthKey = getSummaryDetailMonth(ctx);
    const yearKey = getSummaryDetailYear(ctx);
    return (Array.isArray(ctx.state.expenses) ? ctx.state.expenses : [])
      .filter(ctx.isFamilySummaryExpense)
      .filter((item) => {
        const date = String(item?.date || "");
        return period === "year" ? date.startsWith(yearKey) : date.startsWith(monthKey);
      });
  }

  function filterDashboardExpensesByPeriod(ctx, period) {
    const monthKey = getSummaryDetailMonth(ctx);
    const yearKey = getSummaryDetailYear(ctx);
    return ctx.getDashboardExpenses()
      .filter((item) => {
        const date = String(item?.date || "");
        return period === "year" ? date.startsWith(yearKey) : date.startsWith(monthKey);
      });
  }

  function getSummaryDetailPayloadFromButton(ctx, button) {
    const detail = String(button?.dataset?.summaryDetail || "").trim();
    const period = String(button?.dataset?.summaryPeriod || "").trim() || (ctx.state.summaryViewMode === "yearly" ? "year" : "month");
    const isDashboardDetail = detail === "dashboard-group";
    const baseItems = isDashboardDetail
      ? filterDashboardExpensesByPeriod(ctx, period)
      : filterFamilyExpensesByPeriod(ctx, period);
    const yearKey = getSummaryDetailYear(ctx);
    const monthKey = getSummaryDetailMonth(ctx);
    let title = String(button?.dataset?.summaryTitle || "").trim();
    let items = [];
    let incomes = [];
    if (detail === "dashboard-group") {
      const groupKeys = String(button?.dataset?.summaryGroupKeys || button?.dataset?.summaryGroupKey || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const groupSet = new Set(groupKeys);
      items = baseItems.filter((item) => groupSet.has(ctx.getCategoryBudgetGroupKey(item?.category)));
      if (!title) title = `${period === "year" ? yearKey : monthKey} ${groupKeys.map((key) => ctx.dashboardGroupLabels[key] || key).join("・")}の明細`;
    } else if (detail === "monthly-total") {
      items = baseItems;
      title = title || `${monthKey} 家計費 月合計の明細`;
    } else if (detail === "monthly-payer") {
      const payer = button?.dataset?.summaryPayer === "wife" ? "wife" : "husband";
      items = baseItems.filter((item) => ctx.getSettlementFamilyPayer(item) === payer);
      title = title || `${monthKey} ${ctx.payerLabels[payer]}支払いの明細`;
    } else if (detail === "monthly-family-card") {
      items = baseItems.filter(ctx.isFamilyCardExpense);
      title = title || `${monthKey} 家族カードの明細`;
    } else if (detail === "yearly-total") {
      items = baseItems;
      title = title || `${yearKey}年 家計費の明細`;
    } else if (detail === "yearly-payer") {
      const payer = button?.dataset?.summaryPayer === "wife" ? "wife" : "husband";
      items = baseItems.filter((item) => ctx.getSettlementFamilyPayer(item) === payer);
      title = title || `${yearKey}年 ${ctx.payerLabels[payer]}支払いの明細`;
    } else if (detail === "yearly-family-card") {
      items = baseItems.filter(ctx.isFamilyCardExpense);
      title = title || `${yearKey}年 家族カードの明細`;
    } else if (detail === "yearly-income") {
      incomes = (Array.isArray(ctx.state.householdIncomes) ? ctx.state.householdIncomes : []).filter((item) => String(item?.date || "").startsWith(yearKey));
      title = title || `${yearKey}年 家計への臨時入金の明細`;
    }
    const expenseTotal = isDashboardDetail
      ? items.reduce((sum, item) => sum + ctx.getDashboardExpenseAmount(item), 0)
      : ctx.sumAmounts(items);
    const incomeTotal = ctx.sumAmounts(incomes);
    const total = expenseTotal + incomeTotal;
    const expectedTotal = Number(button?.dataset?.summaryExpectedTotal);
    const hasExpectedTotal = Number.isFinite(expectedTotal);
    if (hasExpectedTotal && Math.round(expectedTotal) !== Math.round(total)) {
      console.warn("summary detail total mismatch", {
        detail,
        period,
        title,
        expectedTotal,
        actualTotal: total,
        expenseTotal,
        incomeTotal,
      });
    }
    const countText = [
      items.length ? `支出 ${items.length}件` : "",
      incomes.length ? `臨時入金 ${incomes.length}件` : "",
    ].filter(Boolean).join(" / ") || "0件";
    const noteText = (detail !== "dashboard-group" && period === "month") ? " (※当月登録済み明細。未来日付を含む場合があります)" : "";
    return {
      title,
      items,
      incomes,
      total,
      expenseTotal,
      incomeTotal,
      expectedTotal: hasExpectedTotal ? expectedTotal : null,
      matchesExpected: !hasExpectedTotal || Math.round(expectedTotal) === Math.round(total),
      summary: `${countText} / 合計 ${ctx.formatCurrency(total)}${noteText}`,
    };
  }

  function auditSummaryDetailCards(ctx) {
    const cards = Array.from(document.querySelectorAll("[data-summary-detail]"));
    const results = cards.map((card, index) => {
      const payload = getSummaryDetailPayloadFromButton(ctx, card);
      const label = card.querySelector(".dashboard-reference-head span, .dashboard-progress-head span")?.textContent?.trim()
        || String(card.textContent || "").trim().split(/\s+/)[0]
        || `card-${index + 1}`;
      return {
        index,
        label,
        detail: card.dataset.summaryDetail || "",
        period: card.dataset.summaryPeriod || "",
        groupKey: card.dataset.summaryGroupKey || "",
        groupKeys: card.dataset.summaryGroupKeys || "",
        expectedTotal: payload.expectedTotal,
        actualTotal: payload.total,
        expenseCount: payload.items.length,
        incomeCount: payload.incomes.length,
        matchesExpected: payload.matchesExpected,
      };
    });
    return {
      checkedAt: new Date().toISOString(),
      count: results.length,
      mismatchCount: results.filter((item) => item.matchesExpected === false).length,
      results,
      mismatches: results.filter((item) => item.matchesExpected === false),
    };
  }

  function handleSummaryDetailClick(ctx, event) {
    const button = event.target?.closest?.("[data-summary-detail]");
    if (!button) return;
    event.preventDefault();
    const payload = getSummaryDetailPayloadFromButton(ctx, button);
    openSummaryDetailModal(ctx, payload.title, payload.summary, payload.items, payload.incomes);
  }

  global.KakeiboSummaryDetailFeature = {
    auditSummaryDetailCards,
    buildSummaryDetailAttributes,
    getSummaryDetailPayloadFromButton,
    handleSummaryDetailClick,
    openSummaryDetailModal,
    renderHouseholdIncomeDetailCard,
  };
})(window);
