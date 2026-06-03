(function registerKakeiboMonthlyCloseFeature(global) {
  function getMonthlyCloseRecord(ctx, monthKey) {
    const { state, normalizeMonthlyCloseConfig, normalizeMonthlyCloseRecord } = ctx;
    const config = normalizeMonthlyCloseConfig(state.monthlyCloseConfig);
    return config.records?.[monthKey] || normalizeMonthlyCloseRecord(monthKey, {});
  }

  function buildMonthlyCloseContext(ctx, targetMonth) {
    const {
      state,
      currentMonth,
      currentYear,
      getDashboardExpenses,
      buildDashboardGroupActuals,
      getDashboardMonthlyFocusGroupKeys,
      getDashboardMonthlyGroupKeys,
      getDashboardAnnualGroupKeys,
      getDashboardBudgetConfig,
      buildProjectedAmount,
      getDaysInMonth,
      getCategoryIntegrityScanItemsFromExpenses,
      getDashboardUnassignedIssueRows,
      buildSettlementReportForRange,
      getSettlementTransferDraft,
    } = ctx;
    const targetYear = String(targetMonth || currentMonth()).slice(0, 4) || currentYear();
    if (!state.expensesLoaded) {
      return {
        targetMonth,
        targetYear,
        status: "open",
        categoryIssues: [],
        unassignedIssues: [],
        settlementReport: buildSettlementReportForRange(targetMonth, targetMonth),
        settlementDraft: null,
        queueSummary: { categoryIssues: 0, unassignedBudgetIssues: 0, settlementOpen: false },
        snapshot: {
          coreVariableActual: 0,
          coreVariableForecast: 0,
          annualSpecialSpent: 0,
          settlementSuggestedDirection: "",
          settlementSuggestedAmount: 0,
        },
      };
    }
    const dashboardExpenses = getDashboardExpenses();
    const monthlyFamilyItems = dashboardExpenses.filter((item) => String(item?.date || "").startsWith(targetMonth));
    const yearlyFamilyItems = dashboardExpenses.filter((item) => String(item?.date || "").startsWith(targetYear));
    const monthlyActuals = buildDashboardGroupActuals(monthlyFamilyItems);
    const yearlyActuals = buildDashboardGroupActuals(yearlyFamilyItems);
    const monthlyFocusGroupKeys = getDashboardMonthlyFocusGroupKeys();
    const monthlyGroupKeys = getDashboardMonthlyGroupKeys();
    const annualGroupKeys = getDashboardAnnualGroupKeys();
    const excludedAnnualGroupKeys = new Set((getDashboardBudgetConfig().excludedAnnualGroups || []));
    const coreVariableActual = monthlyFocusGroupKeys.reduce((sum, key) => sum + Number(monthlyActuals[key] || 0), 0);
    const elapsedMonthDays = Math.max(
      1,
      Math.min(
        targetMonth === currentMonth() ? Number(ctx.todayISO().slice(8, 10)) : getDaysInMonth(targetMonth),
        getDaysInMonth(targetMonth),
      ),
    );
    const coreVariableForecast = buildProjectedAmount(coreVariableActual, elapsedMonthDays, getDaysInMonth(targetMonth));
    const annualSpecialSpent = annualGroupKeys.reduce((sum, key) => sum + Number(yearlyActuals[key] || 0), 0);
    const categoryIssueRows = getCategoryIntegrityScanItemsFromExpenses(
      state.expenses.filter((item) => String(item?.date || "").startsWith(targetMonth)),
    );
    const unassignedIssues = getDashboardUnassignedIssueRows(monthlyFamilyItems, monthlyGroupKeys, annualGroupKeys, excludedAnnualGroupKeys);
    const settlementReport = buildSettlementReportForRange(targetMonth, targetMonth);
    const settlementDraft = getSettlementTransferDraft(settlementReport);
    return {
      targetMonth,
      targetYear,
      status: getMonthlyCloseRecord(ctx, targetMonth).status,
      categoryIssues: categoryIssueRows,
      unassignedIssues,
      settlementReport,
      settlementDraft,
      queueSummary: {
        categoryIssues: categoryIssueRows.length,
        unassignedBudgetIssues: unassignedIssues.length,
        settlementOpen: Boolean(settlementDraft?.amount),
      },
      snapshot: {
        coreVariableActual,
        coreVariableForecast,
        annualSpecialSpent,
        settlementSuggestedDirection: settlementDraft ? `${settlementDraft.from}_to_${settlementDraft.to}` : "",
        settlementSuggestedAmount: Number(settlementDraft?.amount || 0),
      },
    };
  }

  function renderMonthlyCloseSection(ctx, targetMonth) {
    const { els, formatYearMonthLabel, formatCurrency, escapeHtml, userLabels = {} } = ctx;
    if (!els.monthlyCloseSummary || !els.monthlyCloseQueueSummary || !els.monthlyCloseQueueList) return;
    const monthKey = targetMonth || els.summaryMonth?.value || ctx.currentMonth();
    const context = buildMonthlyCloseContext(ctx, monthKey);
    const record = getMonthlyCloseRecord(ctx, monthKey);
    const isClosed = record.status === "closed";
    if (els.monthlyCloseStatusLabel) {
      els.monthlyCloseStatusLabel.className = `status-pill status-${isClosed ? "good" : "idle"}`;
      els.monthlyCloseStatusLabel.textContent = isClosed ? "締め済み" : "未クローズ";
    }
    if (els.monthlyCloseSummary) {
      const closedMeta = isClosed && record.closedAt
        ? ` / ${record.closedAt.slice(0, 10)} ${userLabels[record.closedBy] || record.closedBy || ""} が記録`
        : "";
      els.monthlyCloseSummary.textContent = `${formatYearMonthLabel(monthKey)} の月末確認です。未処理キューを見てから、今月のメモとスナップショットを残せます${closedMeta}。`;
    }
    if (els.monthlyCloseQueueSummary) {
      els.monthlyCloseQueueSummary.textContent = `カテゴリ確認 ${context.queueSummary.categoryIssues}件 / 予算未接続 ${context.queueSummary.unassignedBudgetIssues}件 / 精算確認 ${context.queueSummary.settlementOpen ? "あり" : "不要"}`;
    }
    if (els.monthlyCloseQueueList) {
      const rows = [
        {
          label: "カテゴリ不整合",
          value: `${context.queueSummary.categoryIssues}件`,
          note: context.queueSummary.categoryIssues ? "検索タブのカテゴリ不整合スキャンで確認できます。" : "この月のカテゴリ不整合は見つかっていません。",
        },
        {
          label: "予算グループ未接続",
          value: `${context.queueSummary.unassignedBudgetIssues}件`,
          note: context.queueSummary.unassignedBudgetIssues ? "今月の家計チェックに未反映のカテゴリがあります。" : "今月の家計負担分は予算グループへ接続されています。",
        },
        {
          label: "精算レポート",
          value: context.queueSummary.settlementOpen ? formatCurrency(context.snapshot.settlementSuggestedAmount) : "差額なし",
          note: context.queueSummary.settlementOpen
            ? `${context.settlementDraft?.from === "wife" ? "妻" : "夫"} → ${context.settlementDraft?.to === "wife" ? "妻" : "夫"} の確認が残っています。`
            : "この月の精算差額はありません。",
        },
      ];
      els.monthlyCloseQueueList.innerHTML = rows.map((row) => `
        <div class="monthly-close-queue-item">
          <strong>${escapeHtml(row.label)}</strong>
          <span>${escapeHtml(row.value)}</span>
          <small>${escapeHtml(row.note)}</small>
        </div>
      `).join("");
    }
    if (els.monthlyCloseUnexpectedItems) els.monthlyCloseUnexpectedItems.value = record.notes?.unexpectedItems || "";
    if (els.monthlyCloseNextMonthActions) els.monthlyCloseNextMonthActions.value = record.notes?.nextMonthActions || "";
    if (els.monthlyCloseCarryoverNotes) els.monthlyCloseCarryoverNotes.value = record.notes?.carryoverNotes || "";
    if (els.monthlyCloseSnapshotSummary) {
      els.monthlyCloseSnapshotSummary.textContent = isClosed
        ? `保存済み: やりくり費 ${formatCurrency(record.snapshot.coreVariableActual)} / 着地見込み ${formatCurrency(record.snapshot.coreVariableForecast)} / 年の特別費 ${formatCurrency(record.snapshot.annualSpecialSpent)} / 精算目安 ${record.snapshot.settlementSuggestedAmount ? formatCurrency(record.snapshot.settlementSuggestedAmount) : "なし"}`
        : `今回の記録予定: やりくり費 ${formatCurrency(context.snapshot.coreVariableActual)} / 着地見込み ${formatCurrency(context.snapshot.coreVariableForecast)} / 年の特別費 ${formatCurrency(context.snapshot.annualSpecialSpent)} / 精算目安 ${context.snapshot.settlementSuggestedAmount ? formatCurrency(context.snapshot.settlementSuggestedAmount) : "なし"}`;
    }
    if (els.monthlyCloseSearchIssuesButton) els.monthlyCloseSearchIssuesButton.disabled = !context.queueSummary.categoryIssues && !context.queueSummary.unassignedBudgetIssues;
    if (els.monthlyCloseSettlementButton) els.monthlyCloseSettlementButton.disabled = !context.queueSummary.settlementOpen;
    if (els.monthlyCloseSaveButton) els.monthlyCloseSaveButton.textContent = isClosed ? "締め内容を更新" : "この月を締める";
    if (els.monthlyCloseReopenButton) els.monthlyCloseReopenButton.classList.toggle("hidden", !isClosed);
  }

  function collectMonthlyCloseNotesFromInputs(ctx) {
    const { els } = ctx;
    return {
      unexpectedItems: String(els.monthlyCloseUnexpectedItems?.value || "").trim(),
      nextMonthActions: String(els.monthlyCloseNextMonthActions?.value || "").trim(),
      carryoverNotes: String(els.monthlyCloseCarryoverNotes?.value || "").trim(),
    };
  }

  async function saveMonthlyCloseRecord(ctx) {
    const { els, state, normalizeMonthlyCloseConfig, setText, canUseSharedStorage, saveSharedSettingsFields } = ctx;
    const monthKey = els.summaryMonth?.value || ctx.currentMonth();
    const context = buildMonthlyCloseContext(ctx, monthKey);
    const queueNote = context.queueSummary.categoryIssues || context.queueSummary.unassignedBudgetIssues || context.queueSummary.settlementOpen
      ? `未処理キューがあります（カテゴリ ${context.queueSummary.categoryIssues}件 / 予算未接続 ${context.queueSummary.unassignedBudgetIssues}件 / 精算確認 ${context.queueSummary.settlementOpen ? "あり" : "不要"}）。このまま締めを記録しますか？`
      : `${ctx.formatYearMonthLabel(monthKey)} を締めとして記録しますか？`;
    if (!window.confirm(queueNote)) return;
    const config = normalizeMonthlyCloseConfig(state.monthlyCloseConfig);
    state.monthlyCloseConfig = normalizeMonthlyCloseConfig({
      ...config,
      records: {
        ...config.records,
        [monthKey]: {
          status: "closed",
          closedAt: new Date().toISOString(),
          closedBy: state.currentUser?.email || "",
          notes: collectMonthlyCloseNotesFromInputs(ctx),
          snapshot: context.snapshot,
          queueSummary: context.queueSummary,
        },
      },
    });
    setText(els.monthlyCloseMessage, "月次クローズを保存しています...");
    ctx.persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      renderMonthlyCloseSection(ctx, monthKey);
      setText(els.monthlyCloseMessage, "ローカルに月次クローズを保存しました。");
      return;
    }
    try {
      const result = await saveSharedSettingsFields({
        monthlyCloseConfig: state.monthlyCloseConfig,
      });
      if (!result?.ok) throw result?.error || new Error("shared settings save failed");
      renderMonthlyCloseSection(ctx, monthKey);
      setText(els.monthlyCloseMessage, "月次クローズを保存しました。");
    } catch (error) {
      console.error("Failed to save monthly close config", error);
      setText(els.monthlyCloseMessage, "月次クローズの保存に失敗しました。");
    }
  }

  async function reopenMonthlyCloseRecord(ctx) {
    const { els, state, normalizeMonthlyCloseConfig, setText, canUseSharedStorage, saveSharedSettingsFields } = ctx;
    const monthKey = els.summaryMonth?.value || ctx.currentMonth();
    if (!window.confirm(`${ctx.formatYearMonthLabel(monthKey)} の締め記録を解除しますか？`)) return;
    const config = normalizeMonthlyCloseConfig(state.monthlyCloseConfig);
    const nextRecords = { ...config.records };
    delete nextRecords[monthKey];
    state.monthlyCloseConfig = normalizeMonthlyCloseConfig({
      ...config,
      records: nextRecords,
    });
    setText(els.monthlyCloseMessage, "締め記録を解除しています...");
    ctx.persist({ skipRemote: true });
    if (!canUseSharedStorage()) {
      renderMonthlyCloseSection(ctx, monthKey);
      setText(els.monthlyCloseMessage, "月次クローズの締め記録を解除しました。");
      return;
    }
    try {
      const result = await saveSharedSettingsFields({
        monthlyCloseConfig: state.monthlyCloseConfig,
      });
      if (!result?.ok) throw result?.error || new Error("shared settings save failed");
      renderMonthlyCloseSection(ctx, monthKey);
      setText(els.monthlyCloseMessage, "月次クローズの締め記録を解除しました。");
    } catch (error) {
      console.error("Failed to reopen monthly close record", error);
      setText(els.monthlyCloseMessage, "締め記録の解除に失敗しました。");
    }
  }

  global.KakeiboMonthlyCloseFeature = {
    getMonthlyCloseRecord,
    buildMonthlyCloseContext,
    renderMonthlyCloseSection,
    collectMonthlyCloseNotesFromInputs,
    saveMonthlyCloseRecord,
    reopenMonthlyCloseRecord,
  };
})(window);
