# -*- coding: utf-8 -*-
from odoo import models, fields


class PosPayment(models.Model):
    _inherit = "pos.payment"

    # --- Multi Currency fields stored on each payment line ---
    payment_currency_id = fields.Many2one(
        "res.currency",
        string="Payment Currency",
        help="The currency the customer actually paid in (may differ from order currency).",
    )
    payment_currency_amount = fields.Float(
        string="Amount in Payment Currency",
        digits="Product Price",
        default=0.0,
        help="The amount expressed in the payment currency.",
    )
    exchange_rate = fields.Float(
        string="Exchange Rate",
        digits=(16, 6),
        default=1.0,
        help="Rate used: 1 unit of order currency = exchange_rate units of payment currency.",
    )
    rate_manually_edited = fields.Boolean(
        string="Rate Manually Edited",
        default=False,
        help="True if the cashier manually overrode the exchange rate.",
    )

    def _serialize_payment(self):
        """Extend payment serialisation to include multi-currency fields."""
        data = super()._serialize_payment()
        data.update({
            "payment_currency_id": self.payment_currency_id.id if self.payment_currency_id else False,
            "payment_currency_amount": self.payment_currency_amount,
            "exchange_rate": self.exchange_rate,
            "rate_manually_edited": self.rate_manually_edited,
        })
        return data
