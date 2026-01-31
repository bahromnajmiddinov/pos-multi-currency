# -*- coding: utf-8 -*-
{
    "name": "Point of Sale - Multi Currency",
    "version": "19.0.1.0.0",
    "author": "Odoo Community",
    "website": "https://www.odoo.com",
    "license": "LGPL-3",
    "category": "Point of Sale",
    "depends": ["point_of_sale", "account"],
    "data": [
        # "security/ir.model.access.csv",
        "views/pos_config_views.xml",
        "views/pos_payment_views.xml",
        # "data/pos_multi_currency_data.xml",
    ],
    "assets": {
        "point_of_sale._assets_pos": [
            # CSS
            "pos_multi/static/src/css/multi_currency.css",
            # Utils (no deps – must come first)
            "pos_multi/static/src/js/utils/currency_utils.js",
            # Models
            "pos_multi/static/src/js/models/pos_payment_multi_currency.js",
            "pos_multi/static/src/js/models/pos_config_multi_currency.js",
            # Popups (XML + JS pairs)
            "pos_multi/static/src/js/popups/currency_selection_popup.xml",
            "pos_multi/static/src/js/popups/currency_selection_popup.js",
            "pos_multi/static/src/js/popups/rate_edit_popup.xml",
            "pos_multi/static/src/js/popups/rate_edit_popup.js",
            "pos_multi/static/src/js/popups/statistics_popup.xml",
            "pos_multi/static/src/js/popups/statistics_popup.js",
            # Components (XML + JS pairs)
            "pos_multi/static/src/js/components/multi_currency_badge.xml",
            "pos_multi/static/src/js/components/multi_currency_badge.js",
            "pos_multi/static/src/js/components/currency_rate_info.xml",
            "pos_multi/static/src/js/components/currency_rate_info.js",
            # Screen patches (XML + JS)
            "pos_multi/static/src/js/screens/payment_screen_multi_currency.xml",
            "pos_multi/static/src/js/screens/payment_screen_multi_currency.js",
            "pos_multi/static/src/js/screens/receipt_screen_multi_currency.xml",
        ],
    },
    "installable": True,
    "application": False,
}
