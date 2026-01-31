import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { registry } from "@web/core/registry";
import { CurrencySelectionPopup } from "@pos_multi/js/popups/currency_selection_popup";
import { MultiCurrencyBadge } from "@pos_multi/js/components/multi_currency_badge";
import { CurrencyRateInfo } from "@pos_multi/js/components/currency_rate_info";
import { StatisticsPopup } from "@pos_multi/js/popups/statistics_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";
import { formatMCAmount, roundTo } from "@pos_multi/js/utils/currency_utils";
import { patch } from "@web/core/utils/patch";

// ─────────────────────────────────────────────────────────────────────────────
// 1. PATCH PaymentScreen
// ─────────────────────────────────────────────────────────────────────────────

import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";

patch(PaymentScreen.prototype, {
    async addNewPaymentLine(paymentMethod) {
        const mc = this.pos?.multiCurrency;

        // Fast-path: multi-currency OFF or method has a fixed currency
        if (!mc?.isActive) {
            return super.addNewPaymentLine(paymentMethod);
        }

        if (paymentMethod.fixed_currency_id) {
            const result = await super.addNewPaymentLine(paymentMethod);
            if (result) {
                const fixedId = paymentMethod.fixed_currency_id.id || paymentMethod.fixed_currency_id;
                const fixedCur = this.pos.models["res.currency"]?.get?.(fixedId);
                if (fixedCur) {
                    const line = this.currentOrder.payment_ids.at(-1);
                    if (line) line.setPaymentCurrency(fixedCur, mc.rates, mc.baseCurrencyId);
                }
            }
            return result;
        }

        // Show currency popup BEFORE adding the line
        const dialog = this.env?.services?.dialog;
        let selection;
        try {
            selection = await makeAwaitable(dialog, CurrencySelectionPopup, {
                title: "Select Payment Currency",
                subtitle: `Payment method: ${paymentMethod.name}`,
                orderAmount: this.currentOrder?.get_due() || 0,
            });
        } catch {
            return false; // user cancelled
        }
        if (!selection) return false;

        // Add the line via core logic
        const result = await super.addNewPaymentLine(paymentMethod);
        if (!result) return false;

        // Stamp the currency onto the new line
        const line = this.currentOrder.payment_ids.at(-1);
        if (line && selection.currency) {
            line.setPaymentCurrency(selection.currency, mc.rates, mc.baseCurrencyId);
            if (selection.manuallyEdited) {
                line.setManualRate(selection.rate);
            }
        }
        return true;
    },

    toggleMultiCurrency() {
        const mc = this.pos?.multiCurrency;
        if (mc) mc.setSessionEnabled(!mc.isActive);
    },

    async openStatistics() {
        const dialog = this.env?.services?.dialog;
        await makeAwaitable(dialog, StatisticsPopup, {
            pos: this.pos,
        });
    },
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. PATCH PaymentScreenPaymentLines to register sub-components
// ─────────────────────────────────────────────────────────────────────────────

import { PaymentScreenPaymentLines } from "@point_of_sale/app/screens/payment_screen/payment_lines/payment_lines";

// Add our components to the PaymentScreenPaymentLines component map
PaymentScreenPaymentLines.components = {
    ...PaymentScreenPaymentLines.components,
    MultiCurrencyBadge,
    CurrencyRateInfo,
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. PATCH ReceiptScreen with getters for template
// ─────────────────────────────────────────────────────────────────────────────

import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

Object.defineProperty(ReceiptScreen.prototype, "hasForeignPayments", {
    get() {
        const order = this.currentOrder;
        if (!order) return false;
        return order.payment_ids.some(
            (p) => typeof p.isMultiCurrency === "function" && p.isMultiCurrency()
        );
    },
    configurable: true,
});

Object.defineProperty(ReceiptScreen.prototype, "foreignPaymentSummary", {
    get() {
        const order = this.currentOrder;
        if (!order) return [];

        const map = new Map();
        for (const p of order.payment_ids) {
            if (typeof p.isMultiCurrency !== "function" || !p.isMultiCurrency()) continue;
            const cur = p.payment_currency_id;
            if (!cur) continue;

            if (!map.has(cur.id)) {
                map.set(cur.id, { total: 0, rate: p.exchange_rate || 1, currency: cur });
            }
            const entry = map.get(cur.id);
            entry.total += p.getPaymentCurrencyAmount();
            if (p.rate_manually_edited) entry.rate = p.exchange_rate;
        }

        const baseName = order.currency?.name || "";
        const out = [];
        for (const [currencyId, entry] of map) {
            out.push({
                currencyId,
                currencyName: entry.currency.name,
                formattedAmount: formatMCAmount(entry.total, entry.currency),
                rateLabel: `1 ${baseName} = ${roundTo(entry.rate, 4).toFixed(4)} ${entry.currency.name}`,
            });
        }
        return out;
    },
    configurable: true,
});

export { CurrencySelectionPopup, MultiCurrencyBadge, CurrencyRateInfo, StatisticsPopup };
