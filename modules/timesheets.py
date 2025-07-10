"""Timesheet management module placeholder."""

from flask import Blueprint, render_template

timesheet_bp = Blueprint('timesheets', __name__, url_prefix='/timesheets')

@timesheet_bp.route('/')
def index():
    """Render the timesheet dashboard."""
    return render_template('timesheets.html')
