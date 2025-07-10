# Dash Productivity Platform

This repository contains a simple prototype of a workplace productivity platform. The goal is to unify several corporate workflows (messaging, CRM, project management, timesheets and leave management) into a single browser-based interface.

The current implementation is a lightweight Flask application that serves static HTML pages representing each module. While the functionality is minimal, the structure is intended to make it easy to extend with real features.

## Requirements

* Python 3.8+
* Flask

Install dependencies with:

```bash
pip install -r requirements.txt
```

## Running the application

Execute the Flask app in development mode:

```bash
python app.py
```

Navigate to `http://localhost:5000/dashboard` in your browser. Use the tabs to switch between modules.

## Future work

This project is a starting point for a SaaS solution. To turn it into a production-ready system, you would need to add authentication, database models, API integrations, and user subscription management.
