# HomeGlow Widget Development Guide

Welcome to HomeGlow widget development! This guide will help you create custom widgets that integrate seamlessly with the HomeGlow dashboard.

## 📋 Overview

HomeGlow widgets are self-contained HTML files that run in sandboxed iframes. They automatically receive theme information and can be made transparent to blend with the main application's background.

## 🎯 Core Requirements

### 1. Link to Main Stylesheet
Your widget **must** include this link in the `<head>` section to access the app's CSS variables:

```html
<link rel="stylesheet" href="/index.css">
```

### 2. Theme Handling Script
Include this essential JavaScript code to handle theme and transparency:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);

  // Handle Theme
  const theme = params.get('theme');
  if (theme === 'dark' || theme === 'light') {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // Handle Transparency (if needed)
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
```

## 🎨 Recommended Styling Approach

For maximum compatibility with HomeGlow's theming system, use this CSS structure:

```css
/* Force all backgrounds transparent */
* {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}

body {
  background: transparent !important;
  font-family: 'Inter', sans-serif;
  margin: 0;
  padding: 0.75rem;
  box-sizing: border-box;
  font-size: 0.85rem;
  color: #333; /* Light theme text */
}

[data-theme="dark"] body {
  color: #a6a6d1; /* Dark theme text */
  background: transparent !important;
}

.widget-container {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
  border-radius: 12px;
  padding: 0.5rem;
  text-align: center;
  width: 100%;
  max-height: calc(100vh - 1.5rem);
  overflow-y: auto;
}

/* Buttons should match app styling */
.custom-button {
  background: linear-gradient(45deg, #00ddeb, #ff6b6b) !important;
  color: #333 !important;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.3s ease;
}

[data-theme="dark"] .custom-button {
  background: linear-gradient(45deg, #2e2767, #620808) !important;
  color: #a6a6d1 !important;
}
```

## 🔧 Theme Colors

### Text Colors:
- **Light theme:** `#333` (dark gray)
- **Dark theme:** `#a6a6d1` (light purple-gray)

### Button Gradients:
- **Light theme:** `linear-gradient(45deg, #00ddeb, #ff6b6b)`
- **Dark theme:** `linear-gradient(45deg, #2e2767, #620808)`

### Error Colors:
- **Light theme:** `#dc3545`
- **Dark theme:** `#ff6b6b`

## 📝 Complete Widget Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>My Widget</title>
  <link rel="stylesheet" href="/index.css">
  <style>
    * {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
    }

    body {
      background: transparent !important;
      font-family: 'Inter', sans-serif;
      margin: 0;
      padding: 0.75rem;
      box-sizing: border-box;
      font-size: 0.85rem;
      color: #333;
    }

    [data-theme="dark"] body {
      color: #a6a6d1;
      background: transparent !important;
    }

    .widget-container {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      backdrop-filter: none !important;
      border-radius: 12px;
      padding: 0.5rem;
      text-align: center;
      width: 100%;
      max-height: calc(100vh - 1.5rem);
      overflow-y: auto;
    }

    .widget-title {
      font-size: 1.2rem;
      font-weight: 700;
      margin: 0 0 0.5rem 0;
      color: inherit;
    }

    .custom-button {
      background: linear-gradient(45deg, #00ddeb, #ff6b6b) !important;
      color: #333 !important;
      border: none;
      border-radius: 8px;
      padding: 8px 16px;
      cursor: pointer;
      font-size: 0.8rem;
      font-weight: 600;
      transition: all 0.3s ease;
      margin: 0.25rem;
    }

    [data-theme="dark"] .custom-button {
      background: linear-gradient(45deg, #2e2767, #620808) !important;
      color: #a6a6d1 !important;
    }

    .custom-button:hover {
      filter: brightness(1.1);
      transform: translateY(-1px);
    }
  </style>
</head>
<body>
  <div class="widget-container">
    <h1 class="widget-title">🎯 My Widget</h1>
    <p>Widget content goes here!</p>
    <button class="custom-button">Action Button</button>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Handle theme
      const params = new URLSearchParams(window.location.search);
      const theme = params.get('theme');
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      }

      // Your widget logic here
      console.log('Widget loaded with theme:', theme);
    });
  </script>
</body>
</html>
```

## 🚀 Development Workflow

1. **Create your HTML file** using the template above
2. **Test locally** by opening in a browser with `?theme=dark` or `?theme=light` parameters
3. **Upload via Admin Panel** → Plugins tab → Upload Widget
4. **Enable in Widget Gallery** using the toggle switches
5. **Test transparency** using the master transparency toggle

## 💡 Best Practices

- **Keep it lightweight** - widgets load in iframes
- **Use semantic HTML** for accessibility
- **Test both themes** thoroughly
- **Handle errors gracefully** with try/catch blocks
- **Use localStorage** for persistent settings (scoped to your widget)
- **Avoid external dependencies** when possible
- **Make it responsive** for different screen sizes

## 🔍 Debugging

- **Check browser console** for JavaScript errors
- **Use Admin Panel → Plugins → Debug** to see uploaded files
- **Test theme switching** by changing the URL parameter
- **Verify transparency** works with the master toggle

## 📚 Examples

Check the HomeGlow repository for example widgets that demonstrate:
- API integration with CORS proxy
- Local storage usage
- Form handling
- Real-time updates
- Theme-aware styling

Happy widget development! 🎉