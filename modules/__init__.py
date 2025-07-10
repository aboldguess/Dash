"""Module registration for the Dash productivity platform."""

from flask import Blueprint

# Blueprint instances for each module are created in their respective files
from .messaging import messaging_bp
from .crm import crm_bp
from .project import project_bp
from .timesheets import timesheet_bp
from .leave import leave_bp

# List of all blueprints to be registered in the main app
blueprints = [
    messaging_bp,
    crm_bp,
    project_bp,
    timesheet_bp,
    leave_bp,
]
