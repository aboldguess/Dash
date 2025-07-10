"""Entry point for the Dash productivity platform."""

from flask import Flask, render_template, redirect, url_for
from modules import blueprints

# Create the Flask application instance
app = Flask(__name__)

# Register each blueprint module with the app
for bp in blueprints:
    app.register_blueprint(bp)

@app.route('/')
def index():
    """Redirect to the main dashboard."""
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """Render the landing dashboard with tab navigation."""
    return render_template('dashboard.html')

if __name__ == '__main__':
    app.run(debug=True)
