/** @odoo-module */

import { Component } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { formatMCAmount, roundTo, getEffectiveRate } from "@pos_multi/js/utils/currency_utils";
import { RateEditPopup } from "@pos_multi/js/popups/rate_edit_popup";
import { makeAwaitable } from "@point_of_sale/app/utils/make_awaitable_dialog";

/**
 * MultiCurrencyBadge
 *
 * A small inline badge rendered inside each payment line when the line
 * uses a non-base currency.  Shows: currency symbol/name, converted amount,
 * effective rate, and an optional "edit rate" button.
 *
 * Props:
 *   - paymentLine  {Object}   The pos.payment record
 */
export class MultiCurrencyBadge extends Component {
    static template = "point_of_sale.MultiCurrencyBadge";
    static props = {
        paymentLine: { type: Object },
    };

    setup() {
        this.pos = usePos();
        this.dialog = useService("dialog");
        this.mc = this.pos.multiCurrency;
    }

    // ─── Getters ────────────────────────────────────────────────────

    get line() {
        return this.props.paymentLine;
    }

    get isVisible() {
        return this.mc?.isActive && this.line?.isMultiCurrency?.();
    }

    get currency() {
        return this.line?.payment_currency_id || null;
    }

    get currencySymbol() {
        return this.currency?.symbol || this.currency?.name || "";
    }

    get currencyName() {
        return this.currency?.name || "";
    }

    get formattedAmount() {
        return formatMCAmount(this.line?.getPaymentCurrencyAmount?.() || 0, this.currency);
    }

    get formattedRate() {
        const rate = this.line?.exchange_rate || 1;
        const baseName = this.mc?.baseCurrency?.name || "";
        return `1 ${baseName} = ${roundTo(rate, 4).toFixed(4)} ${this.currencyName}`;
    }

    get isManuallyEdited() {
        return !!this.line?.rate_manually_edited;
    }

    get canEditRate() {
        return this.mc?.canEditRate || false;
    }

    // ─── Handlers ───────────────────────────────────────────────────

    async onEditRate() {
        const baseCurrencyId = this.mc?.baseCurrencyId;
        const paymentCurrency = this.currency;
        const marketRate = getEffectiveRate(
            baseCurrencyId,
            paymentCurrency.id,
            this.mc?.rates || {},
            baseCurrencyId
        );

        const newRate = await makeAwaitable(this.dialog, RateEditPopup, {
            baseCurrencyId,
            paymentCurrency,
            marketRate,
            currentRate: this.line.exchange_rate || marketRate,
            orderAmount: this.line.getAmount(),
        });

        if (newRate !== undefined && newRate !== null) {
            this.line.setManualRate(newRate);
        }
    }
}
