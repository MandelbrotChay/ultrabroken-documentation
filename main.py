"""
mkdocs-macros-plugin entrypoint.

Provides a lightweight `searchlink` macro so editors can write:

  {% searchlink "term" %}

Optionally pass a label:

  {% searchlink "term", "Label text" %}

This returns an HTML button that the existing `search-link.js` will handle.
Keep this file minimal so it works with standard mkdocs-macros-plugin setups.
"""
from markupsafe import Markup, escape


def define_env(env):
    """Called by mkdocs-macros-plugin to initialize macros."""

    def searchlink(query, label=None):
        q = escape(str(query))
        lbl = escape(str(label)) if label is not None else q
        html = f'<button class="search-link" data-query="{q}" type="button">{lbl}</button>'
        return Markup(html)

    env.register_macro(searchlink, "searchlink")
