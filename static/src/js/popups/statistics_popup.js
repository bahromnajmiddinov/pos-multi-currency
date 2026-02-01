/** @odoo-module */

import { Component, useState, onMounted } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { usePos } from "@point_of_sale/app/hooks/pos_hook";
import { formatMCAmount } from "@pos_multi/js/utils/currency_utils";

/**
 * StatisticsPopup
 *
 * Shows a per-currency breakdown for the current POS session.
 * 
 * CRITICAL: Must use Dialog component wrapper for popup to show!
 */
export class StatisticsPopup extends Component {
    static template = "pos_multi.StatisticsPopup";
    static components = { Dialog };
    
    static props = {
        pos: { type: Object, optional: true },
        close: { type: Function, optional: true },
        getPayload: { type: Function, optional: true },
    };

    setup() {
        this.pos = this.props.pos || usePos();
        
        this.state = useState({
            loading: true,
            rows: [],
        });

        onMounted(() => this.load());
    }

    async load() {
        this.state.loading = true;
        try {
            const sessionId = this.pos.session?.id;
            if (!sessionId) {
                this.state.rows = [];
                return;
            }

            const result = await this.pos.data.call(
                "pos.config",
                "get_multi_currency_statistics",
                [[this.pos.config.id], sessionId]
            );

            const stats = result?.statistics || [];

            this.state.rows = stats.map((row) => {
                const cur = this.pos.models["res.currency"]?.get?.(row.currency_id);
                return {
                    ...row,
                    totalForeign: formatMCAmount(row.total_amount, cur),
                    totalBase: formatMCAmount(
                        row.total_base_amount,
                        this.pos.multiCurrency?.baseCurrency
                    ),
                };
            });
        } catch (e) {
            console.warn("[pos_multi_currency] stats fetch failed:", e);
            this.state.rows = [];
        } finally {
            this.state.loading = false;
        }
    }

    get grandTotalBase() {
        const sum = this.state.rows.reduce((a, r) => a + (r.total_base_amount || 0), 0);
        return formatMCAmount(sum, this.pos.multiCurrency?.baseCurrency);
    }

    get grandTotalTxns() {
        return this.state.rows.reduce((a, r) => a + (r.transaction_count || 0), 0);
    }

    get grandTotalEdited() {
        return this.state.rows.reduce((a, r) => a + (r.manually_edited_count || 0), 0);
    }

    onClose() {
        if (this.props.getPayload) {
            this.props.getPayload(null);
        }
        if (this.props.close) {
            this.props.close();
        }
    }
}