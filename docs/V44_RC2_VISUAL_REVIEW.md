# v44 RC2 Visual Review

## Root cause

`.public-article a` had greater CSS specificity than `.button-link`. As a result, the inline-link brown color replaced the intended white text on dark action links.

## Surfaces reviewed

- Release Notes: `Periksa Status Sistem`
- Maintenance: `Periksa Status`
- 404: `Kembali ke Dashboard`
- System Status actions
- Dashboard primary and secondary action tokens
- Transactional email buttons

## Applied standard

- Dark primary surface: white text.
- Light secondary surface: dark text.
- Minimum interactive height: 44 px.
- Visible keyboard focus.
- Hover state must preserve minimum text contrast.
- 404 resources must resolve from the project root, not from the missing URL depth.
