/** @odoo-module */

import { registry } from "@web/core/registry";
import { Base } from "@point_of_sale/app/models/related_models";
import { getEffectiveRate, roundTo, decimalsFromRounding } from "@pos_multi/js/utils/currency_utils";
const { DateTime } = luxon;

export class PosPaymentMultiCurrency extends Base {
    static pythonModel = "pos.payment";

    setup(vals) {
        super.setup(...arguments);
        this.payment_date = DateTime.now();
        this.amount = vals.amount || 0;
        this.ticket = vals.ticket || "";

        // --- Multi-currency fields ---
        this.payment_currency_id = vals.payment_currency_id || null;
        this.payment_currency_amount = vals.payment_currency_amount || 0;
        this.exchange_rate = vals.exchange_rate || 1.0;
        this.rate_manually_edited = vals.rate_manually_edited || false;
    }

    // ─── Original PosPayment API (preserved) ───────────────────────

    isSelected() {
        return this.pos_order_id?.uiState?.selected_paymentline_uuid === this.uuid;
    }

    setAmount(value) {
        this.pos_order_id.assertEditable();
        this.amount = this.pos_order_id.currency.round(parseFloat(value) || 0);
        this._syncCurrencyAmount();
    }

    getAmount() {
        return this.amount || 0;
    }

    getPaymentStatus() {
        return this.payment_status;
    }

    setPaymentStatus(value) {
        this.payment_status = value;
    }

    isDone() {
        return this.getPaymentStatus()
            ? this.getPaymentStatus() === "done" || this.getPaymentStatus() === "reversed"
            : true;
    }

    setCashierReceipt(value) {
        this.cashier_receipt = value;
    }

    setReceiptInfo(value) {
        this.ticket += value;
    }

    isElectronic() {
        return Boolean(this.getPaymentStatus());
    }

    async pay() {
        this.setPaymentStatus("waiting");
        return this.handlePaymentResponse(
            await this.payment_method_id.payment_terminal.sendPaymentRequest(this.uuid)
        );
    }

    handlePaymentResponse(isPaymentSuccessful) {
        if (isPaymentSuccessful) {
            this.setPaymentStatus("done");
            if (this.payment_method_id.payment_method_type !== "qr_code") {
                this.can_be_reversed = this.payment_method_id.payment_terminal.supports_reversals;
            }
        } else {
            this.setPaymentStatus("retry");
        }
        return isPaymentSuccessful;
    }

    updateRefundPaymentLine(refundedPaymentLine) {}

    // ─── Export for receipt ──────────────────────────────────────────

    /**
     * Export payment line data for receipt printing.
     * This is called when generating receipt data.
     */
    export_for_printing() {
        const result = {
            name: this.payment_method_id.name,
            amount: this.amount,
            // Multi-currency fields for receipt
            payment_currency_id: this.payment_currency_id?.id || null,
            payment_currency_name: this.payment_currency_id?.name || null,
            payment_currency_symbol: this.payment_currency_id?.symbol || null,
            payment_currency_amount: this.payment_currency_amount || 0,
            exchange_rate: this.exchange_rate || 1.0,
            rate_manually_edited: this.rate_manually_edited || false,
        };
        return result;
    }

    // ─── Multi-currency API ─────────────────────────────────────────

    setPaymentCurrency(currency, rates, baseCurrencyId) {
        if (!currency) return;
        this.payment_currency_id = currency;

        const orderCurrencyId = this.pos_order_id?.currency?.id;
        if (!orderCurrencyId) return;

        const rate = getEffectiveRate(orderCurrencyId, currency.id, rates, baseCurrencyId);
        this.exchange_rate = roundTo(rate, 6);
        this.rate_manually_edited = false;
        this._syncCurrencyAmount();
    }

    setManualRate(newRate) {
        if (newRate && newRate > 0) {
            this.exchange_rate = roundTo(newRate, 6);
            this.rate_manually_edited = true;
            this._syncCurrencyAmount();
        }
    }

    getPaymentCurrencyAmount() {
        return this.payment_currency_amount || 0;
    }

    isMultiCurrency() {
        if (!this.payment_currency_id) return false;
        const orderCurrencyId = this.pos_order_id?.currency?.id;
        return this.payment_currency_id.id !== orderCurrencyId;
    }

    _syncCurrencyAmount() {
        if (!this.payment_currency_id) {
            this.payment_currency_amount = this.amount;
            return;
        }
        const decimals = decimalsFromRounding(this.payment_currency_id.rounding);
        this.payment_currency_amount = roundTo(this.amount * this.exchange_rate, decimals);
    }
}

registry.category("pos_available_models").add("pos.payment", PosPaymentMultiCurrency, {
    force: true,
});