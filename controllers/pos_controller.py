# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request
import json


class PosMultiCurrencyController(http.Controller):

    @http.route(
        "/pos/multi_currency/rates",
        type="json",
        auth="user",
        methods=["POST"],
    )
    def get_rates(self, **kwargs):
        """
        Return latest exchange rates for all active currencies relative to
        the company currency.  Called once when POS session opens and can be
        polled periodically.

        Returns:
            {currency_id: rate_to_company_currency, ...}
        """
        company = request.company
        base_currency = company.currency_id
        # Fetch all active currencies
        currencies = request.env["res.currency"].search([("active", "=", True)])
        rates = {}
        for cur in currencies:
            if cur.id == base_currency.id:
                rates[cur.id] = 1.0
            else:
                # Use Odoo's built-in rate: rate means 1 unit of company currency = rate units of cur
                # We want: 1 unit of base_currency -> how many units of cur
                # That is exactly what Odoo stores as cur.rate
                rates[cur.id] = cur.rate or 1.0
        return {"rates": rates, "base_currency_id": base_currency.id}

    @http.route(
        "/pos/multi_currency/statistics",
        type="json",
        auth="user",
        methods=["POST"],
    )
    def get_statistics(self, **kwargs):
        """
        Return multi-currency payment statistics for the current session.
        Groups payments by currency and aggregates amounts.
        """
        session_id = kwargs.get("session_id")
        if not session_id:
            return {"error": "session_id is required"}

        env = request.env
        # Ensure user has access
        session = env["pos.session"].browse(session_id)
        if not session.exists():
            return {"error": "Session not found"}

        payments = env["pos.payment"].search([
            ("session_id", "=", session_id),
            ("payment_currency_id", "!=", False),
        ])

        stats = {}
        for p in payments:
            cid = p.payment_currency_id.id
            cname = p.payment_currency_id.name
            if cid not in stats:
                stats[cid] = {
                    "currency_id": cid,
                    "currency_name": cname,
                    "total_amount": 0.0,
                    "total_base_amount": 0.0,
                    "transaction_count": 0,
                    "manually_edited_count": 0,
                }
            stats[cid]["total_amount"] += p.payment_currency_amount
            stats[cid]["total_base_amount"] += p.amount  # amount in order currency
            stats[cid]["transaction_count"] += 1
            if p.rate_manually_edited:
                stats[cid]["manually_edited_count"] += 1

        return {"statistics": list(stats.values()), "session_id": session_id}
