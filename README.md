# Harvest hour balance chrome extension

Harvest hour balance extension fetches your harvest hours and compares them to expected sum of hours (working days * 7,5).

By default it chooses the first day of current year as starting date, but you can customize it by selecting **"Choose starting date"**.

Hours from last two weeks are automatically re-fetched on every reload, so if you have entered hours for days prior those, use **"Reload"** option to reset the cache and reload all hours.

## Installation

Navigate to **chrome://extensions** and drag&drop **dist/Harvest.crx** to your browser window.

## Public holidays
All finnish public holidays are not counted as working days.
Additionally, Midsummer's Eve and Christmas Eve (24.12) are not counted as working days.

## Updating
Remember to reset your storage by hitting **"Reload"** after updating the plugin. 