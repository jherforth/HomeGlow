# Bundled Inter

Inter (roman + italic variable fonts, woff2), licensed under the SIL Open
Font License 1.1 (see OFL.txt). The dashboard theme and the Date & Clock
widget name Inter, but nothing shipped it, so displays without Inter
installed fell back to their system sans.

Why two copies of the same files? The frontend and backend ship in
separate images that never share files:
- client/public/fonts/ serves containers: the frontend image serves
  /fonts/ from its build, which is what same-origin plugin frames and
  the dashboard itself load in production.
- server/fonts/ serves : dev plugin frames load from the
  backend origin, so the backend must answer /fonts/ itself.

Keep the copies in sync; they are the same bytes, converted from the
variable Inter TTFs with fonttools ().
