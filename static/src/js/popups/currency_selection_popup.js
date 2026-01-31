/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import {
    getEffectiveRate,
    roundTo,
    formatMCAmount,
    validateRate,
} from "@pos_multi/js/utils/currency_utils";

/**
 * CurrencySelectionPopup
 *
 * Displayed after the cashier selects a payment method when multi-currency
 * is active.  Shows a grid of available currencies, previews the converted
 * amount, and optionally allows manual rate editing.
 *
 * Props:
 *   - title          {string}   Popup heading
 *   - subtitle       {string}   Sub-heading
 *   - orderAmount    {number}   The base-currency amount to convert (for preview)
 *   - onSelect       {fn}       Callback({ currency, rate, manuallyEdited })
 *   - onCancel       {fn}       Callback when user cancels
 */
export class CurrencySelectionPopup extends Component {
    static template = "point_of_sale.CurrencySelectionPopup";
    static props = {
        title: { type: String, optional: true },
        subtitle: { type: String, optional: true },
        orderAmount: { type: Number, optional: true, default: 0 },
        onSelect: { type: Function },
        onCancel: { type: Function },
    };

    setup() {
        this.pos = usePos();
        this.mc = this.pos.multiCurrency;

        this.state = useState({
            selectedCurrencyId: this.mc?.baseCurrencyId || null,
            manualRate: 1.0,
            rateWarning: null,
            isManuallyEdited: false,
        });
    }

    // ─── Getters ────────────────────────────────────────────────────

    get currencies() {
        return this.mc?.allowedCurrencies || [];
    }

    get baseCurrencyId() {
        return this.mc?.baseCurrencyId;
    }

    get baseCurrencyName() {
        return this.mc?.baseCurrency?.name || "";
    }

    get selectedCurrencyId() {
        return this.state.selectedCurrencyId;
    }

    get selectedCurrencyName() {
        const cur = this.currencies.find((c) => c.id === this.state.selectedCurrencyId);
        return cur?.name || "";
    }

    get canEditRate() {
        return this.mc?.canEditRate || false;
    }

    get manualRate() {
        return this.state.manualRate;
    }

    set manualRate(val) {
        this.state.manualRate = val;
    }

    get rateWarning() {
        return this.state.rateWarning;
    }

    // ─── Helpers ────────────────────────────────────────────────────

    formatRate(currencyId) {
        const rate = getEffectiveRate(
            this.baseCurrencyId,
            currencyId,
            this.mc?.rates || {},
            this.baseCurrencyId
        );
        return roundTo(rate, 4).toFixed(4);
    }

    previewAmount(currency) {
        const orderAmt = this.props.orderAmount || 0;
        let rate;
        if (this.state.selectedCurrencyId === currency.id && this.state.isManuallyEdited) {
            rate = this.state.manualRate;
        } else {
            rate = getEffectiveRate(
                this.baseCurrencyId,
                currency.id,
                this.mc?.rates || {},
                this.baseCurrencyId
            );
        }
        const converted = orderAmt * rate;
        return formatMCAmount(converted, currency);
    }

    _getMarketRate() {
        if (!this.state.selectedCurrencyId) return 1.0;
        return getEffectiveRate(
            this.baseCurrencyId,
            this.state.selectedCurrencyId,
            this.mc?.rates || {},
            this.baseCurrencyId
        );
    }

    // ─── Event handlers ─────────────────────────────────────────────

    selectCurrency(currency) {
        this.state.selectedCurrencyId = currency.id;
        // Reset manual rate to market rate for the newly selected currency
        const marketRate = getEffectiveRate(
            this.baseCurrencyId,
            currency.id,
            this.mc?.rates || {},
            this.baseCurrencyId
        );
        this.state.manualRate = roundTo(marketRate, 6);
        this.state.isManuallyEdited = false;
        this.state.rateWarning = null;
    }

    onRateInput() {
        const val = parseFloat(this.state.manualRate);
        if (isNaN(val) || val <= 0) {
            this.state.rateWarning = "Rate must be a positive number.";
            return;
        }
        this.state.isManuallyEdited = true;
        const marketRate = this._getMarketRate();
        const { valid, message } = validateRate(val, marketRate);
        this.state.rateWarning = valid ? null : message;
    }

    resetRate() {
        const marketRate = this._getMarketRate();
        this.state.manualRate = roundTo(marketRate, 6);
        this.state.isManuallyEdited = false;
        this.state.rateWarning = null;
    }

    onCancel() {
        this.props.onCancel();
    }

    onConfirm() {
        if (!this.state.selectedCurrencyId) return;

        const currency = this.currencies.find((c) => c.id === this.state.selectedCurrencyId);
        if (!currency) return;

        let rate;
        let manuallyEdited = false;

        if (this.state.selectedCurrencyId === this.baseCurrencyId) {
            rate = 1.0;
        } else if (this.state.isManuallyEdited) {
            rate = parseFloat(this.state.manualRate);
            manuallyEdited = true;
        } else {
            rate = getEffectiveRate(
                this.baseCurrencyId,
                currency.id,
                this.mc?.rates || {},
                this.baseCurrencyId
            );
        }

        this.props.onSelect({
            currency,
            rate: roundTo(rate, 6),
            manuallyEdited,
        });
    }
}
