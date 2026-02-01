/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { formatMCAmount, roundTo, validateRate } from "@pos_multi/js/utils/currency_utils";

export class RateEditPopup extends Component {
    static template = "pos_multi.RateEditPopup";
    static components = { Dialog };
    
    static props = {
        baseCurrencyId: Number,
        paymentCurrency: Object,
        marketRate: Number,
        currentRate: Number,
        orderAmount: { type: Number, optional: true },
        close: { type: Function, optional: true },
        getPayload: { type: Function, optional: true },
    };

    setup() {
        this.pos = usePos();
        this.mc = this.pos.multiCurrency;

        this.state = useState({
            editedRate: this.props.currentRate || this.props.marketRate,
            warning: null,
        });

        // Bind methods
        this.onRateChange = this.onRateChange.bind(this);
        this.resetToMarket = this.resetToMarket.bind(this);
        this.onCancel = this.onCancel.bind(this);
        this.onConfirm = this.onConfirm.bind(this);
    }

    get baseCurrency() {
        return this.mc?.baseCurrency;
    }

    get baseCurrencyName() {
        return this.baseCurrency?.name || "";
    }

    get paymentCurrency() {
        return this.props.paymentCurrency;
    }

    get paymentCurrencyName() {
        return this.paymentCurrency?.name || "";
    }

    get marketRateFormatted() {
        return roundTo(this.props.marketRate, 6).toFixed(6);
    }

    get convertedAmountFormatted() {
        const converted = this.props.orderAmount * this.state.editedRate;
        return formatMCAmount(converted, this.paymentCurrency);
    }

    formatAmount(amount, currency) {
        return formatMCAmount(amount, currency);
    }

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
        if (this.props.getPayload) {
            this.props.getPayload(null);
        }
        if (this.props.close) {
            this.props.close();
        }
    }

    onConfirm() {
        if (this.state.warning) return;

        const rate = parseFloat(this.state.editedRate);
        if (this.props.getPayload) {
            this.props.getPayload(rate);
        }
        if (this.props.close) {
            this.props.close();
        }
    }
}