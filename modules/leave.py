"""Leave request management module placeholder."""

from flask import Blueprint, render_template

leave_bp = Blueprint('leave', __name__, url_prefix='/leave')

@leave_bp.route('/')
def index():
    """Render the leave request dashboard."""
    return render_template('leave.html')
