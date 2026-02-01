# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosOrder(models.Model):
    _inherit = "pos.order"

    # ─── Multi-currency summary fields ─────────────────────────────
    
    has_foreign_payments = fields.Boolean(
        string="Has Foreign Currency Payments",
        compute="_compute_foreign_currency_stats",
        store=True,
        help="True if this order has at least one payment in a foreign currency.",
    )
    
    foreign_currency_count = fields.Integer(
        string="Foreign Currencies Used",
        compute="_compute_foreign_currency_stats",
        store=True,
        help="Number of different foreign currencies used in payments.",
    )
    
    total_foreign_amount = fields.Monetary(
        string="Total Foreign Amount",
        compute="_compute_foreign_currency_stats",
        store=True,
        currency_field="currency_id",
        help="Sum of all foreign currency payments converted to order currency.",
    )
    
    manual_rate_count = fields.Integer(
        string="Manually Edited Rates",
        compute="_compute_foreign_currency_stats",
        store=True,
        help="Number of payment lines with manually edited exchange rates.",
    )
    
    # ─── Detailed multi-currency breakdown (JSON field) ────────────
    
    foreign_currency_details = fields.Json(
        string="Foreign Currency Breakdown",
        compute="_compute_foreign_currency_details",
        store=True,
        help="Detailed breakdown of payments by currency.",
    )

    # ─── Computed fields ────────────────────────────────────────────

    @api.depends("payment_ids.payment_currency_id", 
                 "payment_ids.payment_currency_amount",
                 "payment_ids.exchange_rate",
                 "payment_ids.rate_manually_edited")
    def _compute_foreign_currency_stats(self):
        """Compute summary statistics for foreign currency usage."""
        for order in self:
            foreign_payments = order.payment_ids.filtered(
                lambda p: p.payment_currency_id and p.payment_currency_id != order.currency_id
            )
            
            order.has_foreign_payments = bool(foreign_payments)
            
            # Count unique foreign currencies
            foreign_currencies = foreign_payments.mapped("payment_currency_id")
            order.foreign_currency_count = len(foreign_currencies)
            
            # Sum of foreign payments in base currency
            order.total_foreign_amount = sum(
                p.amount for p in foreign_payments
            )
            
            # Count manually edited rates
            order.manual_rate_count = len(
                foreign_payments.filtered("rate_manually_edited")
            )

    @api.depends("payment_ids.payment_currency_id",
                 "payment_ids.payment_currency_amount",
                 "payment_ids.exchange_rate",
                 "payment_ids.amount")
    def _compute_foreign_currency_details(self):
        """Build detailed breakdown of foreign currency payments."""
        for order in self:
            if not order.has_foreign_payments:
                order.foreign_currency_details = {}
                continue
            
            # Group payments by currency
            breakdown = {}
            for payment in order.payment_ids:
                if not payment.payment_currency_id:
                    continue
                if payment.payment_currency_id == order.currency_id:
                    continue
                
                currency_id = payment.payment_currency_id.id
                currency_name = payment.payment_currency_id.name
                
                if currency_id not in breakdown:
                    breakdown[currency_id] = {
                        "currency_id": currency_id,
                        "currency_name": currency_name,
                        "currency_symbol": payment.payment_currency_id.symbol,
                        "total_foreign_amount": 0.0,
                        "total_base_amount": 0.0,
                        "payment_count": 0,
                        "average_rate": 0.0,
                        "rates_used": [],
                        "manual_edits": 0,
                    }
                
                entry = breakdown[currency_id]
                entry["total_foreign_amount"] += payment.payment_currency_amount
                entry["total_base_amount"] += payment.amount
                entry["payment_count"] += 1
                
                if payment.rate_manually_edited:
                    entry["manual_edits"] += 1
                
                # Track rates used
                rate_info = {
                    "rate": payment.exchange_rate,
                    "manually_edited": payment.rate_manually_edited,
                }
                entry["rates_used"].append(rate_info)
            
            # Calculate average rates
            for currency_id, entry in breakdown.items():
                if entry["payment_count"] > 0 and entry["total_base_amount"] > 0:
                    # Average rate = total foreign / total base
                    entry["average_rate"] = (
                        entry["total_foreign_amount"] / entry["total_base_amount"]
                    )
            
            order.foreign_currency_details = breakdown

    # ─── Export for receipt ─────────────────────────────────────────

    def export_for_ui(self, order):
        """Override to include multi-currency data in POS UI."""
        result = super().export_for_ui(order)
        
        # Add multi-currency summary
        result.update({
            "has_foreign_payments": order.has_foreign_payments,
            "foreign_currency_count": order.foreign_currency_count,
            "total_foreign_amount": order.total_foreign_amount,
            "manual_rate_count": order.manual_rate_count,
            "foreign_currency_details": order.foreign_currency_details or {},
        })
        
        return result

    # ─── Actions ────────────────────────────────────────────────────

    def action_view_foreign_currency_details(self):
        """
        Open a detailed view of this order's foreign currency payments.
        Called from the smart button in the order form.
        """
        self.ensure_one()
        
        # Get all foreign currency payments for this order
        foreign_payments = self.payment_ids.filtered(
            lambda p: p.payment_currency_id and p.payment_currency_id != self.currency_id
        )
        
        return {
            "name": f"Foreign Currency Payments - {self.name}",
            "type": "ir.actions.act_window",
            "res_model": "pos.payment",
            "view_mode": "tree,form",
            "domain": [("id", "in", foreign_payments.ids)],
            "context": {
                "default_pos_order_id": self.id,
                "search_default_group_by_currency": 1,
            },
            "target": "current",
        }

    def action_view_currency_breakdown(self):
        """
        Alternative action to show a summary view of currency breakdown.
        This could open a custom wizard or report in the future.
        """
        self.ensure_one()
        
        if not self.has_foreign_payments:
            return {
                "type": "ir.actions.client",
                "tag": "display_notification",
                "params": {
                    "title": "No Foreign Payments",
                    "message": "This order has no foreign currency payments.",
                    "type": "warning",
                    "sticky": False,
                },
            }
        
        # For now, redirect to the foreign payments view
        return self.action_view_foreign_currency_details()
    
    