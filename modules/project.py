"""Project management module placeholder."""

from flask import Blueprint, render_template

project_bp = Blueprint('project', __name__, url_prefix='/project')

@project_bp.route('/')
def index():
    """Render the project management dashboard."""
    return render_template('project.html')
