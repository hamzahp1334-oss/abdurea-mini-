# -*- coding: utf-8 -*-
"""
Vercel Serverless Function entry point for ABDUREA STORE Telegram Mini App.
Serves ONLY the Mini App with strict Telegram ID administrator controls.
"""
import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, redirect, jsonify, send_from_directory
from miniapp_api import miniapp_bp
import database
import config

app = Flask(
    __name__,
    template_folder=str(ROOT_DIR / "templates"),
    static_folder=str(ROOT_DIR / "static"),
    static_url_path="/static"
)
app.secret_key = config.SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024

# Initialize database
try:
    database.init_db()
except Exception as ex:
    app.logger.warning(f"Database init warning: {ex}")

# Register Mini App blueprint (serves /, /miniapp, /shop, /store, /api/miniapp/*)
app.register_blueprint(miniapp_bp)

# Static asset fallbacks
@app.route("/static/<path:filename>")
def serve_static(filename):
    static_dir = ROOT_DIR / "static"
    return send_from_directory(str(static_dir), filename)

@app.route("/miniapp.css")
def serve_css():
    return send_from_directory(str(ROOT_DIR / "static" / "miniapp" / "css"), "miniapp.css", mimetype="text/css")

@app.route("/miniapp.js")
def serve_js():
    return send_from_directory(str(ROOT_DIR / "static" / "miniapp" / "js"), "miniapp.js", mimetype="application/javascript")

@app.route("/healthz")
def healthz():
    return jsonify({
        "status": "ok",
        "app": "ABDUREA STORE Telegram Mini App",
        "version": "2.0.0"
    })

handler = app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
