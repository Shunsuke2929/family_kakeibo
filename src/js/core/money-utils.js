(() => {
  window.KakeiboCore = window.KakeiboCore || {};

  function formatCurrency(value) {
    return new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatSignedCurrency(value) {
    const amount = Number(value || 0);
    if (!amount) return formatCurrency(0);
    return `${amount > 0 ? "+" : "-"}${formatCurrency(Math.abs(amount))}`;
  }

  Object.assign(window.KakeiboCore, {
    formatCurrency,
    formatSignedCurrency,
  });
})();
