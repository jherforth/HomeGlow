# HomeGlow Widget Plugins Directory

This directory stores all uploaded widget HTML files for the HomeGlow app.

## How it works
- When you upload a widget via the Admin Panel, the HTML file is saved here.
- Each widget is a self-contained HTML file (with optional CSS/JS) that will be rendered in a sandboxed iframe in the app.
- The widget registry (`../widgets_registry.json`) keeps track of all uploaded widgets.

## Security
- Only HTML files are allowed.
- Widgets are rendered in sandboxed iframes for isolation and security.

## Manual Management
- You can manually add or remove HTML files here, but it is recommended to use the Admin Panel for consistency.
- If you manually remove a file, also update `widgets_registry.json` to avoid broken entries.

## Example
To test, upload a file like `hello-widget.html` via the Admin Panel, and it will appear here.


// WIDGET_DEVELOPMENT_GUIDE.md
# HomeGlow Widget Development Guide

Welcome, widget developer! This guide will help you create custom widgets that integrate seamlessly with the HomeGlow dashboard, including support for dynamic themes (light/dark) and transparency.

## Overview

Your widget will be loaded into the main application via an `<iframe>`. To ensure a consistent user experience, the main app passes two important pieces of information to your widget's URL as query parameters:

1.  `theme`: Can be `'light'` or `'dark'`.
2.  `transparent`: Can be `'true'` or `'false'`.

Your widget must read these parameters from the URL and adjust its styling accordingly.

## Core Requirements

### 1. Link to the Main Stylesheet

To use the application's core styles and CSS variables, you **must** link to the main stylesheet in the `<head>` of your HTML file. This gives you access to all the color, size, and layout variables.

```html
<head>
  <!-- ... other head elements ... -->
  <link rel="stylesheet" href="/index.css">
</head>


### 2. Theme Handling

The following JavaScript snippet is essential. It reads the theme and transparent parameters from the URL and applies the necessary attributes and styles to your widget.

Place this script inside a <script> tag at the end of your <body> or within a DOMContentLoaded event listener in your <head>.

<script>
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);

    // 1. Handle Theme
    const theme = params.get('theme');
    if (theme === 'dark' || theme === 'light') {
      // Apply the theme to the root HTML element
      document.documentElement.setAttribute('data-theme', theme);
    }

    // 2. Handle Transparency
    const isTransparent = params.get('transparent') === 'true';
    if (isTransparent) {
      // Make the widget's body background transparent
      document.body.style.background = 'transparent';
      
      // Optional: If you have a main container, make it transparent too.
      // This is an example targeting a div with the class 'widget-container'.
      const mainContainer = document.querySelector('.widget-container');
      if (mainContainer) {
        mainContainer.style.background = 'transparent';
        mainContainer.style.boxShadow = 'none';
        mainContainer.style.backdropFilter = 'none';
        mainContainer.style.border = 'none';
      }
    }
  });
</script>

### 3. Example Widget CSS
By using the CSS variables provided by index.css, your widget will automatically adapt its colors.

/* Example CSS for your widget */
body {
  /* 
    Set the body to transparent by default. 
    The theme script will handle the rest.
  */
  background: transparent; 
  color: var(--text-color); /* Use the app's text color */
  font-family: 'Inter', sans-serif; /* Use the app's font */
  margin: 0;
  padding: 1rem;
}

.widget-container {
  /* Use the app's card styling */
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  box-shadow: var(--shadow);
  backdrop-filter: var(--backdrop-blur);
  border-radius: 12px;
  padding: var(--dynamic-card-padding, 20px);
}

h1 {
  color: var(--text-color);
}

button {
  /* The button styles from index.css will apply automatically */
}

### 4. Testing Your Widget
- Upload your widget HTML file via the Admin Panel.
- Check the widget in the HomeGlow dashboard to ensure it looks and behaves as expected in both light and dark themes.

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Awesome Widget</title>
  
  <!-- 1. Link to the main app's stylesheet -->
  <link rel="stylesheet" href="/index.css">

  <style>
    /* Keep widget-specific styles here */
    body {
      background: transparent;
      color: var(--text-color);
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 1rem; /* Add some padding so content isn't against the edge */
      box-sizing: border-box;
    }

    .widget-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      box-shadow: var(--shadow);
      backdrop-filter: var(--backdrop-blur);
      border-radius: 12px;
      padding: var(--dynamic-card-padding, 20px);
      text-align: center;
      height: calc(400px - 2rem); /* Adjust height to account for body padding */
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }

    h1 {
      color: var(--text-color);
      margin-bottom: 1rem;
    }
  </style>
</head>
<body>

  <div class="widget-container">
    <h1>My Awesome Widget</h1>
    <p>This widget respects the app's theme!</p>
    <button>Styled Button</button>
  </div>

  <!-- 2. Add the essential theme-handling script -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const params = new URLSearchParams(window.location.search);

      // Handle Theme
      const theme = params.get('theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      }

      // Handle Transparency
      const isTransparent = params.get('transparent') === 'true';
      if (isTransparent) {
        document.body.style.background = 'transparent';
        const mainContainer = document.querySelector('.widget-container');
        if (mainContainer) {
          mainContainer.style.background = 'transparent';
          mainContainer.style.boxShadow = 'none';
          mainContainer.style.backdropFilter = 'none';
          mainContainer.style.border = 'none';
        }
      }
    });
  </script>

</body>
</html>

---

**Do not delete this README.**
