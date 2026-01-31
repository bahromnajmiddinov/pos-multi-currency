/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import {
    roundTo,
    formatMCAmount,
    validateRate,
} from "@pos_multi/js/utils/currency_utils";

/**
 * RateEditPopup
 *
 * Standalone popup for editing the exchange rate on an already-selected
 * payment line.  Launched from the "Edit Rate" button on the payment line
 * detail view.
 *
 * Props:
 *   - title            {string}
 *   - baseCurrencyId   {number}
 *   - paymentCurrency  {Object}   The payment currency record
 *   - marketRate       {number}   System rate (1 base = ? payment)
 *   - currentRate      {number}   Current rate on the line
 *   - orderAmount      {number}   Base-currency order amount (for preview)
 *   - onConfirm        {fn}       Callback(newRate)
 *   - onCancel         {fn}
 */
export class RateEditPopup extends Component {
    static template = "point_of_sale.RateEditPopup";
    static props = {
        title: { type: String, optional: true },
        baseCurrencyId: { type: Number },
        paymentCurrency: { type: Object },
        marketRate: { type: Number, default: 1.0 },
        currentRate: { type: Number, default: 1.0 },
        orderAmount: { type: Number, optional: true, default: 0 },
        onConfirm: { type: Function },
        onCancel: { type: Function },
    };

    setup() {
        this.pos = usePos();
        this.state = useState({
            editedRate: this.props.currentRate,
            warning: null,
        });
    }

    // ─── Getters ────────────────────────────────────────────────────

    get baseCurrency() {
        return this.pos.models["res.currency"]?.get?.(this.props.baseCurrencyId) || null;
    }

    get baseCurrencyName() {
        return this.baseCurrency?.name || "";
    }

    get paymentCurrencyName() {
        return this.props.paymentCurrency?.name || "";
    }

    get marketRateFormatted() {
        return roundTo(this.props.marketRate, 6).toFixed(6);
    }

    get convertedAmountFormatted() {
        const converted = (this.props.orderAmount || 0) * (this.state.editedRate || 1);
        return formatMCAmount(converted, this.props.paymentCurrency);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    formatAmount(amount, currency) {
        return formatMCAmount(amount, currency);
    }

    // ─── Handlers ───────────────────────────────────────────────────

    onRateChange() {
        const val = parseFloat(this.state.editedRate);
        if (isNaN(val) || val <= 0) {
            this.state.warning = "Rate must be a positive number.";
            return;
        }
        const { valid, message } = validateRate(val, this.props.marketRate);
        this.state.warning = valid ? null : message;
    }

    resetToMarket() {
        this.state.editedRate = this.props.marketRate;
        this.state.warning = null;
    }

    onCancel() {
        this.props.onCancel();
    }

    onConfirm() {
        if (this.state.warning) return;
        const val = parseFloat(this.state.editedRate);
        if (val && val > 0) {
            this.props.onConfirm(roundTo(val, 6));
        }
    }
}
