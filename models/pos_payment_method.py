# -*- coding: utf-8 -*-
from odoo import models, fields


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    # If a payment method is locked to a specific currency (e.g. a USD-only card terminal)
    # set it here. When set, the currency popup is skipped for this method.
    fixed_currency_id = fields.Many2one(
        "res.currency",
        string="Fixed Currency",
        help=(
            "Lock this payment method to a single currency. "
            "When set, multi-currency selection is skipped and this currency is used automatically."
        ),
    )
