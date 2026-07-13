(function () {
  "use strict";

  const services = window.COFFEE_SERVICES = window.COFFEE_SERVICES || {};
  const validation = window.COFFEE_CORE?.validation;

  function validateStock(bean = {}) {
    const checks = [
      validation?.required(bean.CoffeeName, "Nama kopi"),
      validation?.number(bean.Stock_g, { label: "Stok", min: 0, max: 100000 }),
      validation?.number(bean.Price, { label: "Harga", min: 0, max: 100000000, required: false }),
      validation?.number(bean.Sweetness, { label: "Sweetness", min: 1, max: 5 }),
      validation?.number(bean.Acidity, { label: "Acidity", min: 1, max: 5 }),
      validation?.number(bean.Body, { label: "Body", min: 1, max: 5 })
    ];
    return validation?.collect(checks) || { ok: checks.filter(Boolean).length === 0, errors: checks.filter(Boolean), first: checks.find(Boolean) || "" };
  }

  function estimateCups(stockGram, dose = 15) {
    const stock = Math.max(0, Number(stockGram) || 0);
    const serving = Math.max(1, Number(dose) || 15);
    return Math.floor(stock / serving);
  }

  function getStatus(stockGram, dose = 15) {
    const stock = Math.max(0, Number(stockGram) || 0);
    const cups = estimateCups(stock, dose);
    if (stock <= 0) return { key: "empty", label: "Habis", className: "stock-empty", cups };
    if (cups <= 2) return { key: "critical", label: "Hampir habis", className: "stock-critical", cups };
    if (cups <= 5) return { key: "low", label: "Stok rendah", className: "stock-low", cups };
    return { key: "ready", label: "Siap digunakan", className: "stock-ready", cups };
  }

  async function consume(client, { stockId, amount, timeoutMs = 45000 }) {
    if (!client?.rpc) throw new Error("Database belum siap untuk mengurangi stok.");
    const qty = Number(amount);
    if (!stockId) throw new Error("Biji kopi sumber stok belum dipilih.");
    if (!Number.isFinite(qty) || qty <= 0) throw new Error("Dosis kopi harus lebih dari 0 gram.");

    const operation = client.rpc("consume_stock_for_brew", { p_stock_id: stockId, p_amount: qty });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Pengurangan stok melewati batas waktu.")), timeoutMs));
    const { data, error } = await Promise.race([operation, timeout]);
    if (error) throw error;
    if (!data) throw new Error("Stok tidak berhasil diperbarui.");
    return data;
  }

  services.stock = Object.freeze({ validateStock, estimateCups, getStatus, consume });
})();
