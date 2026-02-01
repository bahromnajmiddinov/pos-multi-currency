/** @odoo-module */

import { Component, useState } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import {
    getEffectiveRate,
    roundTo,
    formatMCAmount,
    validateRate,
} from "@pos_multi/js/utils/currency_utils";

export class CurrencySelectionPopup extends Component {
    static template = "pos_multi.CurrencySelectionPopup";
    static components = { Dialog };
    
    static props = {
        title: { type: String, optional: true },
        subtitle: { type: String, optional: true },
        orderAmount: { type: Number, optional: true, default: 0 },
        close: { type: Function, optional: true },
        getPayload: { type: Function, optional: true },
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

        // Bind methods
        this.selectCurrency = this.selectCurrency.bind(this);
        this.onRateInput = this.onRateInput.bind(this);
        this.resetRate = this.resetRate.bind(this);
        this.onCancel = this.onCancel.bind(this);
        this.onConfirm = this.onConfirm.bind(this);
    }

    get currencies() {
        return this.mc?.allowedCurrencies || [];
    }

    get baseCurrencyId() {
        return this.mc?.baseCurrencyId;
    }

    get baseCurrency() {
        return this.mc?.baseCurrency;
    }

    get baseCurrencyName() {
        return this.baseCurrency?.name || "";
    }

    get selectedCurrencyId() {
        return this.state.selectedCurrencyId;
    }

    get selectedCurrency() {
        return this.currencies.find((c) => c.id === this.state.selectedCurrencyId);
    }

    get selectedCurrencyName() {
        return this.selectedCurrency?.name || "";
    }

    get canEditRate() {
        return this.mc?.canEditRate || false;
    }

    get showRateEdit() {
        return this.canEditRate && 
               this.state.selectedCurrencyId && 
               this.state.selectedCurrencyId !== this.baseCurrencyId;
    }

    formatRate(currencyId) {
        const rate = getEffectiveRate(
            this.baseCurrencyId,
            currencyId,
            this.mc?.rates || {},
            this.baseCurrencyId
        );
        return roundTo(rate, 6).toFixed(6);
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

    selectCurrency(currency) {
        this.state.selectedCurrencyId = currency.id;
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
        if (this.props.getPayload) {
            this.props.getPayload(null);
        }
        if (this.props.close) {
            this.props.close();
        }
    }

    onConfirm() {
        if (!this.state.selectedCurrencyId) return;

        const currency = this.selectedCurrency;
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

        const result = {
            currency,
            rate: roundTo(rate, 6),
            manuallyEdited,
        };

        if (this.props.getPayload) {
            this.props.getPayload(result);
        }
        if (this.props.close) {
            this.props.close();
        }
    }
}