# -*- coding: utf-8 -*-
from odoo import models, fields, api


class PosSession(models.Model):
    _inherit = "pos.session"

    # ─── Multi-currency session statistics ─────────────────────────

    has_foreign_payments = fields.Boolean(
        string="Has Foreign Currency",
        compute="_compute_multi_currency_stats",
        store=True,
        help="True if this session has any foreign currency payments.",
    )

    foreign_currency_count = fields.Integer(
        string="Foreign Currencies",
        compute="_compute_multi_currency_stats",
        store=True,
        help="Number of different foreign currencies used in this session.",
    )

    total_foreign_amount = fields.Monetary(
        string="Total Foreign Amount",
        compute="_compute_multi_currency_stats",
        store=True,
        currency_field="currency_id",
        help="Total of all foreign currency payments converted to session currency.",
    )

    foreign_payment_count = fields.Integer(
        string="Foreign Payments",
        compute="_compute_multi_currency_stats",
        store=True,
        help="Number of payment lines using foreign currency.",
    )

    manual_rate_edit_count = fields.Integer(
        string="Manual Rate Edits",
        compute="_compute_multi_currency_stats",
        store=True,
        help="Number of payments with manually edited rates.",
    )

    foreign_currency_breakdown = fields.Json(
        string="Currency Breakdown",
        compute="_compute_multi_currency_breakdown",
        help="Detailed breakdown by currency.",
    )

    # ─── Computed fields ────────────────────────────────────────────

    @api.depends("order_ids.has_foreign_payments",
                 "order_ids.foreign_currency_count",
                 "order_ids.total_foreign_amount",
                 "order_ids.manual_rate_count")
    def _compute_multi_currency_stats(self):
        """Compute multi-currency statistics for the session."""
        for session in self:
            foreign_orders = session.order_ids.filtered("has_foreign_payments")
            
            session.has_foreign_payments = bool(foreign_orders)
            
            # Count all unique currencies across all orders
            all_currencies = set()
            total_foreign = 0.0
            total_payments = 0
            total_manual_edits = 0
            
            for order in foreign_orders:
                if order.foreign_currency_details:
                    for currency_id in order.foreign_currency_details.keys():
                        all_currencies.add(int(currency_id))
                
                total_foreign += order.total_foreign_amount
                total_manual_edits += order.manual_rate_count
                
                # Count foreign payment lines
                total_payments += len(order.payment_ids.filtered(
                    lambda p: p.payment_currency_id and 
                              p.payment_currency_id != order.currency_id
                ))
            
            session.foreign_currency_count = len(all_currencies)
            session.total_foreign_amount = total_foreign
            session.foreign_payment_count = total_payments
            session.manual_rate_edit_count = total_manual_edits

    @api.depends("order_ids.payment_ids.payment_currency_id",
                 "order_ids.payment_ids.payment_currency_amount",
                 "order_ids.payment_ids.amount")
    def _compute_multi_currency_breakdown(self):
        """Build detailed currency breakdown for session."""
        for session in self:
            if not session.has_foreign_payments:
                session.foreign_currency_breakdown = {}
                continue
            
            breakdown = {}
            
            for order in session.order_ids:
                for payment in order.payment_ids:
                    if not payment.payment_currency_id:
                        continue
                    if payment.payment_currency_id == order.currency_id:
                        continue
                    
                    currency_id = payment.payment_currency_id.id
                    
                    if currency_id not in breakdown:
                        breakdown[currency_id] = {
                            "currency_id": currency_id,
                            "currency_name": payment.payment_currency_id.name,
                            "currency_symbol": payment.payment_currency_id.symbol,
                            "total_foreign_amount": 0.0,
                            "total_base_amount": 0.0,
                            "payment_count": 0,
                            "order_count": 0,
                            "manual_edits": 0,
                            "order_ids": set(),
                        }
                    
                    entry = breakdown[currency_id]
                    entry["total_foreign_amount"] += payment.payment_currency_amount
                    entry["total_base_amount"] += payment.amount
                    entry["payment_count"] += 1
                    entry["order_ids"].add(order.id)
                    
                    if payment.rate_manually_edited:
                        entry["manual_edits"] += 1
            
            # Convert sets to counts and remove them
            for currency_id, entry in breakdown.items():
                entry["order_count"] = len(entry["order_ids"])
                del entry["order_ids"]  # Remove set (not JSON serializable)
            
            session.foreign_currency_breakdown = breakdown

    # ─── Methods ────────────────────────────────────────────────────

    def action_view_foreign_currency_breakdown(self):
        """Open a detailed view of foreign currency transactions."""
        self.ensure_one()
        
        return {
            "name": "Foreign Currency Breakdown",
            "type": "ir.actions.act_window",
            "res_model": "pos.payment",
            "view_mode": "tree,form",
            "domain": [
                ("session_id", "=", self.id),
                ("payment_currency_id", "!=", False),
            ],
            "context": {
                "search_default_group_by_currency": 1,
            },
        }
        