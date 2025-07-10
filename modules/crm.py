"""Customer relationship management module placeholder."""

from flask import Blueprint, render_template

crm_bp = Blueprint('crm', __name__, url_prefix='/crm')

@crm_bp.route('/')
def index():
    """Render the CRM dashboard."""
    return render_template('crm.html')
