/** @odoo-module */

import { OrderReceipt } from "@point_of_sale/app/screens/receipt_screen/receipt/order_receipt";
import { patch } from "@web/core/utils/patch";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { convertAmount, formatMCAmount } from "@pos_multi/js/utils/currency_utils";
import { formatCurrency } from "@web/core/currency";

patch(OrderReceipt.prototype, {
    setup() {
        super.setup();
        this.pos = usePos();
    },

    /**
     * Override formatCurrency to handle receipt currency conversion
     */
    formatCurrency(amount) {
        const mc = this.pos?.multiCurrency;
        
        // If receipt currency is configured and different from order currency
        if (mc?.shouldConvertReceipt) {
            const receiptCurrency = mc.receiptCurrency;
            const orderCurrencyId = this.order.currency?.id;
            
            if (receiptCurrency && orderCurrencyId && receiptCurrency.id !== orderCurrencyId) {
                // Convert amount to receipt currency
                const convertedAmount = convertAmount(
                    amount,
                    orderCurrencyId,
                    receiptCurrency.id,
                    mc.rates,
                    mc.baseCurrencyId
                );
                
                // Format with receipt currency
                return formatMCAmount(convertedAmount, receiptCurrency, true);
            }
        }
        
        // Default formatting with order currency
        return formatCurrency(amount, this.order.currency.id);
    },

    /**
     * Check if we should show original amount (when conversion is active)
     */
    shouldShowOriginalAmount() {
        const mc = this.pos?.multiCurrency;
        return mc?.shouldConvertReceipt && mc.receiptCurrency?.id !== this.order.currency?.id;
    },

    /**
     * Format original amount in order currency
     */
    formatOriginalAmount(amount) {
        return formatCurrency(amount, this.order.currency.id);
    },

    /**
     * Get receipt currency information for display
     */
    get receiptCurrencyInfo() {
        const mc = this.pos?.multiCurrency;
        if (!mc?.receiptCurrency) return null;
        
        const orderCurrencyId = this.order.currency?.id;
        if (!orderCurrencyId || mc.receiptCurrency.id === orderCurrencyId) {
            return null;
        }
        
        return {
            name: mc.receiptCurrency.name,
            symbol: mc.receiptCurrency.symbol,
            rate: mc.rates[mc.receiptCurrency.id] || 1.0,
        };
    },
});