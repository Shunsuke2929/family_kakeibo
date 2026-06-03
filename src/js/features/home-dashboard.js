(function registerKakeiboHomeDashboardFeature(global) {
  let lastHomeSummaryDetailOpenedAt = 0;

  function getHomeKpiStatus(assessment) {
    const tone = String(assessment?.tone || "idle");
    if (tone === "good") return { tone: "good", label: "順調" };
    if (tone === "warning" || tone === "watch") return { tone: "watch", label: "注意" };
    if (tone === "idle") return { tone: "idle", label: assessment?.label || "集計待ち" };
    return { tone: "review", label: "見直し推奨" };
  }

  function renderHomeMonthlyKpi(ctx, data = {}) {
    const {
      els,
      currentMonth,
      getDaysInMonth,
      formatCurrency,
    } = ctx;
    const loading = Boolean(data.loading);
    const budget = Math.max(0, Number(data.budget || 0));
    const actual = Math.max(0, Number(data.actual || 0));
    const remaining = budget - actual;
    const expectedToDate = Math.max(0, Number(data.expectedToDate || 0));
    const forecast = Math.max(0, Number(data.forecast || 0));
    const totalDays = Math.max(1, Number(data.totalDays || getDaysInMonth(currentMonth())));
    const elapsedDays = Math.max(1, Math.min(Number(data.elapsedDays || 1), totalDays));
    const remainingDays = Math.max(totalDays - elapsedDays, 0);
    const rawAssessment = data.assessment || { tone: "idle", label: loading ? "更新中" : "集計待ち" };
    const status = loading ? { tone: "idle", label: data.statusLabel || "更新中" } : getHomeKpiStatus(rawAssessment);
    const ratio = budget > 0 ? actual / budget : 0;
    const width = loading ? 0 : Math.min(Math.max(ratio * 100, 0), 140);

    if (els.homeMonthlyKpiStatus) {
      els.homeMonthlyKpiStatus.className = `status-pill status-${status.tone}`;
      els.homeMonthlyKpiStatus.textContent = status.label;
    }
    if (els.homeMonthlyRemainingAmount) {
      els.homeMonthlyRemainingAmount.textContent = loading
        ? "読込中"
        : remaining >= 0
          ? formatCurrency(remaining)
          : `予算超過 ${formatCurrency(Math.abs(remaining))}`;
      els.homeMonthlyRemainingAmount.classList.toggle("is-over", !loading && remaining < 0);
    }
    if (els.homeMonthlyKpiBar) {
      els.homeMonthlyKpiBar.className = `tone-${status.tone === "review" ? "danger" : status.tone}`;
      els.homeMonthlyKpiBar.style.width = `${width}%`;
    }
    if (els.homeMonthlyUsedAmount) els.homeMonthlyUsedAmount.textContent = loading ? "読込中" : formatCurrency(actual);
    if (els.homeMonthlyBudgetAmount) els.homeMonthlyBudgetAmount.textContent = budget ? formatCurrency(budget) : "予算未設定";
    if (els.homeMonthlyPaceMeta) {
      if (loading) {
        els.homeMonthlyPaceMeta.textContent = "読込中";
      } else {
        const delta = actual - expectedToDate;
        const deltaText = ctx.getDashboardDeltaText ? ctx.getDashboardDeltaText(delta) : `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
        els.homeMonthlyPaceMeta.textContent = `${formatCurrency(expectedToDate)} / 目安より ${deltaText}`;
      }
    }
    if (els.homeMonthlyForecastMeta) {
      if (loading) {
        els.homeMonthlyForecastMeta.textContent = data.message || "共有データの読込後に表示します。";
      } else {
        const delta = forecast - budget;
        const deltaText = ctx.getDashboardDeltaText ? ctx.getDashboardDeltaText(delta) : `${delta >= 0 ? "+" : ""}${formatCurrency(delta)}`;
        els.homeMonthlyForecastMeta.textContent = `月末見込み ${formatCurrency(forecast)} (予算 ${deltaText})`;
      }
    }

    if (els.homeMonthlyMiniProgress) {
      if (loading) {
        els.homeMonthlyMiniProgress.innerHTML = `
          <div class="home-loading-indicator">
            <span class="startup-spinner"></span>
            <p class="muted">やりくり費の支出を計算中...</p>
          </div>
        `;
      } else {
        const topExpenses = data.topExpenses || [];
        const categoryTotals = data.categoryTotals || {};
        const escapeHtml = ctx.escapeHtml || ((str) => String(str).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])));

        // 主な支出 HTML
        let expensesHtml = "";
        if (topExpenses.length === 0) {
          expensesHtml = '<p class="muted small" style="text-align: center; padding: 20px 0;">当月のやりくり費支出はありません。</p>';
        } else {
          expensesHtml = `
            <div class="compact-expense-list">
              ${topExpenses.map((item, idx) => {
                const payerLabel = item.personalExpense === "family"
                  ? (item.payer === "husband" ? "夫" : "妻")
                  : "個人";
                const dateShort = item.date ? item.date.slice(5) : "";
                const amountVal = ctx.getDashboardExpenseAmount ? ctx.getDashboardExpenseAmount(item) : (Number(item.netAmount) || Number(item.amount) || 0);
                return `
                  <button class="compact-expense-card expense-card" type="button" data-expense-id="${escapeHtml(item.id)}">
                    <span class="expense-rank-num">${idx + 1}</span>
                    <span class="expense-store-name">${escapeHtml(item.storeName || "不明な店")}</span>
                    <span class="expense-amount-val">${formatCurrency(amountVal)}</span>
                    <span class="expense-cat-badge">${escapeHtml(item.category || "未分類")}</span>
                    <span class="expense-payer-name">${escapeHtml(payerLabel)}</span>
                    <span class="expense-date-val">${escapeHtml(dateShort)}</span>
                  </button>
                `;
              }).join("")}
            </div>
          `;
        }

        // カテゴリ別小計 HTML
        const catKeys = Object.keys(categoryTotals);
        let totalsHtml = "";
        if (catKeys.length === 0) {
          totalsHtml = '<p class="muted small" style="text-align: center; padding: 10px 0;">集計データなし</p>';
        } else {
          totalsHtml = `
            <div class="home-category-totals-row">
              ${catKeys.map(cat => `
                <div class="home-category-total-card">
                  <span class="cat-label">${escapeHtml(cat)}</span>
                  <strong class="cat-amount">${formatCurrency(categoryTotals[cat])}</strong>
                </div>
              `).join("")}
            </div>
          `;
        }

        els.homeMonthlyMiniProgress.innerHTML = `
          <div class="home-variable-expenses-summary-card">
            <h3 class="home-summary-section-title">やりくり費の主な支出 (上位5件)</h3>
            ${expensesHtml}

            <h3 class="home-summary-section-title" style="margin-top: 16px;">カテゴリ別小計</h3>
            ${totalsHtml}
          </div>
        `;

        if (topExpenses.length > 0 && ctx.bindExpenseCardEvents) {
          ctx.bindExpenseCardEvents(els.homeMonthlyMiniProgress, topExpenses);
        }
      }
    }
  }

  function getHomeMiniProgressCardHtml(ctx, label, actual, budget, expectedToDate, assessment, detailOptions = {}) {
    const {
      escapeHtml,
      formatCurrency,
      buildStatusPillHtml,
      buildSummaryDetailAttributes,
      getDashboardDeltaText,
    } = ctx;
    const expected = Math.max(0, Number(expectedToDate || 0));
    const actualAmount = Math.max(0, Number(actual || 0));
    const budgetAmount = Math.max(0, Number(budget || 0));
    const ratio = budgetAmount > 0 ? actualAmount / budgetAmount : 0;
    const width = Math.min(Math.max(ratio * 100, 0), 100);
    const dailyDelta = actualAmount - expected;
    return `
      <button class="home-mini-progress-card summary-detail-card" type="button" data-home-summary-detail="true"${buildSummaryDetailAttributes({ ...detailOptions, expectedTotal: actualAmount })}>
        <div class="home-mini-progress-head">
          <span class="summary-card-icon" aria-hidden="true">${escapeHtml(Array.from(String(label || ""))[0] || "費")}</span>
          <span class="home-mini-title">${escapeHtml(label)}</span>
          ${buildStatusPillHtml(assessment.tone, assessment.label)}
        </div>
        <strong>${escapeHtml(formatCurrency(actualAmount))}<small> / ${escapeHtml(formatCurrency(budgetAmount))}</small></strong>
        <div class="dashboard-progress-bar home-mini-progress-bar"><span class="tone-${escapeHtml(assessment.tone)}" style="width:${width}%"></span></div>
        <small>今日時点の目安 ${escapeHtml(formatCurrency(expected))} / ${escapeHtml(getDashboardDeltaText(dailyDelta))} (未来日付は含みません)</small>
      </button>
    `;
  }

  async function openHomeSummaryDetailFromButton(ctx, button) {
    const {
      els,
      state,
      currentMonth,
      currentYear,
      setSummaryViewMode,
      switchTab,
      renderSummary,
      ensureAllExpensesLoaded,
      getSummaryDetailPayloadFromButton,
      openSummaryDetailModal,
    } = ctx;
    if (!button) return;
    const targetMonth = els.summaryMonth?.value || state.expenseOverview?.currentMonth || currentMonth();
    if (els.summaryMonth) els.summaryMonth.value = targetMonth;
    if (els.summaryYear) els.summaryYear.value = targetMonth.slice(0, 4) || currentYear();
    setSummaryViewMode("monthly", { skipRender: true, force: true });
    switchTab("summary");
    renderSummary();
    if (!state.expensesLoaded) {
      try {
        await ensureAllExpensesLoaded({ silent: true });
        renderSummary();
      } catch (error) {
        console.warn("home summary detail refresh failed", error);
      }
    }
    const payload = getSummaryDetailPayloadFromButton(button);
    openSummaryDetailModal(payload.title, payload.summary, payload.items, payload.incomes);
    requestAnimationFrame(() => {
      els.crossBurdenModal?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      els.crossBurdenDetailList?.querySelector?.(".expense-card")?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
  }

  function handleHomeSummaryDetailActivation(ctx, event) {
    const button = event.currentTarget;
    if (!button) return;
    if (event.type === "pointerup") {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      lastHomeSummaryDetailOpenedAt = Date.now();
    } else if (event.type === "click" && Date.now() - lastHomeSummaryDetailOpenedAt < 700) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openHomeSummaryDetailFromButton(ctx, button).catch((error) => {
      console.error("openHomeSummaryDetailFromButton failed", error);
      ctx.showSyncToast("明細の表示に失敗しました。", "error", { duration: 3200 });
    });
  }

  function bindHomeMonthlyMiniProgressCards(ctx) {
    const { els } = ctx;
    const targets = [];
    if (els.homeMonthlyMiniProgress) {
      targets.push(...Array.from(els.homeMonthlyMiniProgress.querySelectorAll("[data-home-summary-detail]")));
    }
    const detailButton = document.getElementById("homeMonthlyKpiDetailButton");
    if (detailButton) {
      targets.push(detailButton);
    }
    targets.forEach((button) => {
      if (button.dataset.homeSummaryDetailBound === "true") return;
      button.dataset.homeSummaryDetailBound = "true";
      button.addEventListener("pointerup", (event) => handleHomeSummaryDetailActivation(ctx, event));
      button.addEventListener("click", (event) => handleHomeSummaryDetailActivation(ctx, event));
    });
  }

  global.KakeiboHomeDashboardFeature = {
    bindHomeMonthlyMiniProgressCards,
    getHomeKpiStatus,
    getHomeMiniProgressCardHtml,
    openHomeSummaryDetailFromButton,
    renderHomeMonthlyKpi,
  };
})(window);
